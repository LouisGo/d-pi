import { match } from "ts-pattern";
import { subscribeWithSelector } from "zustand/middleware";
import { createStore } from "zustand/vanilla";
import type { Failure } from "../../modules/input/contracts/public";
import type { DraftController } from "../../modules/input/core/public";
import type { Preferences } from "../../modules/preferences/contracts/public";
import type {
  Command,
  DesktopBridge,
  ReplyFor,
} from "../contracts/desktop-bridge";
import { ThreadModel } from "./thread-model";

export type WorkspaceState =
  | { kind: "empty" }
  | { kind: "thread"; thread: ThreadModel; directoryAvailable: boolean };
export type ViewState =
  | { kind: "loading" }
  | { kind: "failed"; error: Failure }
  | { kind: "disposed" }
  | {
      kind: "ready";
      workspace: WorkspaceState;
      preferences: Preferences;
      busy: boolean;
      notice: Failure | null;
    };
const createAppStore = () =>
  createStore<ViewState>()(
    subscribeWithSelector((): ViewState => ({ kind: "loading" })),
  );
export type AppStore = ReturnType<typeof createAppStore>;
export type AppStateStore = Pick<
  AppStore,
  "getState" | "getInitialState" | "subscribe"
>;
type RestoreReply = ReplyFor<
  Extract<Command, { kind: "restore" | "choose-project" }>
>;
type EditorBoundary = { freeze: () => boolean; release: () => void };
type EditorBinding = { owner: ThreadModel; boundary: EditorBoundary };

export function transportFailure(traceId: string): Failure {
  return {
    errorId: crypto.randomUUID(),
    traceId,
    code: "transport-unavailable",
    category: "transport",
    observedAt: "renderer",
    reportedBy: "unknown",
    attribution: "unknown",
    handlingOwner: "draft",
    recovery: "reconcile_first",
    message: { code: "draft.transportUnknown" },
  };
}
export class AppModel {
  private readonly store: AppStore = createAppStore();
  readonly stateStore: AppStateStore = this.store;
  private disposed = false;
  private requestGeneration = 0;
  private editorBinding: EditorBinding | null = null;
  private closeAttempt: {
    thread: ThreadModel | null;
    binding: EditorBinding | null;
  } | null = null;
  constructor(private readonly bridge: DesktopBridge) {}

  private get state(): ViewState {
    return this.store.getState();
  }
  private get activeThread(): ThreadModel | null {
    const state = this.state;
    return state.kind === "ready" && state.workspace.kind === "thread"
      ? state.workspace.thread
      : null;
  }
  get controller() {
    return this.activeThread?.controller ?? null;
  }
  get submission() {
    return this.activeThread?.submission ?? null;
  }
  get runtime() {
    return this.activeThread?.runtime ?? null;
  }
  get reading() {
    return this.activeThread?.reading ?? null;
  }
  get history() {
    return this.bridge.history;
  }
  get files() {
    return this.bridge.files;
  }
  get git() {
    return this.bridge.git;
  }
  isCurrentThread(thread: ThreadModel): boolean {
    return !this.disposed && this.activeThread === thread;
  }

