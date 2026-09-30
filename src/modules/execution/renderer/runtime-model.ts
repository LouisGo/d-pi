import { match } from "ts-pattern";
import { subscribeWithSelector } from "zustand/middleware";
import { createStore, type StateCreator } from "zustand/vanilla";
import type { ThreadId } from "../../../shared/identity";
import { type UiMessage, uiMessage } from "../../../shared/messages/contracts";
import type { Answer } from "../contracts/interactions";
import type {
  RuntimeBridge,
  RuntimeCommand,
  RuntimeFailure,
  RuntimeView,
} from "../contracts/public";

export interface RuntimeState {
  view: RuntimeView | null;
  thread: ThreadId | null;
  requestGeneration: number;
  disposed: boolean;
}

const initial: StateCreator<
  RuntimeState,
  [],
  [["zustand/subscribeWithSelector", never]]
> = () => ({ view: null, thread: null, requestGeneration: 0, disposed: false });

const createRuntimeStore = () =>
  createStore<RuntimeState>()(subscribeWithSelector(initial));
export type RuntimeStore = ReturnType<typeof createRuntimeStore>;
/** Read-only face of the store, kept for the React binding and for tests. */
export type RuntimeStateStore = Pick<
  RuntimeStore,
  "getState" | "getInitialState" | "subscribe"
>;

export class RuntimeModel {
  private readonly store: RuntimeStore = createRuntimeStore();
  readonly stateStore: RuntimeStateStore = this.store;
  private readonly unsubscribe: () => void;
  constructor(private readonly bridge: RuntimeBridge) {
    this.unsubscribe = bridge.subscribe((view) => {
      if (view.threadId === this.store.getState().thread) this.publish(view);
    });
  }
  getSnapshot = (): RuntimeView | null => this.store.getState().view;
  subscribe = (listener: () => void): (() => void) =>
    this.store.subscribe(
      (state) => state.view,
      () => listener(),
    );
  /**
   * Fine grained subscription for one projection of the runtime view, so an
   * unrelated field change does not notify every consumer.
   */
  subscribeTo<Selection>(
    selector: (state: RuntimeState) => Selection,
    listener: () => void,
  ): () => void {
    return this.store.subscribe(selector, () => listener());
  }
  private publish(view: RuntimeView): void {
    const state = this.store.getState();
    if (state.disposed) return;
    if (state.view && view.revision < state.view.revision) return;
    this.store.setState({ view });
  }
  private failureView(
    threadId: ThreadId,
    traceId: string,
    message: RuntimeFailure["message"],
    busy: boolean,
  ): RuntimeView {
    const current = this.store.getState().view;
    return {
      threadId,
      traceId,
      configuration:
        current?.configuration ?? uiMessage("runtime.configUnknown"),
      revision: current?.revision ?? 0,
      phase: "interrupted",
      trusted: current?.trusted ?? false,
      busy,
      model: current?.model ?? null,
      message,
    };
  }
  bind(thread: ThreadId): void {
    const state = this.store.getState();
    if (state.disposed || state.thread === thread) return;
    this.store.setState({
      thread,
      requestGeneration: state.requestGeneration + 1,
      view: null,
    });
    void this.act("inspect");
  }
  async act(
    kind: Exclude<
      RuntimeCommand["kind"],
      "stop" | "continue" | "answer" | "dismiss"
    >,
  ): Promise<void> {
    const state = this.store.getState();
    if (state.disposed) return;
    const threadId = state.thread;
    if (!threadId) return;
    const requestGeneration = state.requestGeneration;
    const traceId = crypto.randomUUID();
    try {
      const reply = await this.bridge.request({ kind, threadId, traceId });
      if (requestGeneration !== this.store.getState().requestGeneration) return;
      match(reply)
        .with({ kind: "view" }, ({ view }) => {
          if (view.threadId === threadId) this.publish(view);
          else throw Error("Foreign runtime reply");
        })
        .with({ kind: "failed" }, ({ error }) => {
          if (error.traceId !== traceId)
            throw Error("Mismatched runtime failure");
          this.publish(
            this.failureView(
              threadId,
              traceId,
              error.message,
              kind === "start" || (this.store.getState().view?.busy ?? false),
            ),
          );
        })
        .exhaustive();
    } catch {
      if (requestGeneration !== this.store.getState().requestGeneration) return;
      this.publish(
        this.failureView(
          threadId,
          traceId,
          uiMessage("runtime.connectionUnknown"),
          kind === "start" || (this.store.getState().view?.busy ?? false),
        ),
      );
    }
  }
  async control(kind: "stop" | "continue"): Promise<void> {
    const state = this.store.getState();
    if (state.disposed) return;
    const current = state.view;
    const thread = state.thread;
    if (!current?.connectionGeneration || !thread) return;
    const traceId = crypto.randomUUID();
    await this.request(
      {
        kind,
        threadId: thread,
        traceId,
        connectionGeneration: current.connectionGeneration,
      },
      current,
      uiMessage("runtime.controlUnknown"),
    );
  }
  async answer(id: string, answer: Answer): Promise<void> {
    const state = this.store.getState();
    if (state.disposed) return;
    const current = state.view;
    const thread = state.thread;
    if (!current?.interactions || !thread) return;
    const traceId = crypto.randomUUID();
    await this.request(
      {
        kind: "answer",
        threadId: thread,
        traceId,
        connectionGeneration: current.interactions.connectionGeneration,
        id,
        answer,
      },
      current,
      uiMessage("runtime.answerUnknown"),
    );
  }
  async dismiss(id: string): Promise<void> {
    const state = this.store.getState();
    if (state.disposed) return;
    const current = state.view;
    const thread = state.thread;
    if (!current?.interactions || !thread) return;
    const traceId = crypto.randomUUID();
    await this.request(
      {
        kind: "dismiss",
        threadId: thread,
        traceId,
        connectionGeneration: current.interactions.connectionGeneration,
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
   * requestGeneration is bumped per request, so only the newest reply applies.
   */
  private async request(
    command: RuntimeCommand,
    current: RuntimeView,
    unknownMessage: UiMessage,
  ): Promise<void> {
    if (this.store.getState().disposed) return;
    const requestGeneration = this.store.getState().requestGeneration + 1;
    this.store.setState({ requestGeneration });
    try {
      const reply = await this.bridge.request(command);
      if (requestGeneration !== this.store.getState().requestGeneration) return;
      match(reply)
        .with({ kind: "view" }, ({ view }) => {
          if (this.store.getState().thread === view.threadId)
            this.publish(view);
          else throw Error("Mismatched runtime reply");
        })
        .with({ kind: "failed" }, ({ error }) => {
          if (error.traceId !== command.traceId)
            throw Error("Mismatched runtime reply");
          this.publish({
            ...current,
            traceId: command.traceId,
            message: error.message,
          });
        })
        .exhaustive();
    } catch {
      if (requestGeneration !== this.store.getState().requestGeneration) return;
      this.publish({
        ...current,
        traceId: command.traceId,
        message: unknownMessage,
      });
    }
  }
  dispose(): void {
    const state = this.store.getState();
    if (state.disposed) return;
    this.store.setState({
      requestGeneration: state.requestGeneration + 1,
      disposed: true,
    });
    this.unsubscribe();
  }
}
