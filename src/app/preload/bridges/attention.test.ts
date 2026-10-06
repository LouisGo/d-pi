import { expect, it, vi } from "vitest";
import { createAttentionBridge } from "./attention";

const snapshot = () => ({
  instanceId: crypto.randomUUID(),
  revision: 1,
  entries: [],
  preferences: { system: false, completion: false },
  system: "disabled" as const,
  coverageGap: false,
  openRequest: null,
});

it("refuses a foreign request trace and a preferences acknowledgement with different values", async () => {
  const invoke = vi.fn();
  const { attention } = createAttentionBridge({
    invoke,
    on: vi.fn(),
    removeListener: vi.fn(),
  });
  const traceId = crypto.randomUUID();
  invoke.mockResolvedValueOnce({
    kind: "snapshot",
    traceId: crypto.randomUUID(),
    snapshot: snapshot(),
  });
  await expect(
    attention.request({ kind: "snapshot", traceId }),
  ).rejects.toMatchObject({
    code: "invalid-reply",
    traceId,
  });
  invoke.mockResolvedValueOnce({
    kind: "snapshot",
    traceId,
    snapshot: snapshot(),
  });
  await expect(
    attention.request({
      kind: "preferences",
      traceId,
      value: { system: true, completion: false },
    }),
  ).rejects.toMatchObject({ code: "invalid-reply", traceId });
});

it("validates updates and removes the exact subscription without exposing the Electron event", () => {
  const on = vi.fn();
  const removeListener = vi.fn();
  const listener = vi.fn();
  const { attention } = createAttentionBridge({
    invoke: vi.fn(),
    on,
    removeListener,
  });
  const unsubscribe = attention.subscribe(listener);
  const handler = on.mock.calls[0]?.[1];
  const state = snapshot();
  handler(
    { sender: "private" },
    { ...state, entries: [{ secret: "private" }] },
  );
  expect(listener).not.toHaveBeenCalled();
  handler({ sender: "private" }, state);
  expect(listener).toHaveBeenCalledExactlyOnceWith(state);
  unsubscribe();
  expect(removeListener).toHaveBeenCalledExactlyOnceWith(
    "attention:state",
    handler,
  );
});

it("rejects malformed input before IPC and preserves request identity on transport failure", async () => {
  const invoke = vi.fn().mockRejectedValue(Error("unavailable"));
  const { attention } = createAttentionBridge({
    invoke,
    on: vi.fn(),
    removeListener: vi.fn(),
  });
  const traceId = crypto.randomUUID();
  await expect(
    attention.request({ kind: "snapshot", traceId: "invalid" }),
  ).rejects.toThrow();
  expect(invoke).not.toHaveBeenCalled();
  await expect(
    attention.request({ kind: "snapshot", traceId }),
  ).rejects.toMatchObject({ code: "transport-unavailable", traceId });
});
