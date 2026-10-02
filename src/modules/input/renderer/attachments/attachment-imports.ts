import { createStore } from "zustand/vanilla";
import type { Attachment } from "../../contracts/public";

type Source = "paste" | "drop";
export type ImportFailure = {
  id: string;
  file: File;
  source: Source;
  reason: "source-too-large" | "read-or-transport-failed";
};
type ImportInput = {
  name: string;
  mimeType: string;
  dataBase64: string;
  source: Source;
};
const unpersistedImports = new Set<AttachmentImports>();

export function hasUnpersistedAttachmentSources(): boolean {
  return unpersistedImports.size > 0;
}

export class AttachmentImports {
  readonly stateStore = createStore(() => ({
    pending: 0,
    failures: [] as ImportFailure[],
    completion: 0,
  }));
  private readonly listeners = new Set<(items: Attachment[]) => void>();
  constructor(
    private readonly prepare: (input: ImportInput) => Promise<Attachment[]>,
  ) {
    this.stateStore.subscribe((state) => {
      if (state.pending > 0 || state.failures.length > 0)
        unpersistedImports.add(this);
      else unpersistedImports.delete(this);
    });
  }
  subscribeCompleted(listener: (items: Attachment[]) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  importFiles(files: File[], source: Source): void {
    if (!files.length) return;
    this.stateStore.setState((state) => ({
      pending: state.pending + files.length,
    }));
    void this.prepareFiles(files, source);
  }
  removeFailure(id: string): void {
    this.stateStore.setState((state) => ({
      failures: state.failures.filter((item) => item.id !== id),
    }));
  }
  retry(id: string): void {
    const item = this.stateStore
      .getState()
      .failures.find((item) => item.id === id);
    if (!item) return;
    this.removeFailure(id);
    this.importFiles([item.file], item.source);
  }
  private async prepareFiles(files: File[], source: Source): Promise<void> {
    for (const file of files) {
      try {
        if (file.size > 25 * 1024 * 1024) {
          this.fail(file, source, "source-too-large");
          continue;
        }
        const dataBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () =>
            typeof reader.result === "string"
              ? resolve(reader.result.slice(reader.result.indexOf(",") + 1))
              : reject(Error("File read failed"));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        });
        const items = await this.prepare({
          name: file.name || "clipboard.png",
          mimeType: file.type,
          dataBase64,
          source,
        });
        this.stateStore.setState((state) => ({
          completion: state.completion + 1,
        }));
        for (const listener of this.listeners) listener(items);
      } catch {
        this.fail(file, source, "read-or-transport-failed");
      } finally {
        this.stateStore.setState((state) => ({ pending: state.pending - 1 }));
      }
    }
  }
  private fail(
    file: File,
    source: Source,
    reason: ImportFailure["reason"],
  ): void {
    this.stateStore.setState((state) => ({
      failures: [
        ...state.failures,
        { id: crypto.randomUUID(), file, source, reason },
      ],
    }));
  }
}
