import { expect, it, vi } from "vitest";
import { ThreadIdSchema } from "../../../../shared/identity";
import type { Attachment, AttachmentReply } from "../../contracts/public";
import { AttachmentModel } from "./attachment-model";

const threadId = ThreadIdSchema.parse("f9b0037d-1b8b-4f82-988c-7ca64f93fa37");
const item: Attachment = {
  schemaVersion: 1,
  id: crypto.randomUUID(),
  threadId,
  token: "",
  name: "source.txt",
  mimeType: "text/plain",
  byteLength: 4,
  capturedAt: new Date().toISOString(),
  source: "file",
  status: "ready",
  representation: "text",
  coverageGaps: [],
  textOnly: false,
};
item.token = `[[dpi-attachment:${item.id}]]`;
it("retains required-source failure without a view and resolves only explicit retry or removal", async () => {
  let retry = false;
  const request = vi.fn(
    async (
      command: import("../../contracts/public").AttachmentRequest,
    ): Promise<AttachmentReply> => {
      if (command.kind === "choose-import")
        return retry
          ? { kind: "attachments", items: [item] }
          : { kind: "unavailable", reason: "source-too-large" };
      return { kind: "attachments", items: [] };
    },
  );
  const model = new AttachmentModel({ request }, threadId);
  await model.run({ kind: "choose-import" }, true);
  expect(model.getReadiness()).toEqual({
    kind: "blocked",
    reason: "failed-source",
  });
  await model.run({ kind: "check-storage" });
  expect(model.stateStore.getState().failed?.reason).toBe("source-too-large");
  await model.run({ kind: "choose-import" }, true);
  expect(
    request.mock.calls.filter(([c]) => c.kind === "choose-import"),
  ).toHaveLength(1);
  retry = true;
  await model.retryFailure();
  expect(model.stateStore.getState().failed).toBeNull();
  expect(model.getReadiness()).toEqual({
    kind: "blocked",
    reason: "uninserted-source",
  });
  const inserted: string[] = [];
  model.attachEditor({
    insert: (source) => {
      inserted.push(source.token);
      return true;
    },
  });
  expect(inserted).toEqual([item.token]);
  expect(model.getReadiness()).toEqual({ kind: "ready" });
});
it("retains late completions on the original Thread and accepts independent editor ports without React or DOM", async () => {
  let finish: (reply: AttachmentReply) => void = () => {};
  const model = new AttachmentModel(
    {
      request: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    },
    threadId,
  );
  const old = vi.fn(() => true);
  const detach = model.attachEditor({ insert: old });
  const operation = model.run({ kind: "choose-import" }, true);
  expect(model.getReadiness()).toEqual({ kind: "blocked", reason: "pending" });
  detach();
  finish({ kind: "attachments", items: [item] });
  await operation;
  expect(old).not.toHaveBeenCalled();
  expect(model.getReadiness()).toEqual({
    kind: "blocked",
    reason: "uninserted-source",
  });
  // A plain string-backed editor is sufficient for the same operation contract.
  let body = "draft ";
  const release = model.attachEditor({
    insert: (source) => {
      body += source.token;
      return true;
    },
  });
  expect(body).toBe(`draft ${item.token}`);
  release();
  let atoms = 0;
  model.attachEditor({
    insert: () => {
      atoms++;
      return true;
    },
  });
  expect(atoms).toBe(0);
  const foreign = { ...item, threadId: crypto.randomUUID() };
  model.insert(foreign);
  expect(atoms).toBe(0);
  expect(model.getReadiness()).toEqual({ kind: "ready" });
});
it("retains a cancelled failed retry and ignores completion after explicit Thread disposal", async () => {
  const model = new AttachmentModel(
    {
      request: vi
        .fn()
        .mockResolvedValueOnce({
          kind: "unavailable",
          reason: "source-too-large",
        })
        .mockResolvedValueOnce({ kind: "cancelled" }),
    },
    threadId,
  );
  await model.run({ kind: "choose-import" }, true);
  await model.retryFailure();
  expect(model.getReadiness().kind).toBe("blocked");
  model.removeFailure();
  expect(model.getReadiness().kind).toBe("ready");
  let finish: (reply: AttachmentReply) => void = () => {};
  const disposed = new AttachmentModel(
    {
      request: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    },
    threadId,
  );
  const insert = vi.fn(() => true);
  disposed.attachEditor({ insert });
  const operation = disposed.run({ kind: "choose-import" }, true);
  disposed.dispose();
  finish({ kind: "attachments", items: [item] });
  await operation;
  expect(insert).not.toHaveBeenCalled();
  expect(disposed.getReadiness()).toEqual({
    kind: "blocked",
    reason: "disposed",
  });
});

