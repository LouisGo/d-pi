// @vitest-environment happy-dom
import { existsSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Editor } from "@tiptap/core";
import { expect, it } from "vitest";
import { AppStorage } from "../../src/app/main/wiring/app-storage";
import { createAttachmentService } from "../../src/app/main/wiring/attachment-service";
import { createAttachmentBridge } from "../../src/app/preload/bridges/attachments";
import {
  type AttachmentBridge,
  AttachmentRequestSchema,
  CLIPBOARD_MIME,
  type ClipboardTicket,
} from "../../src/modules/input/contracts/public";
import {
  AttachmentModel,
  DraftController,
} from "../../src/modules/input/core/public";
import { bindHistoryAdmission } from "../../src/modules/input/renderer/editor/edit-action-history";
import {
  createAttachmentEditor,
  createTrustedClipboard,
  DraftEditorCache,
  draftDocument,
  insertAttachmentReference,
  plainTextEditorOptions,
  replaceDraftText,
} from "../../src/modules/input/renderer/public";

async function handoffFixture(threads = 8, failUpdates = false) {
  const root = realpathSync(
    mkdtempSync(join(tmpdir(), "dpi-clipboard-ownership-")),
  );
  const storage = AppStorage.open(join(root, "app.sqlite"));
  const service = createAttachmentService(
    storage,
    root,
    "unused",
    () => true,
    async () => null,
  );
  const source = storage.drafts.create(root),
    target = storage.drafts.create(root);
  const item = await service.store.importBytes(source.threadId, {
    name: "image.png",
    mimeType: "image/png",
    source: "paste",
    bytes: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ1EAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  storage.drafts.save(source.threadId, 0, item.token);
  const reserved = await service.execute(
    {
      kind: "clipboard-reserve",
      threadId: source.threadId,
      traceId: crypto.randomUUID(),
    },
    "source-doc",
  );
  if (reserved.kind !== "clipboard-tickets" || !reserved.tickets[0])
    throw Error("ticket");
  const ticket = reserved.tickets[0];
  expect(
    await service.execute(
      {
        kind: "clipboard-export",
        threadId: source.threadId,
        traceId: crypto.randomUUID(),
        ticket,
        text: item.token,
        ids: [item.id],
      },
      "source-doc",
    ),
  ).toMatchObject({ kind: "clipboard-exported" });
  let released: () => void = () => {};
  const releaseDone = new Promise<void>((resolve) => {
    released = resolve;
  });
  const bridge: AttachmentBridge = createAttachmentBridge({
    invoke: async (_channel, raw: unknown) => {
      const cmd = AttachmentRequestSchema.parse(raw);
      if (failUpdates && cmd.kind === "history-update")
        return { kind: "unavailable", reason: "storage-unavailable" };
      const result = await service.execute(cmd, "target-doc");
      if (cmd.kind === "history-release") released();
      return result;
    },
  }).attachments;
  const controller = new DraftController(
    storage.drafts.read(target.threadId),
    async (revision, text) => {
      const saved = storage.drafts.save(target.threadId, revision, text);
      if (saved === null) throw Error("conflict");
      return { kind: "saved", threadId: target.threadId, revision: saved };
    },
    () => {
      throw Error("transport");
    },
  );
  const cache = new DraftEditorCache(
    { threads, documentBytes: 4 * 1024 * 1024 },
    bridge,
  );
  const model = new AttachmentModel(bridge, target.threadId);
  const editor = new Editor({
    ...plainTextEditorOptions,
    element: document.createElement("div"),
    content: draftDocument(""),
    onBeforeCreate: ({ editor }) => {
      plainTextEditorOptions.onBeforeCreate({ editor });
      cache.bind(editor, target.threadId, controller);
    },
  });
  const clipboard = createTrustedClipboard({
    bridge,
    model,
    isCurrent: () => true,
    sequence: () => controller.getEditorSnapshot().sequence,
    onFeedback: () => {},
  });
  clipboard.bindEditor(editor);
  const event = {
    clipboardData: {
      types: [CLIPBOARD_MIME, "text/plain"],
      files: [],
      getData: (kind: string) =>
        kind === CLIPBOARD_MIME ? JSON.stringify(ticket) : "image",
    },
    preventDefault() {},
  } as unknown as ClipboardEvent;
  expect(clipboard.paste(editor.view, event)).toBe(true);
  await clipboard.settled();
  await cache.retryHistory(target.threadId);
  const clone = (await service.store.list(target.threadId))[0];
  if (!clone) throw Error("clone");
  // Remove every source authority; target clone/epoch are now the only owners.
  storage.drafts.save(source.threadId, 1, "");
  service.store.releaseEditorHistories("source-doc");
  const object = join(
    root,
    "content",
    "objects",
    item.inputDigest ?? "missing",
  );
  return {
    storage,
    service,
    source,
    target,
    controller,
    cache,
    model,
    editor,
    clipboard,
    clone,
    object,
    releaseDone,
    event,
    async close() {
      clipboard.dispose();
      editor.destroy();
      cache.dispose();
      controller.dispose();
      model.dispose();
      await service.close();
      storage.close();
      rmSync(root, { recursive: true, force: true });
    },
  };
}

it("does not hide failed abandoned-clone release when the next genuine editor source is observed", async () => {
  const f = await handoffFixture();
  const execute = f.service.execute;
  let releaseCalls = 0,
    failRelease = true;
  f.service.execute = async (cmd, owner) => {
    if (cmd.kind === "history-release") {
      releaseCalls++;
      if (failRelease)
        return { kind: "unavailable", reason: "storage-unavailable" };
    }
    return execute(cmd, owner);
  };
  try {
    expect(f.editor.commands.undo()).toBe(true);
    expect(await f.controller.flush()).toBe(true);
    expect(await f.cache.clearHistory(f.target.threadId)).toBe(false);
    expect(f.cache.historyState(f.target.threadId).failed).toBe(true);
    failRelease = false;
    const fresh = await f.service.store.importBytes(f.target.threadId, {
      name: "fresh.png",
      mimeType: "image/png",
      source: "paste",
      bytes: Buffer.concat([
        Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ1EAAAAASUVORK5CYII=",
          "base64",
        ),
        Buffer.from("fresh"),
      ]),
    });
    f.editor.view.dispatch(insertAttachmentReference(f.editor.state, fresh));
    const retry = await f.cache.retryHistory(f.target.threadId);

    expect(releaseCalls).toBe(2);
    expect(retry).toBe(true);
    expect(
      (await f.service.store.cleanStorage(f.target.threadId)).deletedObjects,
    ).toBe(1);
  } finally {
    f.service.execute = execute;
    await f.close();
  }
});

it("releases the failed original lease on a second real clear", async () => {
  const f = await handoffFixture();
  const execute = f.service.execute;
  let calls = 0;
  f.service.execute = async (cmd, owner) => {
    if (cmd.kind === "history-release" && ++calls === 1)
      return { kind: "unavailable", reason: "storage-unavailable" };
    return execute(cmd, owner);
  };
  try {
    expect(f.editor.commands.undo()).toBe(true);
    expect(await f.controller.flush()).toBe(true);
    expect(await f.cache.clearHistory(f.target.threadId)).toBe(false);
    expect(await f.cache.clearHistory(f.target.threadId)).toBe(true);
    const cleanup = await f.service.store.cleanStorage(f.target.threadId);

    expect(cleanup.deletedObjects).toBe(1);
  } finally {
    f.service.execute = execute;
    await f.close();
  }
});

it("retries a failed abandoned-epoch release after actual editor cache eviction", async () => {
  const f = await handoffFixture(0);
  const execute = f.service.execute;
  let calls = 0;
  let next: Editor | undefined;
  f.service.execute = async (cmd, owner) => {
    if (cmd.kind === "history-release" && ++calls === 1)
      return { kind: "unavailable", reason: "storage-unavailable" };
    return execute(cmd, owner);
  };
  try {
    expect(f.editor.commands.undo()).toBe(true);
    expect(await f.controller.flush()).toBe(true);
    f.editor.destroy();
    for (let i = 0; i < 10 && calls === 0; i++) await Promise.resolve();
    expect(calls).toBe(1);
    next = new Editor({
      ...plainTextEditorOptions,
      element: document.createElement("div"),
      content: draftDocument(""),
      onBeforeCreate: ({ editor }) => {
        plainTextEditorOptions.onBeforeCreate({ editor });
        f.cache.bind(editor, f.target.threadId, f.controller);
      },
    });
    const retry = await f.cache.retryHistory(f.target.threadId);
    const cleanup = await f.service.store.cleanStorage(f.target.threadId);

    expect(calls).toBe(2);
    expect(cleanup.deletedObjects).toBe(1);
  } finally {
    next?.destroy();
    f.service.execute = execute;
    await f.close();
  }
});

function transportFailure() {
  return {
    errorId: crypto.randomUUID(),
    traceId: crypto.randomUUID(),
    code: "storage-unavailable",
    category: "storage",
    observedAt: "renderer",
    reportedBy: "app",
    attribution: "unknown",
    handlingOwner: "draft",
    recovery: "retry_safe",
    message: { code: "draft.storageUnavailable" },
  } as const;
}
async function ownerBudgetFixture(threads: number, unavailable: boolean) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "dpi-history-budget-")));
  const storage = AppStorage.open(join(root, "app.sqlite"));
  const service = createAttachmentService(
    storage,
    root,
    "unused",
    () => true,
    async () => null,
  );
  let failRelease = unavailable;
  let hold: Promise<void> | undefined;
  let release: () => void = () => {};
  const bridge = createAttachmentBridge({
    invoke: async (_channel, raw: unknown) => {
      const cmd = AttachmentRequestSchema.parse(raw);
      if (cmd.kind === "history-release") {
        if (failRelease)
          return { kind: "unavailable", reason: "storage-unavailable" };
        await hold;
      }
      return service.execute(cmd, "budget-doc");
    },
  }).attachments;
  const cache = new DraftEditorCache(
    { threads, documentBytes: 4 * 1024 * 1024 },
    bridge,
  );
  const editors: Editor[] = [],
    controllers: DraftController[] = [];
  async function create() {
    const draft = storage.drafts.create(root);
    const item = await service.store.importBytes(draft.threadId, {
      name: "budget.png",
      mimeType: "image/png",
      source: "paste",
      bytes: Buffer.concat([
        Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ1EAAAAASUVORK5CYII=",
          "base64",
        ),
        Buffer.from(draft.threadId),
      ]),
    });
    storage.drafts.save(draft.threadId, 0, item.token);
    const controller = new DraftController(
      storage.drafts.read(draft.threadId),
      async (revision, text) => {
        const saved = storage.drafts.save(draft.threadId, revision, text);
        if (saved === null) throw Error("conflict");
        return { kind: "saved", threadId: draft.threadId, revision: saved };
      },
      transportFailure,
    );
    const editor = new Editor({
      ...plainTextEditorOptions,
      element: document.createElement("div"),
      content: draftDocument(item.token),
      onBeforeCreate: ({ editor }) => {
        plainTextEditorOptions.onBeforeCreate({ editor });
        cache.bind(editor, draft.threadId, controller);
      },
    });
    editors.push(editor);
    controllers.push(controller);
    return {
      ...draft,
      item,
      controller,
      editor,
      object: join(root, "content", "objects", item.inputDigest ?? "missing"),
    };
  }
  return {
    storage,
    service,
    cache,
    create,
    resume: () => {
      failRelease = false;
      release();
      hold = undefined;
    },
    hold: () => {
      hold = new Promise<void>((resolve) => {
        release = resolve;
      });
    },
    async close() {
      failRelease = false;
      release();
      hold = undefined;
      for (const editor of editors) editor.destroy();
      cache.dispose();
      for (const controller of controllers) controller.dispose();
      await service.close();
      storage.close();
      rmSync(root, { recursive: true, force: true });
    },
  };
}