  attachEditorBoundary(
    controller: DraftController,
    boundary: EditorBoundary,
  ): () => void {
    const owner = this.activeThread;
    if (!owner || owner.controller !== controller || this.disposed)
      return () => {};
    const binding = { owner, boundary };
    this.editorBinding = binding;
    return () => {
      if (this.editorBinding === binding) this.editorBinding = null;
    };
  }
  async prepareClose(): Promise<boolean> {
    if (this.disposed) return false;
    const binding = this.editorBinding;
    if (binding && !binding.boundary.freeze()) return false;
    const attempt = { thread: this.activeThread, binding };
    this.closeAttempt = attempt;
    const saved = await (attempt.thread?.controller.flush() ??
      Promise.resolve(true));
    if (
      this.disposed ||
      this.closeAttempt !== attempt ||
      this.activeThread !== attempt.thread ||
      this.editorBinding !== binding
    )
      return false;
    if (!saved) {
      binding?.boundary.release();
      this.closeAttempt = null;
    }
    return saved;
  }
  cancelClose(): void {
    const attempt = this.closeAttempt;
    this.closeAttempt = null;
    if (
      attempt?.binding &&
      this.editorBinding === attempt.binding &&
      this.activeThread === attempt.thread
    )
      attempt.binding.boundary.release();
  }
  async reconcileDraft(): Promise<void> {
    const controller = this.controller;
    if (!controller) return;
    const traceId = crypto.randomUUID();
    await controller.reconcile(async () => {
      try {
        const reply = await this.bridge.request({ kind: "restore", traceId });
        return match(reply)
          .with({ kind: "ready" }, ({ draft }) =>
            draft
              ? { kind: "snapshot" as const, draft }
              : { kind: "failed" as const, error: transportFailure(traceId) },
          )
          .with({ kind: "failed" }, (value) => value)
          .exhaustive();
      } catch {
        return { kind: "failed", error: transportFailure(traceId) };
      }
    });
  }
  dispose(): void {
    if (this.disposed) return;
    const thread = this.activeThread;
    this.disposed = true;
    this.requestGeneration++;
    this.editorBinding = null;
    this.closeAttempt = null;
    this.store.setState({ kind: "disposed" }, true);
    thread?.dispose();
  }
  getSnapshot = (): ViewState => this.store.getState();
  subscribe = (listener: () => void): (() => void) =>
    this.store.subscribe(
      (state) => state,
      () => listener(),
    );
  subscribeTo<Selection>(
    selector: (state: ViewState) => Selection,
    listener: () => void,
  ): () => void {
    return this.store.subscribe(selector, () => listener());
  }
  private publish(state: ViewState): void {
    if (!this.disposed) this.store.setState(state, true);
  }
  private isCurrent(generation: number): boolean {
    return !this.disposed && generation === this.requestGeneration;
  }
  private applyAppearance(value: Preferences): void {
    document.documentElement.dataset.theme = value.theme;
    document.documentElement.dataset.density = value.density;
  }
  private fail(error: Failure): void {
    const state = this.state;
    if (state.kind === "ready")
      this.publish({ ...state, busy: false, notice: error });
    else this.publish({ kind: "failed", error });
  }
  private acceptRestore(reply: RestoreReply): void {
    match(reply)
      .with({ kind: "ready" }, ({ draft, directoryAvailable, preferences }) => {
        const previous = this.activeThread;
        const thread = draft
          ? previous?.matches(draft)
            ? previous
            : new ThreadModel(draft, this.bridge, transportFailure)
          : null;
        const workspace: WorkspaceState = thread
          ? { kind: "thread", thread, directoryAvailable }
          : { kind: "empty" };
        this.applyAppearance(preferences);
        if (previous !== thread) {
          this.editorBinding = null;
          this.closeAttempt = null;
        }
        this.publish({
          kind: "ready",
          workspace,
          preferences,
          busy: false,
          notice: null,
        });
        if (previous !== thread) previous?.dispose();
      })
      .with({ kind: "failed" }, ({ error }) => this.fail(error))
      .with({ kind: "cancelled" }, () => {
        if (this.state.kind === "ready")
          this.publish({ ...this.state, busy: false });
      })
      .exhaustive();
  }
  async start(): Promise<void> {
    if (this.disposed) return;
    const generation = ++this.requestGeneration;
    const traceId = crypto.randomUUID();
    try {
      const reply = await this.bridge.request({ kind: "restore", traceId });
      if (this.isCurrent(generation)) this.acceptRestore(reply);
    } catch {
      if (this.isCurrent(generation)) this.fail(transportFailure(traceId));
    }
  }
  async choose(): Promise<void> {
    const state = this.state;
    if (
      this.disposed ||
      state.kind !== "ready" ||
      state.busy ||
      state.workspace.kind !== "empty"
    )
      return;
    const generation = ++this.requestGeneration;
    this.publish({ ...state, busy: true, notice: null });
    const traceId = crypto.randomUUID();
    try {
      const reply = await this.bridge.request({
        kind: "choose-project",
        traceId,
      });
      if (this.isCurrent(generation)) this.acceptRestore(reply);
    } catch {
      if (this.isCurrent(generation)) this.fail(transportFailure(traceId));
    }
  }
  async preference(key: Exclude<keyof Preferences, "locale">): Promise<void> {
    const state = this.state;
    if (this.disposed || state.kind !== "ready" || state.busy) return;
    const current = state.preferences;
    const value = match(key)
      .with("theme", () => ({
        ...current,
        theme:
          current.theme === "dark" ? ("light" as const) : ("dark" as const),
      }))
      .with("sendKey", () => ({
        ...current,
        sendKey:
          current.sendKey === "enter-newline"
            ? ("enter-send" as const)
            : ("enter-newline" as const),
      }))
      .with("density", () => ({
        ...current,
        density:
          current.density === "normal"
            ? ("compact" as const)
            : ("normal" as const),
      }))
      .exhaustive();
    const generation = ++this.requestGeneration;
    this.publish({ ...state, busy: true });
    const traceId = crypto.randomUUID();
    try {
      const reply = await this.bridge.request({
        kind: "preferences",
        traceId,
        value,
      });
      if (!this.isCurrent(generation)) return;
      match(reply)
        .with({ kind: "failed" }, ({ error }) => this.fail(error))
        .with({ kind: "preferences-saved" }, ({ value }) => {
          this.applyAppearance(value);
          if (this.state.kind === "ready")
            this.publish({
              ...this.state,
              preferences: value,
              busy: false,
              notice: null,
            });
        })
        .exhaustive();
    } catch {
      if (this.isCurrent(generation)) this.fail(transportFailure(traceId));
    }
  }
}
