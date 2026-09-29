import type { ThreadId } from "../../shared/identity";
import type { Answer } from "../control/interactions";
import { ConversationModel } from "../conversation/model";
import type { RuntimeBridge, RuntimeCommand, RuntimeView } from "./contracts";
export class RuntimeModel {
  private view: RuntimeView | null = null;
  private readonly listeners = new Set<() => void>();
  private thread: ThreadId | null = null;
  private generation = 0;
  readonly reading: ConversationModel | null;
  private readonly unsubscribe: () => void;
  constructor(private readonly bridge: RuntimeBridge) {
    this.reading = bridge.conversation
      ? new ConversationModel(bridge.conversation)
      : null;
    this.unsubscribe = bridge.subscribe((view) => {
      if (view.threadId === this.thread) this.publish(view);
    });
  }
  getSnapshot = (): RuntimeView | null => this.view;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  private publish(view: RuntimeView): void {
    if (this.view && view.revision < this.view.revision) return;
    // A surviving Host can serve its projection even after OMP disconnects.
    // Retry on ready because the initial browse connection may precede Host startup.
    const connectReading =
      !this.view || (view.phase === "ready" && this.view.phase !== "ready");
    this.view = view;
    if (connectReading) this.reading?.connect(view.threadId);
    for (const listener of this.listeners) listener();
  }
  bind(thread: ThreadId): void {
    if (this.thread === thread) return;
    this.thread = thread;
    this.generation++;
    void this.act("inspect");
  }
  async act(
    kind: Exclude<
      RuntimeCommand["kind"],
      "stop" | "continue" | "answer" | "dismiss"
    >,
  ): Promise<void> {
    const threadId = this.thread;
    if (!threadId) return;
    const generation = this.generation;
    const traceId = crypto.randomUUID();
    try {
      const view = await this.bridge.request({ kind, threadId, traceId });
      if (generation === this.generation && view.threadId === threadId)
        this.publish(view);
    } catch {
      if (generation !== this.generation) return;
      this.publish({
        threadId,
        traceId,
        configuration: this.view?.configuration ?? "配置来源尚未确认",
        revision: this.view?.revision ?? 0,
        phase: "interrupted",
        trusted: this.view?.trusted ?? false,
        busy: kind === "start" || (this.view?.busy ?? false),
        model: this.view?.model ?? null,
        message: "连接状态无法确认。草稿仍保留，请重新检查状态；不会自动发送。",
      });
    }
  }
  async control(kind: "stop" | "continue"): Promise<void> {
    const current = this.view;
    if (!current?.generation || !this.thread) return;
    try {
      const view = await this.bridge.request({
        kind,
        threadId: this.thread,
        traceId: crypto.randomUUID(),
        generation: current.generation,
      });
      if (this.thread === view.threadId) this.publish(view);
    } catch {
      if (this.view === current)
        this.publish({
          ...current,
          message: "控制结果未知。请检查状态，不会自动重试。",
        });
    }
  }
  async answer(id: string, answer: Answer): Promise<void> {
    const current = this.view;
    if (!current?.interactions || !this.thread) return;
    try {
      const view = await this.bridge.request({
        kind: "answer",
        threadId: this.thread,
        traceId: crypto.randomUUID(),
        generation: current.interactions.generation,
        id,
        answer,
      });
      if (this.thread === view.threadId) this.publish(view);
    } catch {
      if (this.view === current)
        this.publish({
          ...current,
          message: "回答结果未知，请核对原生交互；不会自动重答。",
        });
    }
  }
  async dismiss(id: string): Promise<void> {
    const current = this.view;
    if (!current?.interactions || !this.thread) return;
    try {
      const view = await this.bridge.request({
        kind: "dismiss",
        threadId: this.thread,
        traceId: crypto.randomUUID(),
        generation: current.interactions.generation,
        id,
      });
      if (this.thread === view.threadId) this.publish(view);
    } catch {
      if (this.view === current)
        this.publish({
          ...current,
          message: "关闭未知交互失败，请核对原生交互后重试。",
        });
    }
  }
  dispose(): void {
    this.generation++;
    this.unsubscribe();
    this.reading?.dispose();
    this.listeners.clear();
  }
}
