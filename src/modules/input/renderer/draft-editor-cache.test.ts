// @vitest-environment happy-dom
import { Editor } from "@tiptap/core";
import { closeHistory, undoDepth } from "@tiptap/pm/history";
import { afterEach, expect, it } from "vitest";
import { DraftSchema } from "../contracts/public";
import { DraftController } from "../core/draft-controller";
import { DraftEditorCache } from "./draft-editor-cache";
import { draftDocument, plainTextEditorOptions } from "./plain-text-editor";

const editors: Editor[] = [];
const controllers: DraftController[] = [];
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
  for (const controller of controllers.splice(0)) controller.dispose();
  document.body.replaceChildren();
});

function controller(text = "body") {
  const draft = DraftSchema.parse({
    schemaVersion: 1,
    threadId: crypto.randomUUID(),
    workingDirectoryId: crypto.randomUUID(),
    directory: "/fixture",
    revision: 0,
    text,
  });
  const result = new DraftController(
    draft,
    async (revision) => ({
      kind: "saved",
      threadId: draft.threadId,
      revision: revision + 1,
    }),
    () => {
      throw Error("unexpected transport error");
    },
  );
  controllers.push(result);
  return result;
}

function attach(cache: DraftEditorCache, key: string, draft: DraftController) {
  const element = document.createElement("div");
  document.body.append(element);
  const editor = new Editor({
    ...plainTextEditorOptions,
    element,
    content: draftDocument(draft.getTextSnapshot()),
    onBeforeCreate: ({ editor }) => {
      plainTextEditorOptions.onBeforeCreate({ editor });
      cache.bind(editor, key, draft);
    },
  });
  editors.push(editor);
  return editor;
}

it("evicts the least recently used of eight Thread states without deleting draft bodies", async () => {
  const cache = new DraftEditorCache();
  const drafts = Array.from({ length: 9 }, () => controller());
  const draftAt = (index: number) => {
    const draft = drafts[index];
    if (!draft) throw Error("missing fixture draft");
    return draft;
  };
  for (let index = 0; index < 8; index++) {
    const editor = attach(cache, String(index), draftAt(index));
    editor.commands.insertContent(String(index));
    await draftAt(index).flush();
    editor.destroy();
  }
  // Visiting 0 refreshes it; adding 8 must evict 1 instead.
  const visited = attach(cache, "0", draftAt(0));
  expect(visited.can().undo()).toBe(true);
  visited.destroy();
  const added = attach(cache, "8", draftAt(8));
  added.commands.insertContent("8");
  await draftAt(8).flush();
  added.destroy();
  const evicted = attach(cache, "1", draftAt(1));
  expect(evicted.getText()).toBe("1body");
  expect(evicted.can().undo()).toBe(false);
  const recent = attach(cache, "0", draftAt(0));
  expect(recent.commands.undo()).toBe(true);
  expect(recent.getText()).toBe("body");
  cache.dispose();
});

it("bounds cached UTF-8 body estimates and omits an oversized state while preserving its draft", async () => {
  const cache = new DraftEditorCache({ threads: 8, documentBytes: 20 });
  const a = controller("🙂🙂");
  const b = controller("🙂🙂");
  const c = controller("🙂🙂🙂🙂🙂🙂");
  for (const [key, draft] of [
    ["a", a],
    ["b", b],
    ["c", c],
  ] as const) {
    const editor = attach(cache, key, draft);
    editor.commands.insertContent("🙂");
    await draft.flush();
    editor.destroy();
  }
  expect(attach(cache, "a", a).can().undo()).toBe(false);
  expect(attach(cache, "b", b).can().undo()).toBe(true);
  const oversized = attach(cache, "c", c);
  expect(oversized.getText()).toBe("🙂🙂🙂🙂🙂🙂🙂");
  expect(oversized.can().undo()).toBe(false);
  cache.dispose();
});

it("rejects changed edit sequence and revision even when the body is identical", async () => {
  const cache = new DraftEditorCache();
  const draft = controller();
  const editor = attach(cache, "a", draft);
  editor.commands.insertContent("new ");
  await draft.flush();
  editor.destroy();
  draft.edit(draft.getTextSnapshot());
  await draft.flush();
  const restored = attach(cache, "a", draft);
  expect(restored.getText()).toBe("new body");
  expect(restored.can().undo()).toBe(false);
  cache.dispose();
});

it("keeps deferred editor events bound to A and cannot let a destroyed stale view overwrite a newer A", async () => {
  const cache = new DraftEditorCache();
  const a = controller("A");
  const b = controller("B");
  const old = attach(cache, "a", a);
  old.commands.insertContent("first ");
  cache.capture(old);
  const second = attach(cache, "b", b);
  second.commands.insertContent("second ");
  // A late edit still belongs to A; its cached version will be rejected.
  old.commands.insertContent("late ");
  expect(a.getTextSnapshot()).toBe("first late A");
  expect(b.getTextSnapshot()).toBe("second B");
  const current = attach(cache, "a", a);
  current.commands.insertContent("current ");
  old.commands.insertContent("obsolete ");
  expect(a.getTextSnapshot()).toBe("current first late A");
  await a.flush();
  current.commands.setTextSelection(4);
  cache.capture(current);
  old.destroy();
  const fresh = attach(cache, "a", a);
  expect(fresh.getText()).toBe("current first late A");
  expect(fresh.state.selection.from).toBe(4);
  expect(fresh.commands.undo()).toBe(true);
  cache.dispose();
});

it("retains a finite configured history and restores only draft text in a new window cache", async () => {
  const cache = new DraftEditorCache();
  const draft = controller();
  const editor = attach(cache, "a", draft);
  for (let index = 0; index < 120; index++) {
    editor.view.dispatch(closeHistory(editor.state.tr));
    editor.commands.insertContent("x");
  }
  // ProseMirror depth pruning permits a small overflow before trimming.
  expect(undoDepth(editor.state)).toBeGreaterThan(0);
  expect(undoDepth(editor.state)).toBeLessThanOrEqual(70);
  await draft.flush();
  editor.destroy();
  cache.dispose();
  const reloaded = attach(
    new DraftEditorCache(),
    "a",
    controller(draft.getTextSnapshot()),
  );
  expect(reloaded.getText()).toBe(`${"x".repeat(120)}body`);
  expect(reloaded.can().undo()).toBe(false);
});
