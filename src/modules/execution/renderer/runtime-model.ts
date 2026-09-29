import type { ThreadId } from "../../../shared/identity";
import { type UiMessage, uiMessage } from "../../../shared/messages/contracts";
import type { Answer } from "../contracts/interactions";
import type {
  RuntimeBridge,
  RuntimeCommand,
  RuntimeFailure,
  RuntimeView,
} from "../contracts/public";
export class RuntimeModel {
  private view: RuntimeView | null = null;
  private readonly listeners = new Set<() => void>();
  private thread: ThreadId | null = null;
  private generation = 0;
  private readonly unsubscribe: () => void;
  constructor(private readonly bridge: RuntimeBridge) {
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
    this.view = view;
    for (const listener of this.listeners) listener();
  }
  private failureView(
    threadId: ThreadId,
    traceId: string,
    message: RuntimeFailure["message"],
    busy: boolean,
  ): RuntimeView {
    return {
      threadId,
      traceId,
      configuration:
        this.view?.configuration ?? uiMessage("runtime.configUnknown"),
      revision: this.view?.revision ?? 0,
      phase: "interrupted",
      trusted: this.view?.trusted ?? false,
      busy,
      model: this.view?.model ?? null,
      message,
    };
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
      const reply = await this.bridge.request({ kind, threadId, traceId });
      if (generation !== this.generation) return;
      if (reply.kind === "view" && reply.view.threadId === threadId) {
        this.publish(reply.view);
        return;
      }
      if (reply.kind === "failed" && reply.error.traceId === traceId)
        this.publish(
          this.failureView(
            threadId,
            traceId,
            reply.error.message,
            kind === "start" || (this.view?.busy ?? false),
          ),
        );
      else if (reply.kind === "failed")
        throw Error("Mismatched runtime failure");
      else throw Error("Foreign runtime reply");
    } catch {
      if (generation !== this.generation) return;
      this.publish(
        this.failureView(
          threadId,
          traceId,
          uiMessage("runtime.connectionUnknown"),
          kind === "start" || (this.view?.busy ?? false),
        ),
      );
    }
  }
  async control(kind: "stop" | "continue"): Promise<void> {
    const current = this.view;
    if (!current?.generation || !this.thread) return;
    const traceId = crypto.randomUUID();
    await this.request(
      {
        kind,
        threadId: this.thread,
        traceId,
        generation: current.generation,
      },
      current,
      uiMessage("runtime.controlUnknown"),
    );
  }
  async answer(id: string, answer: Answer): Promise<void> {
    const current = this.view;
    if (!current?.interactions || !this.thread) return;
    const traceId = crypto.randomUUID();
    await this.request(
      {
        kind: "answer",
        threadId: this.thread,
        traceId,
        generation: current.interactions.generation,
        id,
        answer,
      },
      current,
      uiMessage("runtime.answerUnknown"),
    );
  }
  async dismiss(id: string): Promise<void> {
    const current = this.view;
    if (!current?.interactions || !this.thread) return;
    const traceId = crypto.randomUUID();
    await this.request(
      {
        kind: "dismiss",
        threadId: this.thread,
        traceId,
        generation: current.interactions.generation,
        id,
      },
      current,
      uiMessage("runtime.dismissUnknown"),
    );
  }
  /**
   * One funnel for the state-changing commands so all three share the same
   * staleness rule as `act`: a superseded request may still be in flight when
   * a newer one lands, and its reply must not resurrect an older view. The
   * generation is bumped per request, so only the newest reply applies.
   */
  private async request(
    command: RuntimeCommand,
    current: RuntimeView,
    unknownMessage: UiMessage,
  ): Promise<void> {
    const generation = ++this.generation;
    try {
      const reply = await this.bridge.request(command);
      if (generation !== this.generation) return;
      if (reply.kind === "view" && this.thread === reply.view.threadId)
        this.publish(reply.view);
      else if (
        reply.kind === "failed" &&
        reply.error.traceId === command.traceId
      )
        this.publish({
          ...current,
          traceId: command.traceId,
          message: reply.error.message,
        });
      else throw Error("Mismatched runtime reply");
    } catch {
      if (generation !== this.generation) return;
      this.publish({
        ...current,
        traceId: command.traceId,
        message: unknownMessage,
      });
    }
  }
  dispose(): void {
    this.generation++;
    this.unsubscribe();
    this.listeners.clear();
  }
}
