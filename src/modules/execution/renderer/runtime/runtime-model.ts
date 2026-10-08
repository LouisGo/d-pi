import { match } from "ts-pattern";
import { subscribeWithSelector } from "zustand/middleware";
import { createStore, type StateCreator } from "zustand/vanilla";
import type { ThreadId } from "../../../../shared/identity";
import {
  type UiMessage,
  uiMessage,
} from "../../../../shared/messages/contracts";
import type { SubagentConfigurationCommand } from "../../../configuration/contracts/public";
import type { Answer } from "../../contracts/interactions";
import type {
  RuntimeBridge,
  RuntimeCommand,
  RuntimeFailure,
  RuntimeView,
} from "../../contracts/public";
import type { QueueAction } from "../../contracts/queue";
import { RuntimeCommandSchema } from "../../contracts/runtime";

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
  private preparationActive = true;
  /** App-owned selection suppresses only new preparation, never active work. */
  setPreparationActive(active: boolean): void {
    this.preparationActive = active;
  }
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
  bind(thread: ThreadId): Promise<void> {
    const state = this.store.getState();
    if (state.disposed || state.thread === thread) return Promise.resolve();
    this.store.setState({
      thread,
      requestGeneration: state.requestGeneration + 1,
      view: null,
    });
    return this.act("inspect");
  }
  async act(
    kind: Exclude<
      RuntimeCommand["kind"],
      | "stop"
      | "continue"
      | "answer"
      | "dismiss"
      | "select-model"
      | "configure-subagent"
      | "manage-queue"
    >,
  ): Promise<void> {
    const state = this.store.getState();
    if (state.disposed) return;
    const threadId = state.thread;
    if (!threadId) return;
    const requestGeneration = state.requestGeneration + 1;
    this.store.setState({ requestGeneration });
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
      const current = this.store.getState().view;
      if (
        kind === "allow" &&
        this.preparationActive &&
        current?.phase === "allowed" &&
        current.trusted &&
        !current.busy
      )
        await this.act("start");
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
  async selectModel(
    selection: Extract<RuntimeCommand, { kind: "select-model" }>["selection"],
  ): Promise<void> {
    const state = this.store.getState();
    if (!state.thread || !state.view || state.disposed) return;
    await this.request(
      {
        kind: "select-model",
        threadId: state.thread,
        traceId: crypto.randomUUID(),
        selection,
      },
      state.view,
      uiMessage("runtime.connectionUnknown"),
    );
  }
  private queueWrites: Promise<void> = Promise.resolve();
  configureSubagent(command: SubagentConfigurationCommand): Promise<void> {
    return this.nativeChange("configure-subagent", command);
  }
  manageQueue(command: QueueAction): Promise<void> {
    const target = this.store.getState();
    const generation = target.view?.connectionGeneration;
    const write = this.queueWrites.then(async () => {
      if (
        this.store.getState().thread !== target.thread ||
        this.store.getState().requestGeneration !== target.requestGeneration ||
        this.getSnapshot()?.connectionGeneration !== generation
      )
        return;
      const view = this.getSnapshot();
      if (
        !view?.control?.queueState ||
        (view.queueOperation?.status === "unknown" &&
          !view.queueOperation.reconciled)
      )
        return;
      const revision =
        command.action === "update-edit" ||
        command.action === "save-edit" ||
        command.action === "cancel-edit"
          ? view.control.queueState.revision
          : command.revision;
      await this.nativeChange("manage-queue", { ...command, revision });
    });
    this.queueWrites = write.catch(() => {});
    return write;
  }
  private async nativeChange(
    kind: "configure-subagent" | "manage-queue",
    value: SubagentConfigurationCommand | QueueAction,
  ): Promise<void> {
    const state = this.store.getState();
    const view = state.view;
    if (
      state.disposed ||
      !state.thread ||
      !view?.connectionGeneration ||
      !view.trusted ||
      view.phase !== "ready"
    )
      return;
    const field =
      kind === "manage-queue" ? "queueOperation" : "subagentOperation";
    if (view[field]?.status === "pending") return;
    const traceId = crypto.randomUUID();
    const command =
      kind === "manage-queue"
        ? {
            kind,
            threadId: state.thread,
            traceId,
            connectionGeneration: view.connectionGeneration,
            command: value,
          }
        : {
            kind,
            threadId: state.thread,
            traceId,
            connectionGeneration: view.connectionGeneration,
            command: value,
          };
    // Parse the public union once before crossing the bridge; no type assertion
    // can accidentally send a queue command as a configuration command.
    const parsed = RuntimeCommandSchema.safeParse(command);
    if (!parsed.success) {
      const oversized =
        kind === "manage-queue" &&
        parsed.error.issues.some(
          (issue) =>
            issue.path[0] === "command" &&
            issue.path[1] === "text" &&
            (issue.code === "too_big" || issue.code === "custom"),
        );
      this.store.setState({
        view: {
          ...view,
          [field]: {
            traceId,
            status: "failed",
            code: oversized ? "content-too-large" : "invalid-operation",
          },
          message: uiMessage(
            oversized ? "queue.contentTooLarge" : "runtime.controlFailed",
          ),
        },
      });
      return;
    }
    this.store.setState({
      view: { ...view, [field]: { traceId, status: "pending" } },
    });
    try {
      const reply = await this.bridge.request(parsed.data);
      const current = this.store.getState();
      if (
        current.disposed ||
        current.thread !== state.thread ||
        current.requestGeneration !== state.requestGeneration ||
        current.view?.connectionGeneration !== view.connectionGeneration
      )
        return;
      if (
        reply.kind === "view" &&
        reply.view.threadId === state.thread &&
        reply.view.connectionGeneration === view.connectionGeneration
      )
        this.publish(reply.view);
      else if (
        reply.kind === "failed" &&
        reply.error.traceId === traceId &&
        current.view
      )
        this.store.setState({
          view: {
            ...current.view,
            message: reply.error.message,
            [field]: { traceId, status: "failed" },
          },
        });
      else throw Error("Mismatched operation reply");
    } catch {
      const current = this.store.getState();
      if (
        current.disposed ||
        current.thread !== state.thread ||
        current.requestGeneration !== state.requestGeneration ||
        current.view?.connectionGeneration !== view.connectionGeneration
      )
        return;
      this.store.setState({
        view: {
          ...current.view,
          [field]: { traceId, status: "unknown" },
          message: uiMessage("runtime.controlUnknown"),
        },
      });
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
