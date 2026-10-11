import { randomUUID } from "node:crypto";
import type { IpcMainInvokeEvent } from "electron";
import { expect, it, vi } from "vitest";
import { RuntimeViewSchema } from "../../../modules/execution/contracts/public";
import { ThreadIdSchema } from "../../../shared/identity";
import type { NotificationCallbacks } from "../lifecycle/system-notifications";
import { ThreadAttention } from "../wiring/thread-attention";
import { registerAttentionIpc } from "./attention";

const threadId = ThreadIdSchema.parse(randomUUID());
function setup() {
  let handler:
    | ((event: IpcMainInvokeEvent, raw: unknown) => Promise<unknown>)
    | undefined;
  let generation = 1;
  let notification: NotificationCallbacks | undefined;
  const savePreferences = vi.fn(),
    record = vi.fn(),
    sourceValid = vi.fn(() => true);
  const attention = new ThreadAttention({
    getActiveThread: () => threadId,
    readPreferences: () => ({ system: false, completion: false }),
    savePreferences,
    systemNotifications: {
      supported: () => true,
      show: (_text, value) => {
        notification = value;
        return () => {};
      },
    },
    getText: () => ({ title: "d-pi", body: "Thread" }),
    openWindow: vi.fn(),
  });
  registerAttentionIpc({
    ipcMain: {
      handle: vi.fn((_channel, listener) => {
        handler = listener;
      }),
    },
    sourceValid,
    getSourceGeneration: () => generation,
    getAttention: () => attention,
    isKnownThread: (id) => id === threadId,
    getActiveThread: () => threadId,
    getWriterId: () => randomUUID(),
    record,
  });
  const event = {
    senderFrame: { url: "file:///trusted", processId: 1, routingId: 2 },
  } as IpcMainInvokeEvent;
  return {
    request: (raw: unknown) => handler!(event, raw),
    attention,
    savePreferences,
    record,
    sourceValid,
    advance: () => generation++,
    click: () => notification?.click(),
  };
}
it("fences activation completion by the registered renderer and actual IPC generation", async () => {
  const f = setup(),
    rendererId = randomUUID();
  f.attention.setPreferences({ system: true, completion: false });
  f.attention.observeRuntime(
    RuntimeViewSchema.parse({
      threadId,
      traceId: randomUUID(),
      revision: 1,
      phase: "failed",
      trusted: true,
      busy: false,
      model: null,
      configuration: { code: "runtime.configDefault" },
      message: { code: "runtime.disconnected" },
    }),
  );
  f.click();
  expect(f.attention.snapshot().openRequest).toBeNull();
  await f.request({
    kind: "activation-ready",
    rendererId,
    ready: true,
    traceId: randomUUID(),
  });
  const id = f.attention.snapshot().openRequest!.id;
  f.advance();
  expect(
    await f.request({
      kind: "opened",
      id,
      rendererId,
      outcome: "located",
      traceId: randomUUID(),
    }),
  ).toMatchObject({ kind: "failed", code: "invalid-request" });
  expect(f.attention.snapshot().openRequest?.id).toBe(id);
  f.attention.clearVisible();
  await f.request({
    kind: "activation-ready",
    rendererId,
    ready: true,
    traceId: randomUUID(),
  });
  expect(
    await f.request({
      kind: "opened",
      id,
      rendererId,
      outcome: "target-unavailable",
      traceId: randomUUID(),
    }),
  ).toMatchObject({ kind: "snapshot", snapshot: { openRequest: null } });
  expect(f.record).toHaveBeenLastCalledWith(
    expect.objectContaining({
      operation: "attention:opened",
      stage: "completed",
      code: "target-unavailable",
    }),
  );
  f.attention.dispose();
});
it("rejects source before parsing and fences a reload before preferences commit", async () => {
  const f = setup();
  f.sourceValid.mockReturnValue(false);
  await expect(f.request(null)).rejects.toThrow("Invalid attention source");
  f.sourceValid.mockReturnValue(true);
  const traceId = randomUUID();
  const pending = f.request({
    kind: "preferences",
    traceId,
    value: { system: true, completion: false },
  });
  f.advance();
  expect(await pending).toEqual({
    kind: "failed",
    traceId,
    code: "source-changed",
  });
  expect(f.savePreferences).not.toHaveBeenCalled();
  expect(f.record).toHaveBeenLastCalledWith(
    expect.objectContaining({
      traceId,
      stage: "failed",
      code: "source-changed",
    }),
  );
});
it("rejects unknown thread, extra payload, malformed requests with same valid trace and preserves current snapshot", async () => {
  const f = setup(),
    traceId = randomUUID();
  const prior = f.attention.snapshot();
  expect(
    await f.request({ kind: "visible", traceId, threadId: randomUUID() }),
  ).toEqual({ kind: "failed", traceId, code: "invalid-request" });
  expect(
    await f.request({ kind: "snapshot", traceId, path: "/private/secret" }),
  ).toEqual({ kind: "failed", traceId, code: "invalid-request" });
  expect(f.attention.snapshot()).toEqual(prior);
  expect(f.record).toHaveBeenLastCalledWith(
    expect.objectContaining({
      traceId,
      stage: "failed",
      code: "invalid-request",
    }),
  );
});
it("storage failure retains previous preferences and successful commands preserve shared trace", async () => {
  const f = setup(),
    traceId = randomUUID();
  f.savePreferences.mockImplementationOnce(() => {
    throw Error("secret raw sqlite error");
  });
  expect(
    await f.request({
      kind: "preferences",
      traceId,
      value: { system: true, completion: true },
    }),
  ).toEqual({ kind: "failed", traceId, code: "storage-unavailable" });
  expect(f.attention.snapshot().preferences).toEqual({
    system: false,
    completion: false,
  });
  expect(await f.request({ kind: "snapshot", traceId })).toMatchObject({
    kind: "snapshot",
    traceId,
  });
  expect(f.record).toHaveBeenLastCalledWith(
    expect.objectContaining({ traceId, stage: "completed" }),
  );
});
