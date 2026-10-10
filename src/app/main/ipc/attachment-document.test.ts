import { EventEmitter } from "node:events";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import {
  DraftController,
  EditorHistoryModel,
} from "../../../modules/input/core/public";
import type { AttachmentReply } from "../../contracts/attachments";
import { AppStorage } from "../wiring/app-storage";
import { createAttachmentService } from "../wiring/attachment-service";
import { registerAttachmentIpc } from "./attachments";

vi.mock("electron", () => ({ utilityProcess: {} }));
function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "dpi-document-")));
  const storage = AppStorage.open(join(root, "app.sqlite"));
  const service = createAttachmentService(
    storage,
    root,
    "unused",
    () => true,
    async () => null,
  );
  const draft = storage.drafts.create(root);
  let loading = false;
  const sender = Object.assign(new EventEmitter(), {
    mainFrame: { processId: 10, routingId: 20, url: "file:///fixture" },
    isLoadingMainFrame: () => loading,
  });
  let invoke: (event: unknown, command: unknown) => Promise<AttachmentReply> =
    async () => {
      throw Error("missing invoke");
    };
  const record = vi.fn();
  registerAttachmentIpc({
    ipcMain: {
      handle: (_name: string, handler: typeof invoke) => {
        invoke = handler;
      },
    },
    sourceValid: () => true,
    getService: () => service,
    getDiagnostics: () => ({ record, processInstanceId: crypto.randomUUID() }),
  } as unknown as Parameters<typeof registerAttachmentIpc>[0]);
  const request = (
    command: Record<string, unknown>,
    frame = sender.mainFrame,
  ) =>
    invoke(
      { sender, senderFrame: frame },
      { threadId: draft.threadId, traceId: crypto.randomUUID(), ...command },
    );
  const start = (url: string) => {
    loading = true;
    sender.emit("did-start-navigation", {
      isMainFrame: true,
      isSameDocument: false,
      frame: sender.mainFrame,
      url,
    });
  };
  return {
    draft,
    storage,
    service,
    record,
    sender,
    request,
    start,
    setLoading: (value: boolean) => {
      loading = value;
    },
    close: async () => {
      await service.close();
      storage.close();
      rmSync(root, { recursive: true, force: true });
    },
  };
}
it("aborted provisional navigation preserves the unchanged document's lease", async () => {
  const f = fixture();
  try {
    const old = await f.request({
      kind: "history-open",
      epoch: crypto.randomUUID(),
    });
    if (old.kind !== "history-lease") throw Error("missing old lease");
    f.start("file:///cancelled");
    expect(
      await f.request({ kind: "history-open", epoch: crypto.randomUUID() }),
    ).toMatchObject({ kind: "unavailable", reason: "reference-denied" });
    f.setLoading(false);
    // Loading can already be false before the navigation's terminal event.
    // A request alone cannot establish which document ultimately owns the frame.
    expect(
      await f.request({ kind: "history-open", epoch: crypto.randomUUID() }),
    ).toMatchObject({ kind: "unavailable", reason: "reference-denied" });
    f.sender.emit(
      "did-fail-provisional-load",
      {},
      -3,
      "ERR_ABORTED",
      "file:///cancelled",
      true,
      10,
      20,
    );
    f.sender.emit("did-stop-loading");
    const fresh = await f.request({
      kind: "history-open",
      epoch: crypto.randomUUID(),
    });
    expect(fresh.kind).toBe("history-lease");
    expect(
      await f.request({
        kind: "history-update",
        leaseId: old.leaseId,
        version: 1,
        ids: [],
      }),
    ).toMatchObject({ kind: "history-lease", leaseId: old.leaseId });
  } finally {
    await f.close();
  }
});

it("a same-frame redirect commit revokes the old document lease", async () => {
  const f = fixture();
  try {
    const old = await f.request({
      kind: "history-open",
      epoch: crypto.randomUUID(),
    });
    if (old.kind !== "history-lease") throw Error("missing lease");
    f.start("file:///redirect-start");
    f.sender.mainFrame.url = "file:///redirect-final";
    f.sender.emit(
      "did-frame-navigate",
      {},
      "file:///redirect-final",
      200,
      "",
      true,
      10,
      20,
    );
    f.setLoading(false);
    f.sender.emit("did-stop-loading");
    expect(
      await f.request({
        kind: "history-update",
        leaseId: old.leaseId,
        version: 1,
        ids: [],
      }),
    ).toMatchObject({ kind: "unavailable", reason: "history-lease-expired" });
    expect(
      (await f.request({ kind: "history-open", epoch: crypto.randomUUID() }))
        .kind,
    ).toBe("history-lease");
  } finally {
    await f.close();
  }
});

