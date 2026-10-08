// @vitest-environment happy-dom
import { Editor } from "@tiptap/core";
import { expect, it, vi } from "vitest";
import { AttachmentSchema } from "../../contracts/public";
import { bindHistoryAdmission } from "../editor/edit-action-history";
import {
  draftDocument,
  plainTextEditorOptions,
} from "../editor/plain-text-editor";
import {
  createAttachmentEditor,
  createAttachmentImportTarget,
} from "../references/attachment-editor";
import {
  AttachmentImportBudget,
  AttachmentImports,
} from "./attachment-imports";

const threadId = crypto.randomUUID();
function item(name: string) {
  const id = crypto.randomUUID();
  return AttachmentSchema.parse({
    schemaVersion: 1,
    id,
    threadId,
    token: `[[dpi-attachment:${id}]]`,
    name,
    mimeType: "text/plain",
    byteLength: 1,
    capturedAt: new Date().toISOString(),
    source: "paste",
    status: "ready",
    representation: "text",
    coverageGaps: [],
    textOnly: false,
  });
}
it("maps left-affinity original position, applies all files once and Undo preserves intervening B", async () => {
  const editor = new Editor({
    ...plainTextEditorOptions,
    element: document.createElement("div"),
    content: draftDocument("A"),
  });
  editor.commands.setTextSelection(2);
  const target = createAttachmentImportTarget(editor, () => true, {
    position: 2,
    sourceFrom: 1,
  });
  editor.view.dispatch(editor.state.tr.insertText("B", 2));
  const items = [item("one"), item("two")];
  expect(target.apply(items)).toBe(true);
  expect(
    editor.state.doc.textBetween(0, editor.state.doc.content.size, "\n", "X"),
  ).toBe("AXXB");
  expect(editor.commands.undo()).toBe(true);
  expect(editor.getText()).toBe("AB");
  editor.destroy();
});
it("Undo, deleted paste source and unbinding make late files pending instead of ghost insertion", () => {
  const editor = new Editor({
    ...plainTextEditorOptions,
    element: document.createElement("div"),
    content: draftDocument(""),
  });
  editor.view.dispatch(
    editor.state.tr.insertText("A").setMeta("dpiIndependentAction", true),
  );
  const target = createAttachmentImportTarget(editor, () => true, {
    position: 2,
    sourceFrom: 1,
  });
  editor.commands.undo();
  editor.commands.redo();
  expect(target.apply([item("late")])).toBe(false);
  editor.destroy();
});
it("a rejected batch transaction retains the entire set and can retry once admission recovers", () => {
  const editor = new Editor({
    ...plainTextEditorOptions,
    element: document.createElement("div"),
    content: draftDocument("body"),
  });
  const target = createAttachmentImportTarget(editor, () => true);
  const unbind = bindHistoryAdmission(editor, () => false);
  expect(target.apply([item("one"), item("two")])).toBe(false);
  expect(editor.getText()).toBe("body");
  unbind();
  expect(target.apply([item("one"), item("two")])).toBe(true);
  editor.destroy();
});
it("a file-only paste uses the same deletion fence as a drop anchor", () => {
  const editor = new Editor({
    ...plainTextEditorOptions,
    element: document.createElement("div"),
    content: draftDocument("AB"),
  });
  const target = createAttachmentImportTarget(editor, () => true, {
    position: 2,
    sourceFrom: 2,
  });
  editor.view.dispatch(editor.state.tr.delete(2, 3));
  expect(target.apply([item("late")])).toBe(false);
  expect(editor.getText()).toBe("A");
  editor.destroy();
});
it("partial failure never inserts success automatically and explicit adoption preserves order", async () => {
  const first = item("one");
  const second = item("two");
  const prepare = vi
    .fn()
    .mockResolvedValueOnce([first])
    .mockRejectedValueOnce(Error("bad"))
    .mockResolvedValueOnce([second]);
  const model = new AttachmentImports(prepare);
  const apply = vi.fn(() => true);
  model.attachEditor({ applyBatch: apply });
  const id = model.importFiles(
    [new File(["a"], "one"), new File(["b"], "two")],
    "paste",
    { apply },
  );
  await vi.waitFor(() => expect(model.stateStore.getState().pending).toBe(0));
  expect(apply).not.toHaveBeenCalled();
  expect(model.stateStore.getState().ready).toBe(false);
  expect(id).not.toBeNull();
  if (!id) throw Error("missing batch");
  expect(model.insertReady(id)).toBe(true);
  expect(apply).toHaveBeenCalledWith([first]);
  expect(model.stateStore.getState().ready).toBe(false);
  const failure = model.stateStore.getState().failures[0];
  if (!failure) throw Error("missing failure");
  model.retry(failure.id);
  await vi.waitFor(() => expect(model.stateStore.getState().pending).toBe(0));
  // Explicit subset acceptance prevents later implicit insertion of a retry.
  expect(apply).toHaveBeenCalledTimes(1);
  expect(model.insertReady(id)).toBe(true);
  expect(apply).toHaveBeenLastCalledWith([second]);
  model.dispose();
});
it("reserves byte admission synchronously across owners and only runs one preparation per Thread", async () => {
  const budget = new AttachmentImportBudget({ active: 1, bytes: 4, jobs: 4 });
  let finish: (value: []) => void = () => {};
  const prepare = vi.fn(
    () =>
      new Promise<[]>((resolve) => {
        finish = resolve;
      }),
  );
  const a = new AttachmentImports(prepare, { budget });
  const b = new AttachmentImports(prepare, { budget });
  a.importFiles([new File(["ab"], "one"), new File(["cd"], "two")], "drop");
  expect(b.importFiles([new File(["e"], "other")], "drop")).toBeNull();
  await vi.waitFor(() => expect(prepare).toHaveBeenCalledTimes(1));
  a.cancel(a.stateStore.getState().batches[0]?.id ?? "");
  finish([]);
  await vi.waitFor(() => expect(a.stateStore.getState().pending).toBe(0));
  a.dispose();
  b.dispose();
});
it("cancelling Main preparation waits for trusted settlement and retains debt after rejected cleanup", async () => {
  let finish: (value: ReturnType<typeof item>[]) => void = () => {};
  const settle = vi
    .fn()
    .mockRejectedValueOnce(Error("disconnected"))
    .mockResolvedValue(undefined);
  const model = new AttachmentImports(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
    { settle },
  );
  const id = model.importFiles([new File(["a"], "one")], "drop");
  await vi.waitFor(() =>
    expect(model.stateStore.getState().batches[0]?.jobs[0]?.phase).toBe(
      "preparing",
    ),
  );
  if (!id) throw Error("missing batch");
  model.cancel(id);
  expect(model.stateStore.getState().batches[0]?.jobs[0]?.phase).toBe(
    "cancelling",
  );
  finish([item("late")]);
  await vi.waitFor(() => expect(settle).toHaveBeenCalledTimes(1));
  expect(model.stateStore.getState().ready).toBe(false);
  model.cancel(id);
  await vi.waitFor(() => expect(model.stateStore.getState().ready).toBe(true));
  expect(settle).toHaveBeenCalledTimes(2);
  model.dispose();
});