it("allows explicit removal of a prepared source whose editor insertion is no longer applicable", async () => {
  const model = new AttachmentModel(
    { request: async () => ({ kind: "attachments", items: [item] }) },
    threadId,
  );
  model.attachEditor({ insert: () => false });
  await model.run({ kind: "add-reference", path: "source.txt" }, true, {
    from: 1,
    to: 8,
  });
  expect(model.getReadiness()).toEqual({
    kind: "blocked",
    reason: "uninserted-source",
  });
  model.removeInsertion(item.id);
  expect(model.getReadiness()).toEqual({ kind: "ready" });
});

it("keeps an imported manifest failure in headless readiness while that source is in the current draft, and clears only its explicit Main retry", async () => {
  let ready = false;
  const model = new AttachmentModel(
    {
      request: async () => ({
        kind: "attachments",
        items: [
          {
            ...item,
            status: ready ? "ready" : "failed",
            ...(ready ? {} : { reason: "pdf-conversion-failed" as const }),
          },
        ],
      }),
    },
    threadId,
  );
  model.attachEditor({ insert: () => true });
  await model.run({ kind: "choose-import" }, true);
  expect(model.getReadiness([item.id])).toEqual({
    kind: "blocked",
    reason: "failed-source",
  });
  expect(model.getReadiness([])).toEqual({ kind: "ready" });
  ready = true;
  await model.run({ kind: "retry", id: item.id });
  expect(model.getReadiness([item.id])).toEqual({ kind: "ready" });
  model.dispose();
});

it("preserves another required source failure while rejected clipboard cleanup waits for its own ACK", async () => {
  let chooseFailed = true,
    discardFailed = true;
  const id = crypto.randomUUID();
  const model = new AttachmentModel(
    {
      request: async (cmd) => {
        if (cmd.kind === "choose-import")
          return chooseFailed
            ? { kind: "unavailable", reason: "source-too-large" }
            : { kind: "attachments", items: [] };
        return discardFailed
          ? { kind: "unavailable", reason: "storage-unavailable" }
          : { kind: "cancelled" };
      },
    },
    threadId,
  );
  await model.run({ kind: "choose-import" });
  await model.run({ kind: "clipboard-discard", ids: [id] });
  expect(model.stateStore.getState().failed?.command.kind).toBe(
    "choose-import",
  );
  chooseFailed = false;
  await model.retryFailure();
  expect(model.stateStore.getState().failed?.command).toEqual({
    kind: "clipboard-discard",
    ids: [id],
  });
  expect(
    await model.run({
      kind: "clipboard-import",
      ticket: {
        version: 1,
        instanceId: crypto.randomUUID(),
        handleId: crypto.randomUUID(),
        expiresAt: Date.now() + 10000,
      },
    }),
  ).toBeNull();
  model.removeFailure();
  expect(model.getReadiness().kind).toBe("blocked");
  discardFailed = false;
  expect(await model.retryFailure()).toMatchObject({ kind: "cancelled" });
  expect(model.getReadiness()).toEqual({ kind: "ready" });
});
