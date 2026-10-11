import type { IpcRenderer } from "electron";
import { expect, it, vi } from "vitest";
import { createProjectReadBridge } from "./project-reads";

it.each(["tool", "image", "project-list", "project-read"] as const)(
  "validates the %s operation envelope and its correlated identity",
  async (kind) => {
    const identity = {
      operationId: crypto.randomUUID(),
      traceId: crypto.randomUUID(),
    };
    const threadId = crypto.randomUUID();
    const readerId = crypto.randomUUID();
    const invoke = vi.fn();
    const bridge = createProjectReadBridge({
      invoke,
    } as unknown as IpcRenderer).history;
    const reply =
      kind === "tool"
        ? { kind: "tool-unavailable", readerId, reason: "missing" }
        : kind === "project-list"
          ? { kind: "catalog", sessions: [], partial: false }
          : { kind: "unavailable", reason: "missing" };
    const request = () => {
      if (kind === "tool")
        return bridge.requestTool?.({
          ...identity,
          threadId,
          readerId,
          cursor: null,
          source: {
            kind: "native-record",
            threadId,
            nativeSessionKey: "session",
            recordId: "record",
            revision: "version",
          },
        });
      if (kind === "image")
        return bridge.requestImage?.({
          ...identity,
          threadId,
          cursor: { threadId, source: "version", offset: 1 },
          recordId: "record",
          index: 0,
        });
      if (kind === "project-list")
        return bridge.requestProjectList?.({
          ...identity,
          kind: "list",
          threadId,
        });
      return bridge.requestProjectRead?.({
        ...identity,
        kind: "read",
        threadId,
        key: "a".repeat(64),
        cursor: null,
      });
    };
    invoke.mockResolvedValueOnce({ kind: "completed", ...identity, reply });
    await expect(request()).resolves.toMatchObject({
      kind: "completed",
      ...identity,
      reply,
    });
    expect(invoke.mock.calls[0]?.[1]).toMatchObject({ ...identity, threadId });
    invoke.mockResolvedValueOnce({
      kind: "completed",
      ...identity,
      operationId: crypto.randomUUID(),
      reply,
    });
    await expect(request()).rejects.toMatchObject({ code: "invalid-reply" });
    invoke.mockResolvedValueOnce({ kind: "acknowledged", ...identity });
    await expect(bridge.cancelRead?.(identity)).resolves.toMatchObject(
      identity,
    );
    expect(invoke.mock.calls.at(-1)?.[0]).toBe("history:cancel");
  },
);

it("routes history through correlated operation envelopes and exact cancellation identity", async () => {
  const invoke = vi.fn(
    async (
      _channel: string,
      request: { operationId: string; traceId: string },
    ) => ({
      kind: "completed",
      operationId: request.operationId,
      traceId: request.traceId,
      reply: { kind: "unavailable", reason: "missing" },
    }),
  );
  const bridge = createProjectReadBridge({
    invoke,
  } as unknown as IpcRenderer).history;
  const threadId = crypto.randomUUID();
  await expect(bridge.read(threadId, null, "tail")).resolves.toEqual({
    kind: "unavailable",
    reason: "missing",
  });
  expect(invoke.mock.calls[0]?.[0]).toBe("history:read");
  expect(invoke.mock.calls[0]?.[1]).toMatchObject({
    threadId,
    cursor: null,
    range: "tail",
    operationId: expect.any(String),
    traceId: expect.any(String),
  });
  const identity = {
    operationId: crypto.randomUUID(),
    traceId: crypto.randomUUID(),
  };
  invoke.mockResolvedValueOnce({
    kind: "completed",
    ...identity,
    operationId: crypto.randomUUID(),
    reply: { kind: "unavailable", reason: "missing" },
  });
  await expect(
    bridge.requestRead?.({ ...identity, threadId, cursor: null }),
  ).rejects.toMatchObject({ code: "invalid-reply" });
});

it("accepts correlated read envelopes and rejects another operation's completed reply", async () => {
  const invoke = vi.fn();
  const bridge = createProjectReadBridge({ invoke } as unknown as IpcRenderer);
  if (!bridge.files) throw Error("Missing file bridge");
  const command = {
    kind: "read" as const,
    path: "a.ts",
    threadId: crypto.randomUUID(),
    operationId: crypto.randomUUID(),
    traceId: crypto.randomUUID(),
  };
  const response = {
    kind: "completed",
    operationId: command.operationId,
    traceId: command.traceId,
    reply: { kind: "unavailable", reason: "missing" },
  };
  invoke.mockResolvedValueOnce(response);
  await expect(bridge.files.request(command)).resolves.toEqual(response);
  invoke.mockResolvedValueOnce({
    ...response,
    operationId: crypto.randomUUID(),
  });
  await expect(bridge.files.request(command)).rejects.toMatchObject({
    code: "invalid-reply",
  });
});