it("retains actual Undo dependencies while nine failed retired owners block admission, then ACKs them before save", async () => {
  const f = await ownerBudgetFixture(0, true);
  try {
    const retired = [];
    let ticket: ClipboardTicket | undefined;
    for (let i = 0; i < 9; i++) {
      const source = await f.create();
      retired.push(source);
      if (i === 0) {
        const reserved = await f.service.execute(
          {
            kind: "clipboard-reserve",
            threadId: source.threadId,
            traceId: crypto.randomUUID(),
          },
          "budget-copy",
        );
        if (reserved.kind !== "clipboard-tickets" || !reserved.tickets[0])
          throw Error("ticket");
        ticket = reserved.tickets[0];
        expect(
          await f.service.execute(
            {
              kind: "clipboard-export",
              threadId: source.threadId,
              traceId: crypto.randomUUID(),
              ticket,
              text: source.editor.getText(),
              ids: [source.item.id],
            },
            "budget-copy",
          ),
        ).toMatchObject({ kind: "clipboard-exported" });
      }
      source.editor.view.dispatch(source.editor.state.tr.delete(1, 2));
      expect(await source.controller.flush()).toBe(true);
      source.editor.destroy();
      expect(await f.cache.retryHistory(source.threadId)).toBe(false);
    }
    const target = await f.create();
    target.editor.view.dispatch(target.editor.state.tr.delete(1, 2));
    expect(target.editor.getText()).toBe("");
    if (!ticket) throw Error("ticket");
    const imported = await f.service.execute(
      {
        kind: "clipboard-import",
        threadId: target.threadId,
        traceId: crypto.randomUUID(),
        ticket,
      },
      "budget-doc",
    );
    if (imported.kind !== "clipboard-imported" || !imported.items[0])
      throw Error("clone");
    const clone = imported.items[0];
    target.editor.view.dispatch(
      insertAttachmentReference(target.editor.state, clone).setMeta(
        "dpiIndependentAction",
        true,
      ),
    );
    expect(target.editor.getText()).toBe(clone.token);
    expect(f.storage.drafts.read(target.threadId).text).toBe(target.item.token);
    f.service.store.releaseEditorHistories("budget-copy");
    target.editor.view.dispatch(
      target.editor.state.tr.delete(1, 2).setMeta("dpiIndependentAction", true),
    );
    expect(f.cache.historyState(target.threadId)).toMatchObject({
      failed: true,
      limited: true,
    });
    expect(await target.controller.flush()).toBe(false);
    expect(await f.cache.clearHistory(retired[0]!.threadId)).toBe(false);
    await f.service.store.cleanStorage(target.threadId);
    expect(existsSync(target.object)).toBe(true);
    retired[0]!.controller.edit("inactive text");
    expect(await retired[0]!.controller.flush()).toBe(false);
    f.resume();
    expect(await f.cache.retryHistory(target.threadId)).toBe(true);
    expect(await target.controller.retry()).toBe(true);
    await f.service.store.cleanStorage(target.threadId);
    expect(existsSync(target.object)).toBe(true);
    expect(target.editor.commands.undo()).toBe(true);
    expect(target.editor.getText()).toBe(clone.token);
    expect(
      await f.service.store.preview(target.threadId, clone.id),
    ).toMatchObject({ kind: "image" });
    expect(target.editor.commands.undo()).toBe(true);
    expect(target.editor.commands.undo()).toBe(true);
    expect(target.editor.getText()).toBe(target.item.token);
    expect(
      await f.service.store.preview(target.threadId, target.item.id),
    ).toMatchObject({ kind: "image" });
    // The original inactive Thread save barrier also retires only after ACK.
    expect(await retired[0]!.controller.retry()).toBe(true);
  } finally {
    await f.close();
  }
});