it("applies one completed multi-file batch at mapped source and exposes readiness only after adopt settles", async () => {
  const editor = new Editor({
    ...plainTextEditorOptions,
    element: document.createElement("div"),
    content: draftDocument("A"),
  });
  editor.commands.setTextSelection(2);
  let finish: (items: ReturnType<typeof item>[]) => void = () => {};
  const one = item("one"),
    two = item("two");
  const prepare = vi
    .fn()
    .mockResolvedValueOnce([one])
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
  let settle: () => void = () => {};
  const settling = new Promise<void>((resolve) => {
    settle = resolve;
  });
  const model = new AttachmentImports(prepare, { settle: () => settling });
  model.attachEditor(createAttachmentEditor(editor, () => true));
  const target = createAttachmentImportTarget(editor, () => true, {
    position: 2,
    sourceFrom: 1,
  });
  model.importFiles(
    [new File(["1"], "one"), new File(["2"], "two")],
    "paste",
    target,
  );
  await vi.waitFor(() => expect(prepare).toHaveBeenCalledTimes(2));
  editor.view.dispatch(editor.state.tr.insertText("B", 2));
  editor.commands.setTextSelection(1);
  finish([two]);
  await vi.waitFor(() =>
    expect(
      editor.state.doc.textBetween(0, editor.state.doc.content.size, "\n", "X"),
    ).toBe("AXXB"),
  );
  expect(model.stateStore.getState().ready).toBe(false);
  settle();
  await vi.waitFor(() => expect(model.stateStore.getState().ready).toBe(true));
  expect(editor.commands.undo()).toBe(true);
  expect(editor.getText()).toBe("AB");
  model.dispose();
  editor.destroy();
});
it("deleting the pasted source invalidates original intent even if a same-sized replacement follows", () => {
  const editor = new Editor({
    ...plainTextEditorOptions,
    element: document.createElement("div"),
    content: draftDocument("A"),
  });
  const target = createAttachmentImportTarget(editor, () => true, {
    position: 2,
    sourceFrom: 1,
  });
  editor.view.dispatch(editor.state.tr.delete(1, 2).insertText("C", 1));
  expect(target.apply([item("late")])).toBe(false);
  expect(editor.getText()).toBe("C");
  editor.destroy();
});
it("freeze leases block new admission and insertion while accepted sibling work continues", async () => {
  let finish: (items: ReturnType<typeof item>[]) => void = () => {};
  const one = item("one"),
    two = item("two");
  const prepare = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValueOnce([two]);
  const model = new AttachmentImports(prepare);
  const apply = vi.fn(() => true);
  model.attachEditor({ applyBatch: apply });
  const id = model.importFiles(
    [new File(["1"], "one"), new File(["2"], "two")],
    "paste",
    { apply },
  );
  await vi.waitFor(() => expect(prepare).toHaveBeenCalledTimes(1));
  const a = model.freezeSources(),
    b = model.freezeSources();
  expect(model.importFiles([new File(["3"], "rejected")], "drop")).toBeNull();
  a();
  a();
  expect(model.stateStore.getState().acceptingSources).toBe(false);
  finish([one]);
  await vi.waitFor(() => expect(prepare).toHaveBeenCalledTimes(2));
  await vi.waitFor(() => expect(model.stateStore.getState().pending).toBe(0));
  expect(apply).not.toHaveBeenCalled();
  expect(model.stateStore.getState().ready).toBe(false);
  if (!id) throw Error("missing batch");
  expect(model.insertReady(id)).toBe(false);
  b();
  expect(model.insertReady(id)).toBe(true);
  expect(apply).toHaveBeenCalledWith([one, two]);
  model.dispose();
});
it("FileReader cancellation aborts actual reading and releases source reservation once", async () => {
  const read = vi
    .spyOn(FileReader.prototype, "readAsDataURL")
    .mockImplementation(() => {});
  const abort = vi
    .spyOn(FileReader.prototype, "abort")
    .mockImplementation(function (this: FileReader) {
      this.dispatchEvent(new ProgressEvent("abort"));
    });
  const budget = new AttachmentImportBudget({ active: 1, bytes: 1, jobs: 1 });
  const prepare = vi.fn();
  const model = new AttachmentImports(prepare, { budget });
  try {
    const id = model.importFiles([new File(["1"], "one")], "drop");
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(1));
    if (!id) throw Error("missing batch");
    model.cancel(id);
    await vi.waitFor(() =>
      expect(model.stateStore.getState().ready).toBe(true),
    );
    expect(abort).toHaveBeenCalledTimes(1);
    expect(prepare).not.toHaveBeenCalled();
    model.cancel(id);
    expect(abort).toHaveBeenCalledTimes(1);
    const release = budget.reserve(1, 1);
    expect(release).not.toBeNull();
    release?.();
  } finally {
    model.dispose();
    read.mockRestore();
    abort.mockRestore();
  }
});
it("view detachment keeps late items pending in the original owner and requires explicit current insertion", async () => {
  let finish: (items: ReturnType<typeof item>[]) => void = () => {};
  const model = new AttachmentImports(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const targetApply = vi.fn(() => true),
    apply = vi.fn(() => true),
    foreignApply = vi.fn(() => true);
  const detach = model.attachEditor({ applyBatch: apply });
  const target = { apply: targetApply, invalidate: vi.fn() };
  const id = model.importFiles([new File(["1"], "one")], "drop", target);
  const other = new AttachmentImports(async () => []);
  other.attachEditor({ applyBatch: foreignApply });
  await vi.waitFor(() =>
    expect(model.stateStore.getState().batches[0]?.jobs[0]?.phase).toBe(
      "preparing",
    ),
  );
  detach();
  finish([item("late")]);
  await vi.waitFor(() => expect(model.stateStore.getState().pending).toBe(0));
  expect(targetApply).not.toHaveBeenCalled();
  expect(foreignApply).not.toHaveBeenCalled();
  expect(model.stateStore.getState().ready).toBe(false);
  model.attachEditor({ applyBatch: apply });
  if (!id) throw Error("missing batch");
  expect(model.insertReady(id)).toBe(true);
  expect(apply).toHaveBeenCalledTimes(1);
  model.dispose();
  other.dispose();
});
it("dispose transfers late accepted settlement to its original bridge and frees budget for other owners", async () => {
  let finish: (items: ReturnType<typeof item>[]) => void = () => {};
  const budget = new AttachmentImportBudget({ active: 1, bytes: 1, jobs: 1 });
  const settle = vi.fn<
    (operationId: string, disposition: "release" | "adopt") => Promise<void>
  >(async () => {});
  const model = new AttachmentImports(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
    { budget, settle },
  );
  const apply = vi.fn(() => true);
  model.importFiles([new File(["1"], "one")], "paste", { apply });
  await vi.waitFor(() =>
    expect(model.stateStore.getState().batches[0]?.jobs[0]?.phase).toBe(
      "preparing",
    ),
  );
  model.dispose();
  model.dispose();
  finish([item("late")]);
  await vi.waitFor(() => expect(settle).toHaveBeenCalledTimes(1));
  expect(settle.mock.calls[0]?.[1]).toBe("release");
  expect(apply).not.toHaveBeenCalled();
  const release = budget.reserve(1, 1);
  expect(release).not.toBeNull();
  release?.();
});

it("cancel after verified adoption never changes applied source state or removes document nodes", async () => {
  const model = new AttachmentImports(async () => [item("one")]);
  const apply = vi.fn(() => true);
  model.attachEditor({ applyBatch: apply });
  const id = model.importFiles([new File(["1"], "one")], "paste", { apply });
  await vi.waitFor(() => expect(model.stateStore.getState().ready).toBe(true));
  const before = model.stateStore.getState().batches[0]?.jobs[0];
  if (!id || !before) throw Error("missing applied batch");
  model.cancel(id);
  expect(model.stateStore.getState().batches[0]?.jobs[0]).toBe(before);
  expect(before.phase).toBe("ready");
  expect(apply).toHaveBeenCalledTimes(1);
  model.dispose();
});

it("cancel invalidates an in-flight retry intent so its old settlement cannot publish a new queued attempt", async () => {
  const prepare = vi.fn().mockRejectedValueOnce(Error("unknown transport"));
  let finish: () => void = () => {};
  const settlement = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const model = new AttachmentImports(prepare, { settle: () => settlement });
  const batch = model.importFiles([new File(["1"], "one")], "drop");
  await vi.waitFor(() =>
    expect(model.stateStore.getState().failures).toHaveLength(1),
  );
  const job = model.stateStore.getState().failures[0];
  if (!job || !batch) throw Error("missing job");
  model.retry(job.id);
  model.cancel(job.id);
  const phases: string[] = [];
  const unsubscribe = model.stateStore.subscribe((state) => {
    const phase = state.batches[0]?.jobs[0]?.phase;
    if (phase) phases.push(phase);
  });
  finish();
  await vi.waitFor(() => expect(model.stateStore.getState().ready).toBe(true));
  expect(phases).not.toContain("queued");
  expect(prepare).toHaveBeenCalledTimes(1);
  unsubscribe();
  model.dispose();
});
it("composition/history recovery retries an eligible automatic target while detached intent remains pending", async () => {
  const model = new AttachmentImports(async () => [item("one")]);
  const target = vi.fn().mockReturnValueOnce(false).mockReturnValue(true);
  model.importFiles([new File(["1"], "one")], "paste", { apply: target });
  await vi.waitFor(() => expect(target).toHaveBeenCalledTimes(1));
  expect(model.stateStore.getState().ready).toBe(false);
  model.flushInsertions();
  await vi.waitFor(() => expect(model.stateStore.getState().ready).toBe(true));
  expect(target).toHaveBeenCalledTimes(2);
  model.dispose();
});

it("queued budget reservations abort before a slow active preparation finishes and never keep disposed owners in the scheduler", async () => {
  const budget = new AttachmentImportBudget({ active: 1, bytes: 1, jobs: 1 });
  const first = await budget.acquire();
  if (!first) throw Error("missing active slot");
  const waiting = new AbortController();
  const queued = budget.acquire(waiting.signal);
  waiting.abort();
  expect(await queued).toBeNull();
  first();
  const next = await budget.acquire();
  expect(next).toBeTypeOf("function");
  next?.();
});
