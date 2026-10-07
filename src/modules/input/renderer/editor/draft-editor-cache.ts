import type { Editor } from "@tiptap/core";
import type { EditorState } from "@tiptap/pm/state";
import { draftByteLength } from "../../../../shared/draft-text";
import type { AttachmentBridge } from "../../contracts/public";
import { EditorHistoryModel } from "../../core/attachments/editor-history-model";
import type { DraftController } from "../../core/draft-controller";
import {
  clearDraftHistory,
  detachedDraftState,
  onDraftHistoryClear,
} from "./plain-text-editor";

type Snapshot = ReturnType<DraftController["getEditorSnapshot"]>;
type Entry = { snapshot: Snapshot; state: EditorState; bytes: number };
type Binding = { key: string; controller: DraftController; token: symbol };

const emptyHistoryState = { pending: false, failed: false, limited: false };
type History = {
  model: EditorHistoryModel;
  controller: DraftController;
  detachBarrier: () => void;
  unsubscribe: () => void;
};
/** Window-owned, inactive EditorStates only. Draft persistence remains separate. */
export class DraftEditorCache {
  private readonly entries = new Map<string, Entry>();
  private readonly leases = new Map<string, symbol>();
  private readonly bindings = new WeakMap<Editor, Binding>();
  private disposed = false;
  private readonly histories = new Map<string, History>();
  private readonly activeEditors = new Map<string, Editor>();
  private readonly listeners = new Set<() => void>();
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  historyState(key: string) {
    return (
      this.histories.get(key)?.model.stateStore.getState() ?? emptyHistoryState
    );
  }
  async retryHistory(key: string): Promise<boolean> {
    return this.histories.get(key)?.model.retry() ?? true;
  }
  async clearHistory(key: string): Promise<boolean> {
    if (this.disposed || this.activeEditors.get(key)?.view.composing)
      return false;
    this.clearKeyHistory(key);
    // Wait for the prior Main lease release before retrying publication.
    return this.histories.get(key)?.model.ensure() ?? true;
  }
  private releaseHistory(key: string): void {
    const history = this.histories.get(key);
    if (!history) return;
    this.histories.delete(key);
    history.detachBarrier();
    history.unsubscribe();
    history.model.dispose();
  }
  private clearKeyHistory(key: string): void {
    const editor = this.activeEditors.get(key);
    this.entries.delete(key);
    if (editor && !editor.isDestroyed) clearDraftHistory(editor);
    else this.histories.get(key)?.model.reset();
  }
  constructor(
    private readonly limits = { threads: 8, documentBytes: 4 * 1024 * 1024 },
    private readonly bridge?: AttachmentBridge,
  ) {}

  bind(editor: Editor, key: string, controller: DraftController): void {
    if (this.disposed) return;
    const binding = { key, controller, token: Symbol(key) };
    this.bindings.set(editor, binding);
    this.leases.set(key, binding.token);
    this.activeEditors.set(key, editor);
    const existing = this.histories.get(key);
    if (existing && existing.controller !== controller)
      this.releaseHistory(key);
    if (this.bridge && !this.histories.has(key)) {
      const model = new EditorHistoryModel(
        this.bridge,
        controller.threadId,
        () => this.clearKeyHistory(key),
      );
      this.histories.set(key, {
        model,
        controller,
        detachBarrier: controller.registerSaveBarrier({
          ready: () => model.ready(),
          prepare: (retry) => (retry ? model.retry() : model.ensure()),
        }),
        unsubscribe: model.stateStore.subscribe(() => {
          for (const listener of this.listeners) listener();
        }),
      });
    }
    const removeHistoryListener = onDraftHistoryClear(editor, () => {
      if (this.leases.get(key) === binding.token)
        this.histories.get(key)?.model.reset();
    });
    editor.on("transaction", ({ transaction }) => {
      if (
        this.disposed ||
        this.leases.get(key) !== binding.token ||
        !transaction.docChanged
      )
        return;
      // Public before/doc nodes give a conservative epoch superset. No private
      // history Branch inspection, no duplicate editable document.
      const ids = new Set<string>();
      for (const doc of [transaction.before, transaction.doc])
        doc.descendants((node) => {
          if (
            node.type.name === "attachmentReference" &&
            typeof node.attrs.id === "string"
          )
            ids.add(node.attrs.id);
        });
      this.histories.get(key)?.model.observe(ids);
    });
    editor.on("mount", () => this.restore(editor, binding));
    // Register on this Editor, rather than useEditor's latest-options proxy:
    // delayed IME events must keep their original Thread/controller binding.
    editor.on("update", () => {
      if (!this.disposed && this.leases.get(key) === binding.token)
        controller.edit(editor.getText({ blockSeparator: "\n" }));
    });
    editor.on("destroy", () => {
      this.capture(editor);
      if (this.leases.get(key) === binding.token) {
        this.leases.delete(key);
        this.activeEditors.delete(key);
        if (!this.entries.has(key)) this.releaseHistory(key);
      }
      removeHistoryListener();
      this.bindings.delete(editor);
    });
  }

  capture(editor: Editor): void {
    const binding = this.bindings.get(editor);
    if (
      !binding ||
      this.disposed ||
      this.leases.get(binding.key) !== binding.token ||
      editor.isDestroyed
    )
      return;
    this.entries.delete(binding.key);
    const snapshot = binding.controller.getEditorSnapshot();
    if (
      editor.view.composing ||
      editor.getText({ blockSeparator: "\n" }) !== snapshot.text
    )
      return;
    const bytes = draftByteLength(snapshot.text);
    if (bytes > this.limits.documentBytes) return;
    this.entries.set(binding.key, {
      snapshot,
      state: detachedDraftState(editor),
      bytes,
    });
    let total = 0;
    for (const entry of this.entries.values()) total += entry.bytes;
    for (const [key, entry] of this.entries) {
      if (
        this.entries.size <= this.limits.threads &&
        total <= this.limits.documentBytes
      )
        break;
      this.entries.delete(key);
      if (
        !this.activeEditors.has(key) ||
        this.activeEditors.get(key)?.isDestroyed
      )
        this.releaseHistory(key);
      total -= entry.bytes;
    }
  }

  private restore(editor: Editor, binding: Binding): void {
    const cached = this.entries.get(binding.key);
    this.entries.delete(binding.key);
    if (!cached || this.disposed) return;
    const snapshot = binding.controller.getEditorSnapshot();
    if (
      snapshot.revision !== cached.snapshot.revision ||
      snapshot.sequence !== cached.snapshot.sequence ||
      snapshot.text !== cached.snapshot.text ||
      cached.state.schema !== editor.schema
    ) {
      this.histories.get(binding.key)?.model.reset();
      return;
    }
    editor.view.updateState(
      cached.state.reconfigure({ plugins: editor.state.plugins }),
    );
  }

  dispose(): void {
    this.disposed = true;
    this.entries.clear();
    this.leases.clear();
    this.activeEditors.clear();
    for (const key of this.histories.keys()) this.releaseHistory(key);
    this.listeners.clear();
  }
}
