// @vitest-environment happy-dom
import { Editor } from "@tiptap/core";
import { redoDepth, undoDepth } from "@tiptap/pm/history";
import { afterEach, expect, it, vi } from "vitest";
import { captureSelection } from "../../../files/core/public";
import {
  type AttachmentBridge,
  AttachmentSchema,
  CLIPBOARD_MIME,
  DraftSchema,
} from "../../contracts/public";
import { AttachmentModel } from "../../core/attachments/attachment-model";
import { DraftController } from "../../core/draft-controller";
import {
  parseDraftBlocks,
  serializeReference,
} from "../../core/references/serialize";
import { AttachmentImports } from "../attachments/attachment-imports";
import { createTrustedClipboard } from "../clipboard/trusted-clipboard";
import { DraftEditorCache } from "../editor/draft-editor-cache";
import {
  draftDocument,
  plainTextEditorOptions,
} from "../editor/plain-text-editor";
import { AttachmentAdoption } from "./attachment-adoption";
import {
  createAttachmentEditor,
  createAttachmentImportTarget,
  projectDetachedImages,
  syncAttachmentLabels,
} from "./attachment-editor";

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});
function fixture(text = "draft", bridge?: AttachmentBridge) {
  const draft = DraftSchema.parse({
    schemaVersion: 1,
    revision: 0,
    text,
    threadId: crypto.randomUUID(),
    workingDirectoryId: crypto.randomUUID(),
    directory: "/fixture",
  });
  const saved: string[] = [];
  const controller = new DraftController(
    draft,
    async (revision, text) => {
      saved.push(text);
      return {
        kind: "saved",
        threadId: draft.threadId,
        revision: revision + 1,
      };
    },
    () => ({
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
    }),
  );
  const cache = new DraftEditorCache(undefined, bridge);
  function mount() {
    const element = document.createElement("div");
    document.body.append(element);
    const editor = new Editor({
      ...plainTextEditorOptions,
      element,
      content: draftDocument(
        controller.getEditorTextSnapshot?.() ?? controller.getTextSnapshot(),
      ),
      onBeforeCreate: ({ editor }) => {
        plainTextEditorOptions.onBeforeCreate({ editor });
        cache.bind(editor, "fixture", controller);
      },
    });
    cleanups.push(() => {
      editor.destroy();
      element.remove();
    });
    return editor;
  }
  const item = (mimeType: string, name: string) => {
    const id = crypto.randomUUID();
    return AttachmentSchema.parse({
      schemaVersion: 1,
      id,
      threadId: draft.threadId,
      token: `[[dpi-attachment:${id}]]`,
      name,
      mimeType,
      byteLength: 40,
      capturedAt: new Date().toISOString(),
      source: "file",
      status: "ready",
      representation: mimeType.startsWith("image/") ? "image" : "text",
      coverageGaps: [],
      textOnly: false,
      inputDigest: (name.startsWith("duplicate") ? "a" : "b").repeat(64),
    });
  };
  cleanups.push(() => {
    cache.dispose();
    controller.dispose();
  });
  return { controller, mount, item, saved };
}
it("image add/remove preserves the editor document, Undo depth and existing Redo branch", () => {
  const f = fixture();
  const editor = f.mount();
  editor.commands.insertContent("A");
  editor.commands.undo();
  const doc = editor.state.doc;
  const undo = undoDepth(editor.state);
  const redo = redoDepth(editor.state);
  const image = f.item("image/png", "image.png");
  expect(
    createAttachmentEditor(editor, () => true, {
      controller: f.controller,
    }).insert(image),
  ).toBe(true);
  expect(editor.state.doc).toBe(doc);
  expect(undoDepth(editor.state)).toBe(undo);
  expect(redoDepth(editor.state)).toBe(redo);
  expect(f.controller.getTextSnapshot()).toContain(image.token);
  expect(editor.commands.redo()).toBe(true);
  expect(f.controller.getTextSnapshot()).toContain(image.token);
  f.controller.removeDetachedAttachment(image.id);
  expect(editor.commands.undo()).toBe(true);
  expect(f.controller.getTextSnapshot()).not.toContain(image.token);
});
it("tracks image clone cleanup outside Undo and requires its real Main ACK before saving", async () => {
  const requests: Parameters<AttachmentBridge["request"]>[0][] = [];
  let fail = false;
  const f = fixture("draft", {
    request: async (command) => {
      requests.push(command);
      if (command.kind === "history-release")
        return fail
          ? { kind: "unavailable", reason: "storage-unavailable" }
          : { kind: "history-released" };
      if (command.kind === "history-open")
        return {
          kind: "history-lease",
          leaseId: crypto.randomUUID(),
          version: 0,
        };
      if (command.kind === "history-update")
        return {
          kind: "history-lease",
          leaseId: command.leaseId,
          version: command.version,
        };
      return { kind: "cancelled" };
    },
  });
  const editor = f.mount(),
    image = f.item("image/png", "clone.png");
  createAttachmentEditor(editor, () => true, {
    controller: f.controller,
  }).insert(image);
  await f.controller.flush();
  fail = true;
  f.controller.removeDetachedAttachment(image.id);
  expect(await f.controller.flush()).toBe(false);
  expect(
    requests.some(
      (command) =>
        command.kind === "history-release" &&
        command.releaseIds?.includes(image.id) &&
        !command.retainIds?.includes(image.id),
    ),
  ).toBe(true);
  expect(
    requests.some(
      (command) =>
        command.kind === "history-update" && command.ids.includes(image.id),
    ),
  ).toBe(false);
  fail = false;
  expect(await f.controller.retry()).toBe(true);
  expect(editor.can().undo()).toBe(false);
});
it("rehydrates legacy image tokens outside the editor and retains them despite malformed literal tokens", async () => {
  const f = fixture();
  const image = f.item("image/png", "cold.png");
  f.controller.edit(`before ${image.token} after [[dpi-attachment:literal]]`);
  const editor = f.mount();
  const adoption = new AttachmentAdoption(f.controller);
  adoption.register([image]);
  projectDetachedImages(editor, f.controller);
  expect(editor.getText()).not.toContain(image.token);
  expect(editor.can().undo()).toBe(false);
  editor.commands.insertContent("typed");
  expect(f.controller.getTextSnapshot()).toContain(image.token);
  expect(f.controller.getTextSnapshot()).toContain(
    "[[dpi-attachment:literal]]",
  );
  await f.controller.flush();
  expect(f.saved.at(-1)).toContain(image.token);
});
it("does not merge changed contents or distinct names and refuses foreign Thread adoption", () => {
  const f = fixture();
  const editor = f.mount();
  const adoption = new AttachmentAdoption(f.controller);
  const port = createAttachmentEditor(editor, () => true, {
    controller: f.controller,
    adoption,
  });
  const file = f.item("text/plain", "duplicate.txt");
  port.insert(file);
  const changed = {
    ...f.item("text/plain", "duplicate.txt"),
    inputDigest: "c".repeat(64),
  };
  const renamed = {
    ...f.item("text/plain", "renamed.txt"),
    inputDigest: file.inputDigest,
  };
  expect(port.applyBatch?.([changed, renamed])).toBe(true);
  expect(editor.getText()).toContain(changed.token);
  expect(editor.getText()).toContain(renamed.token);
  const doc = editor.state.doc;
  expect(port.insert({ ...file, threadId: crypto.randomUUID() })).toBe(false);
  expect(editor.state.doc).toBe(doc);
});
it("captures images immutably and consumes the matching image draft while preserving a newer image version", async () => {
  const f = fixture();
  const editor = f.mount();
  const port = createAttachmentEditor(editor, () => true, {
    controller: f.controller,
  });
  const image = f.item("image/png", "capture.png");
  port.insert(image);
  const captured = await f.controller.captureSubmission(
    crypto.randomUUID(),
    async () => true,
  );
  if (!captured) throw Error("missing frozen draft");
  const later = f.item("image/png", "new.png");
  port.insert(later);
  expect(captured.text).toContain(image.token);
  expect(captured.text).not.toContain(later.token);
  expect(f.controller.consumeSubmission(captured, () => true)).toBe(false);
  expect(f.controller.getTextSnapshot()).toContain(later.token);
  f.controller.releaseRejectedSubmission(captured.submissionId);
  const current = await f.controller.captureSubmission(
    crypto.randomUUID(),
    async () => true,
  );
  if (!current) throw Error("missing current capture");
  expect(f.controller.consumeSubmission(current, () => true)).toBe(true);
  expect(f.controller.getTextSnapshot()).toBe("");
});
it("trusted mixed paste undoes files and text only; a duplicate image paste preserves selection and Redo", async () => {
  const f = fixture();
  const editor = f.mount();
  const adoption = new AttachmentAdoption(f.controller);
  const image = f.item("image/png", "duplicate.png"),
    file = f.item("text/plain", "source.txt");
  let incoming = [image, file],
    text = `start${image.token}${file.token}end`;
  const discarded: string[][] = [];
  const ticket = {
    version: 1,
    instanceId: crypto.randomUUID(),
    handleId: crypto.randomUUID(),
    expiresAt: Date.now() + 10000,
  };
  const bridge: AttachmentBridge = {
    request: async (command) => {
      if (command.kind === "clipboard-import")
        return {
          kind: "clipboard-imported",
          text,
          items: incoming,
          degraded: false,
        };
      if (command.kind === "clipboard-discard") discarded.push(command.ids);
      return { kind: "cancelled" };
    },
  };
  const model = new AttachmentModel(bridge, f.controller.threadId);
  const clipboard = createTrustedClipboard({
    bridge,
    model,
    controller: f.controller,
    adoption,
    isCurrent: () => true,
    sequence: () => f.controller.getEditorSnapshot().sequence,
    onFeedback: () => {},
  });
  cleanups.push(() => {
    clipboard.dispose();
    model.dispose();
  });
  const event = {
    preventDefault() {},
    clipboardData: {
      types: [CLIPBOARD_MIME],
      getData: (format: string) =>
        format === CLIPBOARD_MIME ? JSON.stringify(ticket) : "",
      files: [],
    },
  } as unknown as ClipboardEvent;
  expect(clipboard.paste(editor.view, event)).toBe(true);
  await clipboard.settled();
  expect(editor.getText()).not.toContain(image.token);
  expect(editor.getText()).toContain(file.token);
  expect(editor.commands.undo()).toBe(true);
  expect(f.controller.getTextSnapshot()).toContain(image.token);
  expect(editor.getText()).toBe("draft");
  const clone = f.item("image/png", "duplicate.png");
  incoming = [clone];
  text = clone.token;
  editor.commands.selectAll();
  const doc = editor.state.doc,
    selection = editor.state.selection,
    redo = redoDepth(editor.state);
  clipboard.paste(editor.view, event);
  await clipboard.settled();
  expect(editor.state.doc).toBe(doc);
  expect(editor.state.selection.eq(selection)).toBe(true);
  expect(redoDepth(editor.state)).toBe(redo);
  expect(discarded).toEqual([[clone.id]]);
  expect(f.controller.getTextSnapshot()).not.toContain(clone.token);
});
it("mixed batches Undo only inline files and preserve images through cache remount and persistence", async () => {
  const f = fixture();
  const editor = f.mount();
  const image = f.item("image/png", "image.png"),
    file = f.item("text/plain", "note.txt");
  const target = createAttachmentImportTarget(editor, () => true, {
    controller: f.controller,
  });
  expect(target.apply([image, file])).toBe(true);
  expect(editor.getText()).toContain(file.token);
  expect(editor.getText()).not.toContain(image.token);
  expect(editor.commands.undo()).toBe(true);
  expect(f.controller.getTextSnapshot()).toContain(image.token);
  expect(f.controller.getTextSnapshot()).not.toContain(file.token);
  await f.controller.flush();
  expect(f.saved.at(-1)).toContain(image.token);
  editor.destroy();
  const next = f.mount();
  expect(next.commands.redo()).toBe(true);
  expect(f.controller.getTextSnapshot()).toContain(file.token);
  expect(f.controller.getTextSnapshot()).toContain(image.token);
  expect(next.getText()).not.toContain(image.token);
});
it("deduplicates repeated ID and same captured source without consuming selected text or history", () => {
  const f = fixture();
  const editor = f.mount();
  const port = createAttachmentEditor(editor, () => true, {
    controller: f.controller,
  });
  const file = f.item("text/plain", "duplicate.txt");
  expect(port.insert(file)).toBe(true);
  const depth = undoDepth(editor.state);
  editor.commands.setTextSelection({ from: 2, to: 4 });
  const doc = editor.state.doc;
  expect(port.insert(file)).toBe(true);
  expect(editor.state.doc).toBe(doc);
  const duplicateId = crypto.randomUUID();
  expect(
    port.insert({
      ...file,
      id: duplicateId,
      token: `[[dpi-attachment:${duplicateId}]]`,
    }),
  ).toBe(true);
  expect(editor.state.doc).toBe(doc);
  expect(undoDepth(editor.state)).toBe(depth);
});
it("releases duplicate import operations and retries the same release after a lost ACK", async () => {
  const f = fixture();
  const editor = f.mount();
  const existing = f.item("text/plain", "duplicate.txt");
  const adoption = new AttachmentAdoption(f.controller);
  const port = createAttachmentEditor(editor, () => true, {
    controller: f.controller,
    adoption,
  });
  port.insert(existing);
  const clone = f.item("text/plain", "duplicate.txt");
  const settle = vi
    .fn()
    .mockRejectedValueOnce(Error("lost ACK"))
    .mockResolvedValue(undefined);
  const imports = new AttachmentImports(async () => [clone], { settle });
  cleanups.push(() => imports.dispose());
  imports.importFiles(
    [new File(["body"], clone.name, { type: clone.mimeType })],
    "paste",
    createAttachmentImportTarget(editor, () => true, {
      controller: f.controller,
      adoption,
    }),
  );
  await vi.waitFor(() => expect(settle).toHaveBeenCalledOnce());
  expect(settle.mock.calls[0]?.[1]).toBe("release");
  expect(f.controller.getTextSnapshot()).not.toContain(clone.token);
  const job = imports.stateStore.getState().batches[0]?.jobs[0];
  if (!job) throw Error("missing source job");
  imports.retry(job.id);
  await vi.waitFor(() =>
    expect(imports.stateStore.getState().ready).toBe(true),
  );
  expect(settle.mock.calls[1]).toEqual(settle.mock.calls[0]);
});