it("naturally admits the tenth normal Thread after the LRU owner's real Main ACK without manual retry", async () => {
  const f = await ownerBudgetFixture(8, false);
  try {
    for (let i = 0; i < 9; i++) {
      const source = await f.create();
      source.editor.view.dispatch(source.editor.state.tr.insertText("a", 2));
      expect(await source.controller.flush()).toBe(true);
      if (i === 8) f.hold();
      source.editor.destroy();
    }
    const target = await f.create();
    expect(f.cache.historyState(target.threadId)).toMatchObject({
      pending: true,
      failed: false,
    });
    target.editor.view.dispatch(target.editor.state.tr.delete(1, 2));
    let saved = false;
    const saving = target.controller.flush().then((ok) => {
      saved = ok;
      return ok;
    });
    await Promise.resolve();
    expect(saved).toBe(false);
    f.resume();
    expect(await saving).toBe(true);
    expect(f.cache.historyState(target.threadId)).toMatchObject({
      pending: false,
      failed: false,
    });
    await f.service.store.cleanStorage(target.threadId);
    expect(existsSync(target.object)).toBe(true);
    expect(target.editor.commands.undo()).toBe(true);
    expect(target.editor.getText()).toBe(target.item.token);
  } finally {
    await f.close();
  }
});

it("bounds waiting owners and verifies a trusted consumption replacement in the actual rejected editor", async () => {
  const f = await ownerBudgetFixture(0, true);
  try {
    for (let i = 0; i < 9; i++) {
      const source = await f.create();
      source.editor.view.dispatch(source.editor.state.tr.delete(1, 2));
      await source.controller.flush();
      source.editor.destroy();
      await f.cache.retryHistory(source.threadId);
    }
    for (let i = 0; i < 9; i++) await f.create();
    const denied = await f.create();
    expect(denied.editor.isEditable).toBe(false);
    const before = denied.editor.getText();
    denied.editor.commands.insertContent("ordinary input");
    expect(denied.editor.getText()).toBe(before);
    expect(await f.cache.clearHistory(denied.threadId)).toBe(false);
    expect(await f.cache.retryHistory(denied.threadId)).toBe(false);
    denied.controller.edit("accepted consumption");
    expect(replaceDraftText(denied.editor, "accepted consumption")).toBe(true);
    expect(denied.editor.getText()).toBe("accepted consumption");
    expect(denied.editor.commands.undo()).toBe(false);
    expect(await denied.controller.flush()).toBe(false);
    f.resume();
    expect(await f.cache.retryHistory(denied.threadId)).toBe(false); // the other nine now own all slots
    expect(denied.editor.getText()).toBe("accepted consumption");
  } finally {
    await f.close();
  }
});

