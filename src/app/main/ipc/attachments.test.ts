import { EventEmitter } from "node:events";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import type {
  AttachmentReply,
  AttachmentRequest,
} from "../../contracts/attachments";
import { AppStorage } from "../wiring/app-storage";
import { createAttachmentService } from "../wiring/attachment-service";
import { registerAttachmentIpc } from "./attachments";

it.each(["destroyed", "render-process-gone", "navigation"])(
  "releases the actual document's asset leases on %s without granting an old lease in the next document",
  async (eventName) => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "dpi-history-ipc-")));
    const storage = AppStorage.open(join(root, "app.sqlite"));
    const service = createAttachmentService(
      storage,
      root,
      "unused",
      () => true,
      async () => null,
    );
    let loading = false;
    const sender = Object.assign(new EventEmitter(), {
      mainFrame: { processId: 1, routingId: 1, url: "file:///fixture" },
      isLoadingMainFrame: () => loading,
    });
    let invoke: (event: unknown, command: unknown) => Promise<AttachmentReply> =
      async () => {
        throw Error("no handler");
      };
    const context = {
      ipcMain: {
        handle: (_name: string, handler: typeof invoke) => {
          invoke = handler;
        },
      },
      sourceValid: () => true,
      getService: () => service,
      getDiagnostics: () => undefined,
    };
    registerAttachmentIpc(
      context as unknown as Parameters<typeof registerAttachmentIpc>[0],
    );
    try {
      const draft = storage.drafts.create(root);
      const identity = {
        threadId: draft.threadId,
        traceId: crypto.randomUUID(),
      };
      const request = (command: AttachmentRequest) =>
        invoke({ sender, senderFrame: sender.mainFrame }, command);
      const item = await service.store.importBytes(draft.threadId, {
        name: "source.txt",
        mimeType: "text/plain",
        source: "paste",
        bytes: new TextEncoder().encode("actual source"),
      });
      storage.drafts.save(draft.threadId, 0, item.token);
      const opened = await request({
        ...identity,
        kind: "history-open",
        epoch: crypto.randomUUID(),
      });
      if (opened.kind !== "history-lease") throw Error("missing lease");
      const update: AttachmentRequest = {
        ...identity,
        kind: "history-update",
        leaseId: opened.leaseId,
        version: 1,
        ids: [item.id],
      };
      expect((await request(update)).kind).toBe("history-lease");
      storage.drafts.save(draft.threadId, 1, "");
      sender.emit("did-start-navigation", {
        isMainFrame: true,
        isSameDocument: true,
      });
      expect(
        (await service.store.cleanStorage(draft.threadId)).deletedObjects,
      ).toBe(0);
      const reserved = await request({
        ...identity,
        kind: "clipboard-reserve",
      });
      if (reserved.kind !== "clipboard-tickets" || !reserved.tickets[0])
        throw Error("no clipboard ticket");
      const clipboardWait = request({
        ...identity,
        kind: "clipboard-import",
        ticket: reserved.tickets[0],
      });
      if (eventName === "navigation") {
        loading = true;
        sender.emit("did-start-navigation", {
          isMainFrame: true,
          isSameDocument: false,
          frame: sender.mainFrame,
          url: "file:///next",
        });
      } else sender.emit(eventName);
      expect(await clipboardWait).toMatchObject({
        kind: "clipboard-unavailable",
        reason: "invalid",
      });
      expect(
        await request({
          ...identity,
          kind: "clipboard-import",
          ticket: reserved.tickets[0],
        }),
      ).toMatchObject({ kind: "clipboard-unavailable" });
      expect(
        (await service.store.cleanStorage(draft.threadId)).deletedObjects,
      ).toBe(1);
      expect(await request({ ...update, version: 2 })).toMatchObject({
        kind: "unavailable",
        reason: "reference-denied",
      });
      if (eventName === "navigation") {
        expect(
          (
            await request({
              ...identity,
              kind: "history-open",
              epoch: crypto.randomUUID(),
            })
          ).kind,
        ).toBe("unavailable");
        loading = false;
        sender.emit("did-frame-finish-load", {}, true, 1, 1);
        expect(
          (
            await request({
              ...identity,
              kind: "history-open",
              epoch: crypto.randomUUID(),
            })
          ).kind,
        ).toBe("history-lease");
      }
    } finally {
      await service.close();
      storage.close();
      rmSync(root, { recursive: true, force: true });
    }
  },
);
