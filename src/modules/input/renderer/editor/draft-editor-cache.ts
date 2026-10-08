import type { Editor } from "@tiptap/core";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import { draftByteLength } from "../../../../shared/draft-text";
import type { AttachmentBridge } from "../../contracts/public";
import { EditorHistoryModel } from "../../core/attachments/editor-history-model";
import type { DraftController } from "../../core/draft-controller";
import { parseDraftBlocks } from "../../core/public";
import { attachmentIds } from "../references/attachment-reference";
import { bindHistoryAdmission } from "./edit-action-history";
import {
  clearDraftHistory,
  detachedDraftState,
  onDraftHistoryClear,
} from "./plain-text-editor";

function documentIds(doc: EditorState["doc"]): Set<string> {
  const ids = new Set<string>();
  doc.descendants((node) => {
    if (
      node.type.name === "attachmentReference" &&
      typeof node.attrs.id === "string"
    )
      ids.add(node.attrs.id);
  });
  return ids;
}
function currentIds(
  controller: DraftController,
  editorOnly = false,
): Set<string> {
  const ids = new Set<string>();
  for (const block of parseDraftBlocks(
    editorOnly
      ? controller.getEditorTextSnapshot()
      : controller.getTextSnapshot(),
  )) {
    if (block.kind !== "paragraph") continue;
    // Match the editor's atomic token grammar independently of adjacent literal
    // text; a malformed literal must not hide an otherwise valid body clone.
    for (const id of attachmentIds(block.text)) ids.add(id);
  }
  return ids;
}

type Snapshot = ReturnType<DraftController["getEditorSnapshot"]>;
type PendingSource = {
  key: string;
  candidates: Set<string>;
  epoch: Set<string>;
};
type Entry = {
  snapshot: Snapshot;
  state: EditorState;
  bytes: number;
  controller: DraftController;
};
type Binding = { key: string; controller: DraftController; token: symbol };