it.each([true, false])(
  "retargets cleanup to a genuine new Controller's current body (retain=%s)",
  async (retain) => {
    const f = await handoffFixture();
    const execute = f.service.execute;
    let failRelease = true;
    let next: Editor | undefined, controller: DraftController | undefined;
    f.service.execute = async (cmd, owner) =>
      cmd.kind === "history-release" && failRelease
        ? { kind: "unavailable", reason: "storage-unavailable" }
        : execute(cmd, owner);
    try {
      expect(await f.cache.clearHistory(f.target.threadId)).toBe(false);
      controller = new DraftController(
        f.storage.drafts.read(f.target.threadId),
        async (revision, text) => {
          const saved = f.storage.drafts.save(
            f.target.threadId,
            revision,
            text,
          );
          if (saved === null) throw Error("conflict");
          return {
            kind: "saved",
            threadId: f.target.threadId,
            revision: saved,
          };
        },
        transportFailure,
      );
      if (retain) controller.edit(f.clone.token);
      const owner = controller;
      next = new Editor({
        ...plainTextEditorOptions,
        element: document.createElement("div"),
        content: draftDocument(owner.getTextSnapshot()),
        onBeforeCreate: ({ editor }) => {
          plainTextEditorOptions.onBeforeCreate({ editor });
          f.cache.bind(editor, f.target.threadId, owner);
        },
      });
      failRelease = false;
      expect(await f.cache.retryHistory(f.target.threadId)).toBe(true);
      await f.service.store.cleanStorage(f.target.threadId);
      expect(existsSync(f.object)).toBe(retain);
      const latest = owner.getTextSnapshot();
      f.editor.commands.insertContent("late old editor");
      expect(owner.getTextSnapshot()).toBe(latest);
      next.commands.insertContent("new owner");
      expect(owner.getTextSnapshot()).toContain("new owner");
      expect(await owner.flush()).toBe(true);
    } finally {
      next?.destroy();
      controller?.dispose();
      f.service.execute = execute;
      await f.close();
    }
  },
);

