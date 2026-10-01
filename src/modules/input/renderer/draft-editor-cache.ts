import type { Editor } from "@tiptap/core";
import type { EditorState } from "@tiptap/pm/state";
import { draftByteLength } from "../../../shared/draft-text";
import type { DraftController } from "../core/draft-controller";
import { detachedDraftState } from "./plain-text-editor";

type Snapshot = ReturnType<DraftController["getEditorSnapshot"]>;
type Entry = { snapshot: Snapshot; state: EditorState; bytes: number };
type Binding = { key: string; controller: DraftController; token: symbol };

/** Window-owned, inactive EditorStates only. Draft persistence remains separate. */
export class DraftEditorCache {
  private readonly entries = new Map<string, Entry>();
  private readonly leases = new Map<string, symbol>();
  private readonly bindings = new WeakMap<Editor, Binding>();
  private disposed = false;
  constructor(
    private readonly limits = { threads: 8, documentBytes: 4 * 1024 * 1024 },
  ) {}

  bind(editor: Editor, key: string, controller: DraftController): void {
    if (this.disposed) return;
    const binding = { key, controller, token: Symbol(key) };
    this.bindings.set(editor, binding);
    this.leases.set(key, binding.token);
    editor.on("mount", () => this.restore(editor, binding));
    // Register on this Editor, rather than useEditor's latest-options proxy:
    // delayed IME events must keep their original Thread/controller binding.
    editor.on("update", () => {
      if (!this.disposed && this.leases.get(key) === binding.token)
        controller.edit(editor.getText({ blockSeparator: "\n" }));
    });
    editor.on("destroy", () => {
      this.capture(editor);
      if (this.leases.get(key) === binding.token) this.leases.delete(key);
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
    )
      return;
    editor.view.updateState(
      cached.state.reconfigure({ plugins: editor.state.plugins }),
    );
  }

  dispose(): void {
    this.disposed = true;
    this.entries.clear();
    this.leases.clear();
  }
}
