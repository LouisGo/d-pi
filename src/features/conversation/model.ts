import type { ConversationEvent, ConversationSnapshot } from "./contracts";
export interface ConversationPort {
  connect(
    threadId: string,
    listener: (event: ConversationEvent) => void,
  ): () => void;
}
export class ConversationModel {
  private view: ConversationSnapshot | null = null;
  private readonly listeners = new Set<() => void>();
  private remove: (() => void) | null = null;
  private threadId: string | null = null;
  private epoch = 0;
  private resyncing = false;
  constructor(private readonly port: ConversationPort) {}
  getSnapshot = (): ConversationSnapshot | null => this.view;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  connect(threadId: string): void {
    this.remove?.();
    this.threadId = threadId;
    const epoch = ++this.epoch;
    let synchronized = false;
    this.remove = this.port.connect(threadId, (event) => {
      if (epoch !== this.epoch) return;
      if (event.kind === "snapshot") {
        synchronized = true;
        this.view = event;
        this.resyncing = false;
      } else {
        if (
          !synchronized ||
          !this.view ||
          event.generation !== this.view.generation ||
          event.seq <= this.view.seq
        )
          return;
        if (event.seq !== this.view.seq + 1) {
          this.view = { ...this.view, gap: true };
          if (!this.resyncing) {
            this.resyncing = true;
            queueMicrotask(() => {
              if (epoch === this.epoch && this.threadId)
                this.connect(this.threadId);
            });
          }
        } else {
          const items = this.view.items.filter(
            (item) => item.id >= event.droppedBefore,
          );
          const index = items.findIndex((item) => item.id === event.item.id);
          if (index < 0) items.push(event.item);
          else items[index] = event.item;
          this.view = { ...this.view, seq: event.seq, items, gap: event.gap };
        }
      }
      for (const listener of this.listeners) listener();
    });
  }
  dispose(): void {
    this.epoch++;
    this.remove?.();
    this.listeners.clear();
  }
}
