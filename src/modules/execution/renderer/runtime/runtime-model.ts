import { match } from "ts-pattern";
import { subscribeWithSelector } from "zustand/middleware";
import { createStore, type StateCreator } from "zustand/vanilla";
import type { ThreadId } from "../../../../shared/identity";
import {
  type UiMessage,
  uiMessage,
} from "../../../../shared/messages/contracts";
import type { SubagentConfigurationCommand } from "../../../configuration/contracts/public";
import type {
  Answer,
  AskFormAction,
  InteractionDraft,
  InteractionEditorHandle,
  InteractionEditorSurface,
  InteractionOperation,
  RequestKey,
} from "../../contracts/interactions";
import { interactionDraftIdentity } from "../../contracts/interactions";
import type {
  RuntimeBridge,
  RuntimeCommand,
  RuntimeFailure,
  RuntimeView,
} from "../../contracts/public";
import type { QueueAction } from "../../contracts/queue";
import { RuntimeCommandSchema } from "../../contracts/runtime";
import {
  type AskAnswerResult,
  buildAskAnswer,
  reduceAskForm,
  seedAskForm,
} from "../../core/public";

export interface RuntimeState {
  view: RuntimeView | null;
  thread: ThreadId | null;
  requestGeneration: number;
  disposed: boolean;
  interactionDrafts: ReadonlyMap<string, InteractionDraft>;
  interactionOperations: ReadonlyMap<string, InteractionOperation>;
}

const initial: StateCreator<
  RuntimeState,
  [],
  [["zustand/subscribeWithSelector", never]]