it.each([false, true])(
  "discards rejected Main clones, retaining failed cleanup for explicit retry (fail=%s)",
  async (fail) => {
    const f = await handoffFixture();
    const execute = f.service.execute;
    let discarded = 0;
    f.service.execute = async (cmd, owner) => {
      if (cmd.kind === "clipboard-discard") {
        discarded += cmd.ids.length;
        if (fail && discarded === cmd.ids.length)
          return { kind: "unavailable", reason: "storage-unavailable" };
      }
      return execute(cmd, owner);
    };
    const removeGate = bindHistoryAdmission(f.editor, (tr) => !tr?.docChanged);
    try {
      const before = f.editor.state.doc;
      expect(f.editor.isEditable).toBe(true);
      const item = (await f.service.store.list(f.source.threadId))[0]!;
      const reserved = await f.service.execute(
        {
          kind: "clipboard-reserve",
          threadId: f.source.threadId,
          traceId: crypto.randomUUID(),
        },
        "new-source-doc",
      );
      if (reserved.kind !== "clipboard-tickets" || !reserved.tickets[0])
        throw Error("ticket");
      const ticket = reserved.tickets[0];
      expect(
        await f.service.execute(
          {
            kind: "clipboard-export",
            threadId: f.source.threadId,
            traceId: crypto.randomUUID(),
            ticket,
            text: item.token,
            ids: [item.id],
          },
          "new-source-doc",
        ),
      ).toMatchObject({ kind: "clipboard-exported" });
      const event = {
        clipboardData: {
          types: [CLIPBOARD_MIME, "text/plain"],
          files: [],
          getData: (kind: string) =>
            kind === CLIPBOARD_MIME ? JSON.stringify(ticket) : "image",
        },
        preventDefault() {},
      } as unknown as ClipboardEvent;
      expect(f.clipboard.paste(f.editor.view, event)).toBe(true);
      await f.clipboard.settled();
      expect(f.editor.state.doc).toBe(before);
      expect(discarded).toBe(1);
      if (fail) {
        expect(f.model.getReadiness()).toEqual({
          kind: "blocked",
          reason: "failed-source",
        });
        expect(f.model.stateStore.getState().failed?.command).toMatchObject({
          kind: "clipboard-discard",
          ids: [expect.any(String)],
        });
        f.model.removeFailure();
        expect(f.model.getReadiness().kind).toBe("blocked");
        expect(await f.model.retryFailure()).toMatchObject({
          kind: "cancelled",
        });
        expect(discarded).toBe(2);
      }
      expect(f.model.getReadiness()).toEqual({ kind: "ready" });
      f.service.store.releaseEditorHistories("new-source-doc");
      removeGate();
      f.controller.edit("");
      expect(replaceDraftText(f.editor, "")).toBe(true);
      expect(await f.cache.retryHistory(f.target.threadId)).toBe(true);
      expect(
        (await f.service.store.cleanStorage(f.target.threadId)).deletedObjects,
      ).toBe(1);
    } finally {
      removeGate();
      f.service.execute = execute;
      await f.close();
    }
  },
);

