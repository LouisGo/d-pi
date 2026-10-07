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
  private disposed = false;
  private sourceFreezes = 0;
  private readonly store = createStore(() => ({
    acceptingSources: true,
    pending: 0,
    failures: [] as ImportFailure[],
    completion: 0,
  }));
  readonly stateStore: Pick<
    typeof this.store,
    "getState" | "getInitialState" | "subscribe"
  > = this.store;
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
  freezeSources(): () => void {
    if (this.disposed) return () => {};
    this.sourceFreezes++;
    this.store.setState({ acceptingSources: false });
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.sourceFreezes--;
      if (!this.disposed && this.sourceFreezes === 0)
        this.store.setState({ acceptingSources: true });
    };
  }
  importFiles(files: File[], source: Source): void {
    if (this.disposed || this.sourceFreezes > 0 || !files.length) return;
    this.store.setState((state) => ({
      pending: state.pending + files.length,
    }));
    void this.prepareFiles(files, source);
  }
  removeFailure(id: string): void {
    this.store.setState((state) => ({
      failures: state.failures.filter((item) => item.id !== id),
    }));
  }
  retry(id: string): void {
    if (this.disposed || this.sourceFreezes > 0) return;
    const item = this.stateStore
      .getState()
      .failures.find((item) => item.id === id);
    if (!item) return;
    this.removeFailure(id);
    this.importFiles([item.file], item.source);
  }
  private async prepareFiles(files: File[], source: Source): Promise<void> {
    for (const file of files) {
      if (this.disposed) return;
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
        if (this.disposed) return;
        const items = await this.prepare({
          name: file.name || "clipboard.png",
          mimeType: file.type,
          dataBase64,
          source,
        });
        if (this.disposed) return;
        this.store.setState((state) => ({
          completion: state.completion + 1,
        }));
        for (const listener of this.listeners) listener(items);
      } catch {
        if (!this.disposed) this.fail(file, source, "read-or-transport-failed");
      } finally {
        if (!this.disposed)
          this.store.setState((state) => ({ pending: state.pending - 1 }));
      }
    }
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.listeners.clear();
    this.store.setState({ pending: 0, failures: [] });
    unpersistedImports.delete(this);
  }
  private fail(
    file: File,
    source: Source,
    reason: ImportFailure["reason"],
  ): void {
    this.store.setState((state) => ({
      failures: [
        ...state.failures,
        { id: crypto.randomUUID(), file, source, reason },
      ],
    }));
  }
}
