import { randomUUID } from "node:crypto";
import type {
  ActivationIntent,
  AttentionEntry,
} from "../../contracts/attention";

/** Bounded App navigation intents. No execution, answer or native retry authority. */
export class ActivationBroker {
  private readonly pending: ActivationIntent[] = [];
  private renderer: string | null = null;
  enqueue(target: AttentionEntry): boolean {
    if (
      this.pending.some(
        (item) =>
          item.threadId === target.threadId && item.eventId === target.eventId,
      )
    )
      return true;
    if (this.pending.length >= 32) return false;
    this.pending.push({
      id: randomUUID(),
      threadId: target.threadId,
      eventId: target.eventId,
      target: {
        ...structuredClone(target),
        sourceTarget: structuredClone(
          target.sourceTarget ?? { kind: "thread" },
        ),
      },
    });
    return true;
  }
  ready(renderer: string, ready: boolean): void {
    if (ready) this.renderer = renderer;
    else if (renderer === this.renderer) this.renderer = null;
  }
  clearRenderer(): void {
    this.renderer = null;
  }
  current(): ActivationIntent | null {
    return this.renderer && this.pending[0]
      ? structuredClone(this.pending[0])
      : null;
  }
  complete(id: string, renderer: string): boolean {
    if (renderer !== this.renderer || this.pending[0]?.id !== id) return false;
    this.pending.shift();
    return true;
  }
  dispose(): void {
    this.renderer = null;
    this.pending.length = 0;
  }
}