it("keeps the failed IPC trace through deletion and saves the remaining draft after revoked-lease recovery", async () => {
  const f = fixture();
  const model = new EditorHistoryModel(
    { request: (command) => f.request(command) },
    f.draft.threadId,
    () => {},
  );
  const controller = new DraftController(
    f.draft,
    async (revision, text) => {
      const saved = f.storage.drafts.save(f.draft.threadId, revision, text);
      if (saved === null) throw Error("conflict");
      return { kind: "saved", threadId: f.draft.threadId, revision: saved };
    },
    () => {
      throw Error("must not invent a save diagnostic");
    },
  );
  controller.registerSaveBarrier({
    ready: () => model.ready(),
    prepare: (retry) => (retry ? model.retry() : model.ensure()),
    failure: () => model.failure(),
  });
  try {
    const first = await f.service.store.importBytes(f.draft.threadId, {
      name: "first.md",
      mimeType: "text/plain",
      source: "file",
      bytes: new TextEncoder().encode("original content"),
    });
    const failed = await f.service.store.importBytes(f.draft.threadId, {
      name: "failed.bin",
      mimeType: "",
      source: "file",
      bytes: new Uint8Array([0, 1, 2]),
    });
    model.observe([first.id]);
    expect(await model.ensure()).toBe(true);
    const owner = f.record.mock.calls.find(
      ([event]) =>
        event.operation === "attachments:history-open" &&
        event.stage === "received",
    )?.[0].connectionId;
    if (!owner) throw Error("missing actual document identity");
    f.service.store.releaseEditorHistories(owner);
    model.observe([failed.id]);
    expect(await model.ensure()).toBe(false);
    controller.edit("remaining text without the removed attachment");
    expect(await controller.flush()).toBe(false);
    const state = controller.getSnapshot();
    if (state.kind !== "failed") throw Error("missing failure");
    expect(state.error.causeCode).toBe("history-lease-expired");
    expect(
      f.record.mock.calls.some(
        ([event]) =>
          event.traceId === state.error.traceId &&
          event.operation === "attachments:history-update" &&
          event.stage === "failed" &&
          event.code === state.error.causeCode,
      ),
    ).toBe(true);
    expect(await controller.retry()).toBe(true);
    expect(f.storage.drafts.read(f.draft.threadId).text).toBe(
      "remaining text without the removed attachment",
    );
    expect(controller.getSnapshot()).toEqual({ kind: "saved" });
  } finally {
    model.dispose();
    await model.ensure();
    controller.dispose();
    await f.close();
  }
});
it("late old-frame finish and failed prior navigation cannot release a newer active navigation fence", async () => {
  const f = fixture();
  try {
    await f.request({ kind: "history-open", epoch: crypto.randomUUID() });
    const oldFrame = f.sender.mainFrame;
    f.start("file:///first");
    f.start("file:///second");
    f.sender.emit(
      "did-fail-provisional-load",
      {},
      -3,
      "ERR_ABORTED",
      "file:///first",
      true,
      10,
      20,
    );
    f.sender.emit("did-frame-finish-load", {}, true, 99, 99);
    expect(
      await f.request({ kind: "history-open", epoch: crypto.randomUUID() }),
    ).toMatchObject({ kind: "unavailable", reason: "reference-denied" });
    f.sender.mainFrame = {
      processId: 11,
      routingId: 21,
      url: "file:///second",
    };
    f.sender.emit(
      "did-frame-navigate",
      {},
      "file:///second",
      200,
      "",
      true,
      11,
      21,
    );
    expect(
      await f.request(
        { kind: "history-open", epoch: crypto.randomUUID() },
        oldFrame,
      ),
    ).toMatchObject({ kind: "unavailable", reason: "reference-denied" });
    expect(
      (await f.request({ kind: "history-open", epoch: crypto.randomUUID() }))
        .kind,
    ).toBe("history-lease");
  } finally {
    await f.close();
  }
});