const emptyHistoryState = { pending: false, failed: false, limited: false };
const pendingHistoryState = { pending: true, failed: false, limited: false };
type History = {
  model: EditorHistoryModel;
  controller: DraftController;
  detachBarrier: () => void;
  unsubscribe: () => void;
  retired: boolean;
};
const MAX_HISTORY_OWNERS = 9;
const MAX_WAITING_SOURCES = 9;
const MAX_WAITING_IDS = 80000;
const admissionState = { pending: false, failed: true, limited: true };
/** Window-owned, inactive EditorStates only. Draft persistence remains separate. */
export class DraftEditorCache {
  private readonly entries = new Map<string, Entry>();
  private readonly leases = new Map<string, symbol>();
  private readonly bindings = new WeakMap<Editor, Binding>();
  private disposed = false;
  private readonly histories = new Map<string, History>();
  // Existing Thread Controller owns this blocked-source ID projection. It
  // holds no editor, EditorState, body, or additional Main lease authority.
  private readonly waiting = new Map<DraftController, PendingSource>();
  private readonly activeEditors = new Map<string, Editor>();
  private readonly listeners = new Set<() => void>();
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  historyState(key: string) {
    return (
      this.histories.get(key)?.model.stateStore.getState() ??
      (this.bridge && this.controllerFor(key)
        ? [...this.histories.values()].some(
            (h) => h.retired && h.model.stateStore.getState().pending,
          ) &&
          ![...this.histories.values()].some(
            (h) => h.model.stateStore.getState().failed,
          )
          ? pendingHistoryState
          : admissionState
        : emptyHistoryState)
    );
  }
  private controllerFor(key: string): DraftController | undefined {
    const editor = this.activeEditors.get(key);
    return (
      (editor ? this.bindings.get(editor)?.controller : undefined) ??
      this.entries.get(key)?.controller
    );
  }
  private waitingIds(): number {
    let size = 0;
    for (const source of this.waiting.values()) size += source.candidates.size;
    return size;
  }
  private pendingSource(
    key: string,
    controller: DraftController,
  ): PendingSource | undefined {
    let source = this.waiting.get(controller);
    if (!source) {
      const ids = currentIds(controller);
      if (
        this.waiting.size >= MAX_WAITING_SOURCES ||
        this.waitingIds() + ids.size > MAX_WAITING_IDS
      )
        return undefined;
      source = {
        key,
        candidates: new Set(ids),
        epoch: currentIds(controller, true),
      };
      this.waiting.set(controller, source);
    }
    return source;
  }
  private admitTransaction(
    key: string,
    controller: DraftController,
    tr?: Transaction,
  ): boolean {
    if (tr?.getMeta("dpiTrustedDraftReplacement") === true) return true;
    const history = this.histories.get(key);
    if (history?.controller === controller) return true;
    const source = this.pendingSource(key, controller);
    if (!source) return false;
    if (!tr) return source.candidates.size < MAX_WAITING_IDS;
    const next = new Set(source.candidates);
    for (const doc of [tr.before, tr.doc])
      for (const id of documentIds(doc)) next.add(id);
    return (
      this.waitingIds() + next.size - source.candidates.size <= MAX_WAITING_IDS
    );
  }
  private drainWaiting(): void {
    if (this.disposed) return;
    for (const [controller, source] of this.waiting) {
      if (this.histories.size >= MAX_HISTORY_OWNERS) break;
      this.admitHistory(source.key, controller);
    }
  }
  private dropHistory(key: string, history: History): void {
    if (
      this.histories.get(key) !== history ||
      !history.retired ||
      !history.model.finish()
    )
      return;
    this.histories.delete(key);
    history.detachBarrier();
    history.unsubscribe();
    this.drainWaiting();
    for (const listener of this.listeners) listener();
  }
  private admitHistory(
    key: string,
    controller: DraftController,
  ): History | undefined {
    const existing = this.histories.get(key);
    if (existing) {
      if (existing.controller !== controller) return undefined;
      existing.retired = false;
      return existing;
    }
    if (
      !this.bridge ||
      this.disposed ||
      this.histories.size >= MAX_HISTORY_OWNERS
    )
      return undefined;
    const model = new EditorHistoryModel(
      this.bridge,
      controller.threadId,
      () => this.clearKeyHistory(key),
      () => currentIds(this.histories.get(key)?.controller ?? controller),
    );
    const history: History = {
      model,
      controller,
      retired: false,
      detachBarrier: controller.registerSaveBarrier({
        ready: () => model.ready(),
        prepare: (retry) => (retry ? model.retry() : model.ensure()),
      }),
      unsubscribe: model.stateStore.subscribe(() => {
        for (const listener of this.listeners) listener();
      }),
    };
    this.histories.set(key, history);
    const source = this.waiting.get(controller);
    if (source) {
      this.waiting.delete(controller);
      model.adopt(source.candidates, currentIds(controller), source.epoch);
    }
    const active = this.activeEditors.get(key);
    if (source && active?.isInitialized && !active.isDestroyed)
      active.view.updateState(active.state);
    if (!this.activeEditors.has(key) && !this.entries.has(key)) {
      history.retired = true;
      void model.ensure().then(() => this.dropHistory(key, history));
    }
    return history;
  }
  private async prepareHistory(
    key: string,
    controller: DraftController,
    retry: boolean,
  ): Promise<boolean> {
    if (this.disposed) return false;
    for (const [retiredKey, history] of this.histories) {
      if (!history.retired) continue;
      await (retry ? history.model.retry() : history.model.ensure());
      this.dropHistory(retiredKey, history);
    }
    const history = this.admitHistory(key, controller);
    if (!history) return false;
    return retry ? history.model.retry() : history.model.ensure();
  }
  async retryHistory(key: string): Promise<boolean> {
    const history = this.histories.get(key);
    if (history) {
      const result = await history.model.retry();
      this.dropHistory(key, history);
      return result;
    }
    const controller = this.controllerFor(key);
    return controller
      ? this.prepareHistory(key, controller, true)
      : !this.bridge;
  }
  async clearHistory(key: string): Promise<boolean> {
    if (this.disposed || this.activeEditors.get(key)?.view.composing)
      return false;
    this.clearKeyHistory(key);
    const history = this.histories.get(key);
    if (history) return history.model.ensure();
    const controller = this.controllerFor(key);
    return controller
      ? this.prepareHistory(key, controller, true)
      : !this.bridge;
  }
  private releaseHistory(key: string): void {
    const history = this.histories.get(key);
    if (!history) return;
    history.retired = true;
    history.model.reset(currentIds(history.controller));
    this.dropHistory(key, history);
    void history.model.ensure().then(() => this.dropHistory(key, history));
  }
  private clearKeyHistory(key: string): void {
    const editor = this.activeEditors.get(key);
    const controller =
      this.controllerFor(key) ?? this.histories.get(key)?.controller;
    this.entries.delete(key);
    if (editor && !editor.isDestroyed) clearDraftHistory(editor);
    else if (controller) {
      const history = this.histories.get(key);
      if (history) history.model.reset(currentIds(controller));
      else {
        const source = this.pendingSource(key, controller);
        if (source) source.epoch = currentIds(controller, true);
      }
    }
  }
  constructor(
    private readonly limits = { threads: 8, documentBytes: 4 * 1024 * 1024 },
    private readonly bridge?: AttachmentBridge,
  ) {}