> = () => ({
  view: null,
  thread: null,
  requestGeneration: 0,
  disposed: false,
  interactionDrafts: new Map(),
  interactionOperations: new Map(),
});

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
  private unsubscribe: (() => void) | undefined;
  private preparationActive = true;
  /** App-owned selection suppresses only new preparation, never active work. */
  setPreparationActive(active: boolean): void {
    this.preparationActive = active;
  }
  constructor(private readonly bridge: RuntimeBridge) {}
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
    if (
      view.interactions &&
      !view.interactions.nativeSessionKey &&
      state.view?.interactions?.nativeSessionKey &&
      view.interactions.connectionGeneration ===
        state.view.interactions.connectionGeneration
    )
      view = {
        ...view,
        interactions: {
          ...view.interactions,
          nativeSessionKey: state.view.interactions.nativeSessionKey,
        },
      };
    this.observeInteractions(view);
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
    this.unsubscribe?.();
    this.unsubscribe = this.bridge.subscribe((view) => {
      if (view.threadId === this.store.getState().thread) this.publish(view);
    }, thread);
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
        requestGeneration === this.store.getState().requestGeneration &&
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
  ): Promise<RuntimeView | null> {
    const state = this.store.getState();
    if (!state.thread || !state.view || state.disposed) return null;
    const traceId = crypto.randomUUID();
    await this.request(
      {
        kind: "select-model",
        threadId: state.thread,
        traceId,
        selection,
      },
      state.view,
      uiMessage("runtime.connectionUnknown"),
    );
    const latest = this.store.getState();
    return !latest.disposed &&
      latest.thread === state.thread &&
      latest.view?.traceId === traceId
      ? latest.view
      : null;
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
  private interactionKey(id: string, view = this.getSnapshot()): string | null {
    const generation = view?.interactions?.connectionGeneration;
    return view && generation && view.interactions
      ? interactionDraftIdentity(view.threadId, view.interactions, id)
      : null;
  }
  interactionRequestKey(id: string): RequestKey | null {
    const view = this.getSnapshot();
    const source = view?.interactions;
    return view &&
      source?.nativeSessionKey &&
      source.items.some((item) => item.id === id)
      ? {
          threadId: view.threadId,
          nativeSessionKey: source.nativeSessionKey,
          connectionGeneration: source.connectionGeneration,
          requestId: id,
        }
      : null;
  }
  interactionDraft(id: string): InteractionDraft | null {
    const key = this.interactionKey(id);
    return key
      ? (this.store.getState().interactionDrafts.get(key) ?? null)
      : null;
  }
  interactionOperation(id: string): InteractionOperation | null {
    const key = this.interactionKey(id);
    return key
      ? (this.store.getState().interactionOperations.get(key) ?? null)
      : null;
  }
  editInteraction(id: string, patch: Partial<InteractionDraft>): void {
    const key = this.interactionKey(id);
    const draft = this.interactionDraft(id);
    if (!key || !draft || this.store.getState().disposed) return;
    const drafts = new Map(this.store.getState().interactionDrafts);
    drafts.set(key, { ...draft, ...patch });
    this.store.setState({ interactionDrafts: drafts });
  }
  captureInteractionEditor(id: string): InteractionEditorHandle | null {
    const identity = this.interactionKey(id);
    const draft = this.interactionDraft(id);
    return identity && draft
      ? {
          identity,
          surface: draft.editorSurface ?? "timeline",
          version: draft.editorVersion ?? 0,
        }
      : null;
  }
  private editorCurrent(id: string, handle?: InteractionEditorHandle): boolean {
    const current = this.captureInteractionEditor(id);
    return (
      !!current &&
      (!handle ||
        (current.identity === handle.identity &&
          current.surface === handle.surface &&
          current.version === handle.version))
    );
  }
  chooseInteractionEditor(
    id: string,
    surface: InteractionEditorSurface,
    handle?: InteractionEditorHandle,
  ): void {
    if (!this.editorCurrent(id, handle)) return;
    const item = this.getSnapshot()?.interactions?.items.find(
      (item) => item.id === id,
    );
    const draft = this.interactionDraft(id);
    const operation = this.interactionOperation(id);
    if (
      item?.status !== "pending" ||
      !draft ||
      (draft.editorSurface ?? "timeline") === surface ||
      (operation && operation.status !== "not-dispatched")
    )
      return;
    const key = this.interactionKey(id);
    if (!key) return;
    const drafts = new Map(this.store.getState().interactionDrafts);
    if (surface === "dock") {
      // One processing form per Thread Dock. Transfer the prior pending owner
      // back to Timeline atomically, retaining its draft and invalidating callbacks.
      for (const other of this.getSnapshot()?.interactions?.items ?? []) {
        if (other.id === id || other.status !== "pending") continue;
        const otherKey = this.interactionKey(other.id);
        const previous = otherKey ? drafts.get(otherKey) : undefined;
        if (otherKey && previous?.editorSurface === "dock")
          drafts.set(otherKey, {
            ...previous,
            editorSurface: "timeline",
            editorVersion: (previous.editorVersion ?? 0) + 1,
          });
      }
    }
    drafts.set(key, {
      ...draft,
      editorSurface: surface,
      editorVersion: (draft.editorVersion ?? 0) + 1,
      editorFocusVersion: (draft.editorVersion ?? 0) + 1,
    });
    this.store.setState({ interactionDrafts: drafts });
  }
  editAnswerDraft(
    id: string,
    patch: Partial<Pick<InteractionDraft, "value" | "selection">>,
    surface: InteractionEditorSurface,
    handle?: InteractionEditorHandle,
  ): void {
    const item = this.getSnapshot()?.interactions?.items.find(
      (item) => item.id === id,
    );
    const operation = this.interactionOperation(id);
    if (
      item?.status !== "pending" ||
      (operation && operation.status !== "not-dispatched") ||
      !this.editorCurrent(id, handle) ||
      (this.interactionDraft(id)?.editorSurface ?? "timeline") !== surface
    )
      return;
    this.editInteraction(id, patch);
  }
  editFollowUpDraft(
    id: string,
    value: string,
    handle?: InteractionEditorHandle,
  ): void {
    const item = this.getSnapshot()?.interactions?.items.find(
      (item) => item.id === id,
    );
    // The pending answer owner ends with the native default. Timeline owns the
    // separate steer input; this never modifies the frozen answer or resends it.
    if (
      item?.status !== "written" ||
      !item.defaultAnswered ||
      item.method === "ask" ||
      !this.editorCurrent(id, handle) ||
      this.interactionDraft(id)?.followUpSending
    )
      return;
    this.editInteraction(id, { value });
  }
  editAsk(
    id: string,
    action: AskFormAction,
    surface: InteractionEditorSurface = "timeline",
    handle?: InteractionEditorHandle,
  ): void {
    const item = this.getSnapshot()?.interactions?.items.find(
      (item) => item.id === id,
    );
    const draft = this.interactionDraft(id);
    const operation = this.interactionOperation(id);
    if (
      item?.method !== "ask" ||
      !this.editorCurrent(id, handle) ||
      !draft?.ask ||
      (draft.editorSurface ?? "timeline") !== surface ||
      item.status !== "pending" ||
      (operation && operation.status !== "not-dispatched")
    )
      return;
    this.editInteraction(id, {
      ask: reduceAskForm(item.questions, draft.ask, action),
    });
  }
  askAnswerResult(id: string): AskAnswerResult {
    const item = this.getSnapshot()?.interactions?.items.find(
      (item) => item.id === id,
    );
    const draft = this.interactionDraft(id);
    return item?.method === "ask" && draft?.ask
      ? buildAskAnswer(item.questions, draft.ask)
      : { kind: "incomplete" };
  }
  submitAsk(
    id: string,
    surface: InteractionEditorSurface,
    handle?: InteractionEditorHandle,
  ): Promise<InteractionOperation | null> {
    const result = this.askAnswerResult(id);
    return result.kind === "ready"
      ? this.answerFromEditor(id, result.answer, surface, handle)
      : Promise.resolve(null);
  }
  answerFromEditor(
    id: string,
    answer: Answer,
    surface: InteractionEditorSurface,
    handle?: InteractionEditorHandle,
  ): Promise<InteractionOperation | null> {
    return this.editorCurrent(id, handle) &&
      (this.interactionDraft(id)?.editorSurface ?? "timeline") === surface
      ? this.answer(id, answer)
      : Promise.resolve(null);
  }
  async followUpInteraction(
    id: string,
    submit: (text: string) => Promise<{
      ok: boolean;
      message: UiMessage | null;
      submissionId: string | null;
    }>,
    handle?: InteractionEditorHandle,
  ): Promise<void> {
    if (!this.editorCurrent(id, handle)) return;
    const key = this.interactionKey(id);
    const draft = this.interactionDraft(id);
    if (!key || !draft || draft.followUpSending || !draft.value.trim()) return;
    this.editInteraction(id, { followUpSending: true, followUpError: null });
    try {
      const result = await submit(draft.value);
      if (this.interactionKey(id) !== key || this.store.getState().disposed)
        return;
      const current = this.interactionDraft(id);
      if (!current) return;
      this.editInteraction(id, {
        followUpSending: false,
        followUpIds: result.submissionId
          ? [...current.followUpIds, result.submissionId].slice(-32)
          : current.followUpIds,
        followUpError:
          !result.ok || !result.submissionId
            ? (result.message ?? "fallback")
            : null,
      });
    } catch {
      if (this.interactionKey(id) === key)
        this.editInteraction(id, {
          followUpSending: false,
          followUpError: "fallback",
        });
    }
  }
  private observeInteractions(view: RuntimeView): void {
    const state = this.store.getState();
    if (state.thread !== view.threadId) return;
    const generation = view.interactions?.connectionGeneration;
    if (!generation) return;
    // Older snapshots can carry a valid independent result, but never restore
    // an old connection or remove a current draft.
    if (
      state.view &&
      view.revision < state.view.revision &&
      state.view.interactions?.connectionGeneration !== generation
    )
      return;
    const drafts = new Map(state.interactionDrafts);
    const operations = new Map(state.interactionOperations);
    for (const item of view.interactions?.items ?? []) {
      const source = view.interactions;
      if (!source) continue;
      const key = interactionDraftIdentity(view.threadId, source, item.id);
      // Resolve previously unknown source only within this exact native scope.
      const previousSource = state.view?.interactions;
      if (
        !drafts.has(key) &&
        source.nativeSessionKey &&
        previousSource &&
        !previousSource.nativeSessionKey &&
        previousSource.connectionGeneration === generation &&
        state.view?.threadId === view.threadId
      ) {
        const previousKey = interactionDraftIdentity(
          view.threadId,
          previousSource,
          item.id,
        );
        const draft = drafts.get(previousKey),
          operation = operations.get(previousKey);
        if (draft) drafts.set(key, draft);
        if (operation)
          operations.set(key, {
            ...operation,
            nativeSessionKey: source.nativeSessionKey,
          });
      }
      if (!drafts.has(key))
        drafts.set(key, {
          editorSurface: "timeline",
          editorVersion: 0,
          value: item.prefill ?? "",
          ...(item.method === "ask"
            ? { ask: seedAskForm(item.questions) }
            : {}),
          selection: null,
          followUpIds: [],
          followUpSending: false,
        });
    }
    for (const result of view.interactionOperations ?? []) {
      if (
        result.threadId !== view.threadId ||
        result.connectionGeneration !== generation ||
        (result.nativeSessionKey !== undefined &&
          result.nativeSessionKey !== view.interactions?.nativeSessionKey)
      )
        continue;
      const key = this.interactionKey(result.requestId, view);
      if (!key) continue;
      const existing = operations.get(key);
      if (
        !existing ||
        (existing.operationId === result.operationId &&
          existing.status === "dispatching")
      )
        operations.set(key, result);
    }
    // The Host owns a maximum of 32 current requests; retain drafts only for
    // that mirror. A reconnect cannot reuse an answer under an old ID.
    if (!state.view || view.revision >= state.view.revision) {
      const retained = new Set(
        (view.interactions?.items ?? []).map((item) =>
          this.interactionKey(item.id, view),
        ),
      );
      for (const key of drafts.keys())
        if (!retained.has(key)) drafts.delete(key);
      for (const key of operations.keys())
        if (!retained.has(key)) operations.delete(key);
    }
    this.store.setState({
      interactionDrafts: drafts,
      interactionOperations: operations,
    });
  }
  answer(id: string, answer: Answer): Promise<InteractionOperation | null> {
    return this.respond("answer", id, answer);
  }
  dismiss(id: string): Promise<InteractionOperation | null> {
    return this.respond("dismiss", id);
  }
  private async respond(
    kind: "answer" | "dismiss",
    id: string,
    answer?: Answer,
  ): Promise<InteractionOperation | null> {
    const state = this.store.getState();
    const view = state.view;
    const item = view?.interactions?.items.find((item) => item.id === id);
    const key = this.interactionKey(id);
    const generation = view?.interactions?.connectionGeneration;
    if (
      state.disposed ||
      !state.thread ||
      !view ||
      !item ||
      !key ||
      !generation
    )
      return null;
    const previous = this.interactionOperation(id);
    if (
      previous?.status === "dispatching" ||
      (kind === "answer" &&
        (item.status !== "pending" ||
          (previous && previous.status !== "not-dispatched")))
    )
      return previous;
    const traceId = crypto.randomUUID();
    const operation: InteractionOperation = {
      operationId: traceId,
      threadId: state.thread,
      connectionGeneration: generation,
      requestId: id,
      ...(view.interactions?.nativeSessionKey
        ? { nativeSessionKey: view.interactions.nativeSessionKey }
        : {}),
      kind,
      status: "dispatching",
    };
    const operations = new Map(state.interactionOperations);
    operations.set(key, operation);
    this.store.setState({ interactionOperations: operations });
    if (answer) this.editInteraction(id, { answer });
    const command: RuntimeCommand =
      kind === "answer" && answer
        ? {
            kind,
            threadId: state.thread,
            traceId,
            connectionGeneration: generation,
            id,
            ...(view.interactions?.nativeSessionKey
              ? { nativeSessionKey: view.interactions.nativeSessionKey }
              : {}),
            answer,
          }
        : {
            kind: "dismiss",
            threadId: state.thread,
            traceId,
            connectionGeneration: generation,
            id,
          };
    let result: InteractionOperation = { ...operation, status: "unknown" };
    try {
      const reply = await this.bridge.request(command);
      if (reply.kind === "failed" && reply.error.traceId === traceId)
        result = {
          ...operation,
          status: "not-dispatched",
          message: reply.error.code,
        };
      else if (reply.kind === "view" && reply.view.threadId === state.thread) {
        result =
          reply.view.interactionOperations?.find(
            (value) =>
              value.operationId === traceId &&
              value.threadId === state.thread &&
              value.connectionGeneration === generation &&
              value.requestId === id &&
              value.kind === kind,
          ) ?? result;
        if (this.store.getState().thread === state.thread)
          this.publish(reply.view);
      }
    } catch {
      /* Missing transport evidence is unknown, never permission to retry. */
    }
    const current = this.store.getState();
    const currentKey = this.interactionKey(id);
    const currentSource = current.view?.interactions;
    const currentOperation = currentKey
      ? current.interactionOperations.get(currentKey)
      : undefined;
    if (
      !current.disposed &&
      current.thread === state.thread &&
      currentKey &&
      currentSource?.connectionGeneration === generation &&
      (operation.nativeSessionKey === undefined ||
        operation.nativeSessionKey === currentSource.nativeSessionKey) &&
      (result.nativeSessionKey === undefined ||
        result.nativeSessionKey === currentSource.nativeSessionKey) &&
      currentOperation?.operationId === traceId &&
      currentOperation.status === "dispatching"
    ) {
      const next = new Map(current.interactionOperations);
      // An observed source can resolve the private unknown-source index while
      // this command is awaiting transport. The operation ID proves the alias;
      // a different connection or previously known source never settles here.
      next.set(currentKey, {
        ...result,
        ...(currentSource.nativeSessionKey
          ? { nativeSessionKey: currentSource.nativeSessionKey }
          : {}),
      });
      this.store.setState({ interactionOperations: next });
    }
    return result;
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
            ...(command.kind === "select-model"
              ? {
                  modelChanging: false,
                  modelOperation: {
                    traceId: command.traceId,
                    status: "failed" as const,
                  },
                }
              : {}),
          });
        })
        .exhaustive();
    } catch {
      if (requestGeneration !== this.store.getState().requestGeneration) return;
      this.publish({
        ...current,
        traceId: command.traceId,
        message: unknownMessage,
        ...(command.kind === "select-model"
          ? {
              modelChanging: false,
              modelOperation: {
                traceId: command.traceId,
                status: "unknown" as const,
              },
            }
          : {}),
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
    this.unsubscribe?.();
  }
}
