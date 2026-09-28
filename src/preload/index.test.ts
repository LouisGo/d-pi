import { beforeEach, expect, it, vi } from "vitest";
import type { DesktopBridge } from "../shared/contracts";
import { ThreadIdSchema } from "../shared/contracts";

const shell = vi.hoisted(() => ({
  expose: vi.fn<(name: string, bridge: DesktopBridge) => void>(),
  on: vi.fn<(channel: string, handler: (...args: unknown[]) => void) => void>(),
  remove: vi.fn(),
  invoke: vi.fn(),
  send: vi.fn(),
}));
vi.mock("electron", () => ({
  contextBridge: { exposeInMainWorld: shell.expose },
  ipcRenderer: {
    on: shell.on,
    removeListener: shell.remove,
    invoke: shell.invoke,
    send: shell.send,
  },
}));
beforeEach(() => vi.resetModules());

it("close cancellation strips privileged event arguments and unsubscribes its wrapper", async () => {
  await import("./index");
  const bridge = shell.expose.mock.calls[0]?.[1];
  if (!bridge) throw new Error("bridge not exposed");
  const listener = vi.fn();
  const unsubscribe = bridge.onCloseCancelled(listener);
  const handler = shell.on.mock.calls.at(-1)?.[1];
  if (!handler) throw new Error("handler not registered");
  handler({ sender: "privileged" }, "unexpected payload");
  expect(listener.mock.calls).toEqual([[]]);
  unsubscribe();
  expect(shell.remove).toHaveBeenCalledWith("draft:close-cancelled", handler);
});

it("traces a rejected receipt with the original request identity without logging body or raw errors", async () => {
  await import("./index");
  const bridge = shell.expose.mock.calls[0]?.[1];
  if (!bridge) throw new Error("bridge not exposed");
  shell.send.mockClear();
  const command = {
    kind: "save" as const,
    traceId: crypto.randomUUID(),
    threadId: ThreadIdSchema.parse(crypto.randomUUID()),
    expectedRevision: 4,
    text: "PRIVATE BODY",
  };
  // Structurally valid but wrong for this command: must not be called confirmed.
  shell.invoke.mockResolvedValueOnce({
    kind: "saved",
    threadId: command.threadId,
    revision: 99,
  });
  await expect(bridge.request(command)).rejects.toThrow();
  const events = shell.send.mock.calls
    .filter(([channel]) => channel === "draft:diagnostic")
    .map(([, event]) => event);
  expect(events).toHaveLength(2);
  expect(events[0]).toMatchObject({
    traceId: command.traceId,
    stage: "initiated",
  });
  expect(events[1]).toMatchObject({
    traceId: command.traceId,
    stage: "acknowledgement-failed",
    code: "invalid-reply",
  });
  expect(events[0].requestId).toBe(events[1].requestId);
  expect(JSON.stringify(events)).not.toContain("PRIVATE BODY");
  shell.send.mockClear();
  shell.invoke.mockRejectedValueOnce(new Error("SECRET RAW ERROR"));
  await expect(bridge.request(command)).rejects.toThrow();
  expect(JSON.stringify(shell.send.mock.calls)).not.toContain(
    "SECRET RAW ERROR",
  );
  expect(shell.send).toHaveBeenLastCalledWith(
    "draft:diagnostic",
    expect.objectContaining({
      stage: "acknowledgement-failed",
      code: "transport-unavailable",
    }),
  );
  shell.invoke.mockResolvedValueOnce({
    kind: "saved",
    threadId: command.threadId,
    revision: 5,
  });
  shell.send.mockImplementationOnce(() => {
    throw new Error("diagnostics unavailable");
  });
  await expect(bridge.request(command)).resolves.toMatchObject({
    kind: "saved",
    revision: 5,
  });
});
