import { EventEmitter } from "node:events";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
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
  registerAttachmentIpc({
    ipcMain: {
      handle: (_name: string, handler: typeof invoke) => {
        invoke = handler;
      },
    },
    sourceValid: () => true,
    getService: () => service,
    getDiagnostics: () => undefined,
  } as unknown as Parameters<typeof registerAttachmentIpc>[0]);
  const request = (
    command: Record<string, unknown>,
    frame = sender.mainFrame,
  ) =>
    invoke(
      { sender, senderFrame: frame },
      { ...command, threadId: draft.threadId, traceId: crypto.randomUUID() },
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
it("aborted main navigation resumes the current frame with a fresh owner and never restores old lease", async () => {
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
    ).toMatchObject({ kind: "unavailable", reason: "reference-denied" });
  } finally {
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