it("keeps a real imported attachment as uninserted when the PM gate rejects and applies it after admission", async () => {
  const f = await handoffFixture();
  const fresh = await f.service.store.importBytes(f.target.threadId, {
    name: "uninserted.png",
    mimeType: "image/png",
    source: "paste",
    bytes: Buffer.concat([
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ1EAAAAASUVORK5CYII=",
        "base64",
      ),
      Buffer.from("uninserted"),
    ]),
  });
  const removeGate = bindHistoryAdmission(f.editor, (tr) => !tr?.docChanged);
  const detach = f.model.attachEditor(
    createAttachmentEditor(f.editor, () => true),
  );
  try {
    const before = f.editor.state.doc;
    f.model.insert(fresh);
    expect(f.editor.state.doc).toBe(before);
    expect(f.model.getReadiness()).toEqual({
      kind: "blocked",
      reason: "uninserted-source",
    });
    expect(
      f.model.stateStore.getState().insertions.map((entry) => entry.item.id),
    ).toEqual([fresh.id]);
    removeGate();
    f.model.flushInsertions();
    expect(f.editor.getText()).toContain(fresh.token);
    expect(f.model.getReadiness()).toEqual({ kind: "ready" });
  } finally {
    removeGate();
    detach();
    await f.close();
  }
});

it("keeps a reinserted clone protected when new epoch update fails while old cleanup is retried", async () => {
  const f = await handoffFixture();
  const execute = f.service.execute;
  let failRelease = true,
    failUpdate = false;
  f.service.execute = async (cmd, owner) =>
    (cmd.kind === "history-release" && failRelease) ||
    (cmd.kind === "history-update" && failUpdate)
      ? { kind: "unavailable", reason: "storage-unavailable" }
      : execute(cmd, owner);
  try {
    f.editor.view.dispatch(f.editor.state.tr.delete(1, 2));
    expect(await f.cache.clearHistory(f.target.threadId)).toBe(false);
    failUpdate = true;
    f.editor.view.dispatch(insertAttachmentReference(f.editor.state, f.clone));
    failRelease = false;
    expect(await f.cache.retryHistory(f.target.threadId)).toBe(false);
    expect(f.cache.historyState(f.target.threadId).failed).toBe(true);
    await f.service.store.cleanStorage(f.target.threadId);
    expect(existsSync(f.object)).toBe(true);
    expect(
      await f.service.store.preview(f.target.threadId, f.clone.id),
    ).toMatchObject({ kind: "image" });
    failUpdate = false;
    expect(await f.cache.retryHistory(f.target.threadId)).toBe(true);
    f.editor.view.dispatch(f.editor.state.tr.delete(1, 2));
    expect(await f.cache.clearHistory(f.target.threadId)).toBe(true);
    expect(
      (await f.service.store.cleanStorage(f.target.threadId)).deletedObjects,
    ).toBe(1);
  } finally {
    f.service.execute = execute;
    await f.close();
  }
});