  bind(editor: Editor, key: string, controller: DraftController): void {
    if (this.disposed) return;
    const current = this.histories.get(key);
    if (current && current.model.threadId !== controller.threadId)
      throw Error("Foreign editor controller");
    const previous = this.controllerFor(key);
    if (previous && previous !== controller) {
      if (previous.threadId !== controller.threadId)
        throw Error("Foreign editor controller");
      const waiting = this.waiting.get(previous);
      if (waiting) {
        this.waiting.delete(previous);
        // A trusted Controller replacement ends the previous Undo epoch. Keep
        // its cleanup candidates, reading the new body's IDs from its owner.
        waiting.epoch = currentIds(controller, true);
        this.waiting.set(controller, waiting);
      }
    }
    const binding = { key, controller, token: Symbol(key) };
    this.bindings.set(editor, binding);
    this.leases.set(key, binding.token);
    this.activeEditors.set(key, editor);
    const existing = this.histories.get(key);
    if (existing && existing.controller !== controller) {
      existing.detachBarrier();
      existing.controller = controller;
      existing.model.reset(currentIds(controller));
      existing.detachBarrier = controller.registerSaveBarrier({
        ready: () => existing.model.ready(),
        prepare: (retry) =>
          retry ? existing.model.retry() : existing.model.ensure(),
      });
    }
    if (existing) existing.retired = false;
    if (this.bridge && !this.admitHistory(key, controller)) {
      this.pendingSource(key, controller);
      controller.registerSaveBarrier({
        ready: () =>
          this.histories.get(key)?.controller === controller &&
          (this.histories.get(key)?.model.ready() ?? false),
        prepare: (retry) => this.prepareHistory(key, controller, retry),
      });
    }
    const removeAdmission = bindHistoryAdmission(
      editor,
      (tr) =>
        !this.bridge ||
        (this.leases.get(key) === binding.token &&
          this.admitTransaction(key, controller, tr)),
    );
    // Images have no PM transaction or Undo dependency. Their unpersisted
    // clipboard clone still needs candidate cleanup and the existing save/ACK
    // barrier, using the canonical draft's current IDs as retention authority.
    let previousImages = new Set<string>();
    const observeImages = () => {
      if (this.disposed || this.leases.get(key) !== binding.token) return;
      const images = new Set(controller.getDetachedAttachmentIds());
      if (
        images.size === previousImages.size &&
        [...images].every((id) => previousImages.has(id))
      )
        return;
      const candidates = new Set([...previousImages, ...images]);
      previousImages = images;
      const history = this.histories.get(key);
      if (history) history.model.adopt(candidates, currentIds(controller), []);
      else {
        const source = this.pendingSource(key, controller);
        if (source) for (const id of candidates) source.candidates.add(id);
      }
    };
    const unsubscribeImages = controller.subscribe(observeImages);
    observeImages();
    const removeHistoryListener = onDraftHistoryClear(editor, () => {
      if (this.leases.get(key) !== binding.token) return;
      const ids = documentIds(editor.state.doc);
      const history = this.histories.get(key);
      if (history) history.model.reset(ids);
      else {
        const source = this.pendingSource(key, controller);
        if (source) source.epoch = ids;
      }
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
      if (transaction.getMeta("dpiTrustedDraftReplacement") === true) return;
      const history = this.histories.get(key);
      if (history) history.model.observe(ids);
      else {
        const source = this.pendingSource(key, controller);
        if (!source) return;
        for (const id of ids) {
          source.epoch.add(id);
          source.candidates.add(id);
        }
        if (source.epoch.size > 128) clearDraftHistory(editor);
      }
    });
    editor.on("mount", () => this.restore(editor, binding));
    // Register on this Editor, rather than useEditor's latest-options proxy:
    // delayed IME events must keep their original Thread/controller binding.
    editor.on("update", () => {
      if (!this.disposed && this.leases.get(key) === binding.token)
        controller.editEditorText(editor.getText({ blockSeparator: "\n" }));
    });
    editor.on("destroy", () => {
      unsubscribeImages();
      this.capture(editor);
      if (this.leases.get(key) === binding.token) {
        this.leases.delete(key);
        this.activeEditors.delete(key);
        if (!this.entries.has(key)) {
          const source = this.waiting.get(controller);
          if (source) source.epoch = new Set();
          this.releaseHistory(key);
        }
      }
      removeHistoryListener();
      removeAdmission();
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
      controller: binding.controller,
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
      ) {
        const source = this.waiting.get(entry.controller);
        if (source) source.epoch = new Set();
        this.releaseHistory(key);
      }
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
      this.histories
        .get(binding.key)
        ?.model.reset(currentIds(binding.controller));
      const source = this.waiting.get(binding.controller);
      if (source) source.epoch = currentIds(binding.controller);
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
    this.waiting.clear();
    this.listeners.clear();
  }
}