it("keeps frozen source identity and literal image-looking source content when adding or removing an image", () => {
  const f = fixture();
  const image = f.item("image/png", "source.png");
  const selection = captureSelection(
    image.token,
    {
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: 1,
      endColumn: image.token.length + 1,
    },
    { path: "source.txt", source: "working-tree", version: "v1" },
  );
  if (selection.kind !== "selection") throw Error("invalid selection fixture");
  const original = serializeReference(selection);
  f.controller.edit(original);
  const editor = f.mount();
  createAttachmentEditor(editor, () => true, {
    controller: f.controller,
  }).insert(image);
  expect(
    parseDraftBlocks(f.controller.getTextSnapshot()).filter(
      (b) => b.kind === "selection",
    ),
  ).toEqual([{ kind: "selection", value: selection }]);
  expect(f.controller.getEditorTextSnapshot()).toBe(original);
  // Round-trip and explicit removal must not consume matching text inside frozen source.
  f.controller.editEditorText(original);
  f.controller.removeDetachedAttachment(image.id);
  expect(f.controller.getTextSnapshot()).toBe(original);
  expect(parseDraftBlocks(f.controller.getEditorTextSnapshot())).toEqual([
    { kind: "selection", value: selection },
  ]);
});
it("maps a pending insertion through late image classification without moving it past the following text", () => {
  const f = fixture();
  const image = f.item("image/png", "late.png");
  f.controller.edit(`A${image.token}BC`);
  const editor = f.mount();
  const target = createAttachmentImportTarget(editor, () => true, {
    position: 3,
    controller: f.controller,
  });
  new AttachmentAdoption(f.controller).register([image]);
  projectDetachedImages(editor, f.controller);
  const file = f.item("text/plain", "later.txt");
  expect(target.apply([file])).toBe(true);
  expect(editor.getText()).toBe(`A${file.token}BC`);
});
it("drops migrated images from the Undo lease before releasing an explicitly removed image", async () => {
  const commands: Parameters<AttachmentBridge["request"]>[0][] = [];
  const f = fixture("draft", {
    request: async (command) => {
      commands.push(command);
      if (command.kind === "history-open")
        return {
          kind: "history-lease",
          leaseId: crypto.randomUUID(),
          version: 0,
        };
      if (command.kind === "history-update")
        return {
          kind: "history-lease",
          leaseId: command.leaseId,
          version: command.version,
        };
      return { kind: "history-released" };
    },
  });
  const image = f.item("image/png", "legacy.png");
  f.controller.edit(`A${image.token}BC`);
  const editor = f.mount();
  editor.commands.insertContent("typed");
  editor.commands.undo();
  await f.controller.flush();
  new AttachmentAdoption(f.controller).register([image]);
  projectDetachedImages(editor, f.controller);
  f.controller.removeDetachedAttachment(image.id);
  expect(await f.controller.flush()).toBe(true);
  expect(editor.can().undo()).toBe(false);
  expect(editor.can().redo()).toBe(true);
  const lastUpdate = commands.filter((c) => c.kind === "history-update").at(-1);
  expect(lastUpdate).toMatchObject({ ids: [] });
  const lastRelease = commands
    .filter((c) => c.kind === "history-release")
    .at(-1);
  expect(lastRelease).toMatchObject({ releaseIds: [image.id], retainIds: [] });
});
it("keeps a trailing frozen block valid across image persistence and cold projection", () => {
  const f = fixture();
  const image = f.item("image/png", "next.png");
  const selection = captureSelection(
    "source",
    {
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: 1,
      endColumn: 7,
    },
    { path: "source.txt", source: "working-tree", version: "v1" },
  );
  if (selection.kind !== "selection") throw Error("invalid selection fixture");
  const original = serializeReference(selection);
  f.controller.edit(original);
  const editor = f.mount();
  createAttachmentEditor(editor, () => true, {
    controller: f.controller,
  }).insert(image);
  expect(
    parseDraftBlocks(f.controller.getTextSnapshot()).some(
      (b) => b.kind === "selection",
    ),
  ).toBe(true);
  const cold = fixture(f.controller.getTextSnapshot());
  const restored = cold.mount();
  cold.controller.registerDetachedAttachments([image.id]);
  projectDetachedImages(restored, cold.controller);
  expect(restored.state.doc.toJSON()).toEqual(editor.state.doc.toJSON());
  cold.controller.removeDetachedAttachment(image.id);
  expect(cold.controller.getTextSnapshot()).toBe(original);
});
it("retains image cleanup candidates until an epoch removal update is acknowledged", async () => {
  const commands: Parameters<AttachmentBridge["request"]>[0][] = [];
  let fail = false;
  const f = fixture("draft", {
    request: async (command) => {
      commands.push(command);
      if (command.kind === "history-open")
        return {
          kind: "history-lease",
          leaseId: crypto.randomUUID(),
          version: 0,
        };
      if (command.kind === "history-update")
        return fail
          ? { kind: "unavailable", reason: "storage-unavailable" }
          : {
              kind: "history-lease",
              leaseId: command.leaseId,
              version: command.version,
            };
      return { kind: "history-released" };
    },
  });
  const image = f.item("image/png", "legacy-ack.png");
  f.controller.edit(`A${image.token}BC`);
  const editor = f.mount();
  editor.commands.insertContent("typed");
  editor.commands.undo();
  await f.controller.flush();
  fail = true;
  const boundary = commands.length;
  new AttachmentAdoption(f.controller).register([image]);
  projectDetachedImages(editor, f.controller);
  f.controller.removeDetachedAttachment(image.id);
  expect(await f.controller.flush()).toBe(false);
  expect(
    commands
      .slice(boundary)
      .some(
        (c) => c.kind === "history-release" && c.releaseIds?.includes(image.id),
      ),
  ).toBe(false);
  fail = false;
  expect(await f.controller.retry()).toBe(true);
  expect(
    commands.filter((c) => c.kind === "history-release").at(-1),
  ).toMatchObject({ releaseIds: [image.id], retainIds: [] });
});
it("keeps private-token-shaped frozen source intact during trusted image paste", async () => {
  const f = fixture();
  const editor = f.mount(),
    image = f.item("image/png", "clipboard.png");
  const source = serializeReference({
    kind: "selection",
    path: "source.txt",
    source: "working-tree",
    version: "v1",
    startLine: 1,
    startColumn: 1,
    endLine: 1,
    endColumn: image.token.length + 1,
    text: image.token,
  });
  const bridge: AttachmentBridge = {
    request: async (command) =>
      command.kind === "clipboard-import"
        ? {
            kind: "clipboard-imported",
            text: `before${image.token}\n${source}`,
            items: [image],
            degraded: false,
          }
        : { kind: "cancelled" },
  };
  const model = new AttachmentModel(bridge, f.controller.threadId);
  const clipboard = createTrustedClipboard({
    bridge,
    model,
    controller: f.controller,
    isCurrent: () => true,
    sequence: () => f.controller.getEditorSnapshot().sequence,
    onFeedback: () => {},
  });
  cleanups.push(() => {
    clipboard.dispose();
    model.dispose();
  });
  const ticket = {
    version: 1,
    instanceId: crypto.randomUUID(),
    handleId: crypto.randomUUID(),
    expiresAt: Date.now() + 10000,
  };
  const event = {
    preventDefault() {},
    clipboardData: {
      types: [CLIPBOARD_MIME],
      getData: () => JSON.stringify(ticket),
      files: [],
    },
  } as unknown as ClipboardEvent;
  editor.commands.selectAll();
  clipboard.paste(editor.view, event);
  await clipboard.settled();
  const frozen = parseDraftBlocks(f.controller.getTextSnapshot()).find(
    (block) => block.kind === "selection",
  );
  expect(frozen).toMatchObject({
    kind: "selection",
    value: { text: image.token },
  });
  expect(f.controller.getDetachedAttachmentIds()).toEqual([image.id]);
});
it("classifies a saved middle image without rewriting the canonical snapshot or advancing its sequence", async () => {
  const f = fixture();
  const image = f.item("image/png", "saved-middle.png");
  const file = f.item("text/plain", "saved-file.txt");
  f.controller.edit(`A${image.token}B${file.token}C`);
  await f.controller.flush();
  const snapshot = f.controller.getTextSnapshot();
  const sequence = f.controller.getEditorSnapshot().sequence;
  const editor = f.mount();
  new AttachmentAdoption(f.controller).register([image]);
  projectDetachedImages(editor, f.controller);
  expect(editor.getText()).toBe(`AB${file.token}C`);
  expect(f.controller.getTextSnapshot()).toBe(snapshot);
  expect(f.controller.getEditorSnapshot().sequence).toBe(sequence);
  expect(f.controller.getSnapshot()).toEqual({ kind: "saved" });
  syncAttachmentLabels(editor, [image, file], "zh-CN");
  expect(f.controller.getTextSnapshot()).toBe(snapshot);
  expect(f.controller.getEditorSnapshot().sequence).toBe(sequence);
  expect(f.controller.getSnapshot()).toEqual({ kind: "saved" });
});
it("preserves authored blank paragraphs around frozen selections during image add, remove and cold restore", () => {
  const selection = serializeReference({
    kind: "selection",
    path: "source.txt",
    source: "working-tree",
    version: "v1",
    startLine: 1,
    startColumn: 1,
    endLine: 1,
    endColumn: 7,
    text: "source",
  });
  for (const original of [
    `\n${selection}`,
    `${selection}\n`,
    `\n${selection}\n`,
  ]) {
    const f = fixture(original);
    const editor = f.mount(),
      image = f.item("image/png", "empty-line.png");
    const before = editor.state.doc.toJSON();
    f.controller.addDetachedAttachments([image.id]);
    expect(f.controller.getEditorTextSnapshot()).toBe(original);
    const cold = fixture(f.controller.getTextSnapshot());
    const restored = cold.mount();
    cold.controller.registerDetachedAttachments([image.id]);
    projectDetachedImages(restored, cold.controller);
    expect(restored.state.doc.toJSON()).toEqual(before);
    cold.controller.removeDetachedAttachment(image.id);
    expect(cold.controller.getTextSnapshot()).toBe(original);
  }
});
