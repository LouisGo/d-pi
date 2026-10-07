import { match } from "ts-pattern";
import { subscribeWithSelector } from "zustand/middleware";
import { createStore } from "zustand/vanilla";
import type { Failure } from "../../../modules/input/contracts/public";
import type { DraftController } from "../../../modules/input/core/public";
import {
  DraftEditorCache,
  hasUnpersistedAttachmentSources,
} from "../../../modules/input/renderer/public";
import type { Preferences } from "../../../modules/preferences/contracts/public";
import type { ThreadContext } from "../../../modules/threads/contracts/public";
import type {
  Command,
  DesktopBridge,
  ReplyFor,
} from "../../contracts/desktop-bridge";
import { AttentionModel } from "./attention-model";
import { ThreadModel } from "./thread-model";

export type ThreadSelectionState =
  | { kind: "empty" }
  | { kind: "thread"; thread: ThreadModel; directoryAvailable: boolean };
export type ThreadTransitionResult =
  | { kind: "applied"; selection: ThreadSelectionState }
  | {
      kind: "blocked";
      reason:
        | "not-ready"
        | "busy"
        | "closing"
        | "composing"
        | "save-failed"
        | "superseded"
        | "selection-unknown";
    }
  | { kind: "cancelled" }
  | { kind: "failed"; error: Failure }
  | { kind: "unknown"; error: Failure };
export type ViewState =
  | { kind: "loading" }
  | { kind: "failed"; error: Failure }
  | { kind: "disposed" }
  | {
      kind: "ready";
      threadSelection: ThreadSelectionState;
      preferences: Preferences;
      busy: boolean;
      notice: Failure | null;
      threadTransition?: "pending" | "unknown";
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
  Extract<
    Command,
    { kind: "restore" | "choose-project" | "select-thread" | "new-thread" }
  >
>;
type EditorBoundary = {
  freeze: () => boolean;
  release: () => void;
  canLeaveView?: () => boolean;
};
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
  readonly draftEditors = new DraftEditorCache();
  private readonly store: AppStore = createAppStore();
  readonly stateStore: AppStateStore = this.store;
  readonly threadListStore = createStore<{
    threads: ThreadContext[];
    failed: boolean;
  }>(() => ({
    threads: [],
    failed: false,
  }));
  private readonly threads = new Map<string, ThreadModel>();
  private disposed = false;
  private systemAppearance: MediaQueryList | null = null;
  private appearancePreference: Preferences["theme"] = "light";
  private readonly updateSystemAppearance = () => {
    if (this.disposed || this.appearancePreference !== "system") return;
    this.writeTheme(this.systemAppearance?.matches ? "dark" : "light");
  };
  private requestGeneration = 0;
  private preferenceWrite: Promise<void> | null = null;
  private editorBinding: EditorBinding | null = null;
  private closeAttempt: {
    thread: ThreadModel | null;
    binding: EditorBinding | null;
  } | null = null;
  readonly attention: AttentionModel;
  constructor(private readonly bridge: DesktopBridge) {
    this.attention = new AttentionModel(bridge.attention);
  }

  private get state(): ViewState {
    return this.store.getState();
  }
  private get activeThread(): ThreadModel | null {
    const state = this.state;
    return state.kind === "ready" && state.threadSelection.kind === "thread"
      ? state.threadSelection.thread
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
  get configuration() {
    return this.bridge.configuration;
  }
  get history() {
    return this.bridge.history;
  }
  get attachments() {
    return this.bridge.attachments;
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
  // A developer page replaces only the view. Save pending input before its
  // editor unmounts, without selecting a Thread or touching execution resources.
  async prepareViewNavigation(): Promise<boolean> {
    const state = this.state;
    if (
      this.disposed ||
      state.kind !== "ready" ||
      state.busy ||
      state.threadTransition !== undefined ||
      this.closeAttempt
    )
      return false;
    const thread = this.activeThread;
    const binding = this.editorBinding;
    const generation = this.requestGeneration;
    if (binding?.boundary.canLeaveView?.() === false) return false;
    if (binding && !binding.boundary.freeze()) return false;
    try {
      const saved = await (thread?.controller.flush() ?? Promise.resolve(true));
      return (
        saved &&
        binding?.boundary.canLeaveView?.() !== false &&
        !this.disposed &&
        generation === this.requestGeneration &&
        this.activeThread === thread &&
        this.editorBinding === binding &&
        this.state.kind === "ready" &&
        !this.state.busy &&
        this.state.threadTransition === undefined &&
        !this.closeAttempt
      );
    } finally {
      // A later selection/close may now own the freeze; do not release its lease.
      if (
        !this.disposed &&
        generation === this.requestGeneration &&
        this.editorBinding === binding &&
        !this.closeAttempt &&
        this.state.kind === "ready" &&
        this.state.threadTransition === undefined
      )
        binding?.boundary.release();
    }
  }
  async prepareClose(): Promise<boolean> {
    if (
      this.disposed ||
      (this.state.kind === "ready" && this.state.threadTransition !== undefined)
    )
      return false;
    if (hasUnpersistedAttachmentSources()) {
      if (this.state.kind === "ready")
        this.store.setState({
          ...this.state,
          notice: {
            errorId: crypto.randomUUID(),
            traceId: crypto.randomUUID(),
            code: "invalid-request",
            category: "validation",
            observedAt: "renderer",
            reportedBy: "app",
            attribution: "unknown",
            handlingOwner: "draft",
            recovery: "user_action",
            message: { code: "attachment.closePending" },
          },
        });
      return false;
    }
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
    this.disposed = true;
    this.systemAppearance?.removeEventListener(
      "change",
      this.updateSystemAppearance,
    );
    this.requestGeneration++;
    this.editorBinding = null;
    this.closeAttempt = null;
    this.store.setState({ kind: "disposed" }, true);
    for (const thread of this.threads.values()) thread.dispose();
    this.threads.clear();
    this.draftEditors.dispose();
    this.attention.dispose();
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
    const { dataset } = document.documentElement;
    this.appearancePreference = value.theme;
    if (
      !this.systemAppearance &&
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function"
    ) {
      this.systemAppearance = window.matchMedia("(prefers-color-scheme: dark)");
      this.systemAppearance.addEventListener(
        "change",
        this.updateSystemAppearance,
      );
    }
    this.writeTheme(
      value.theme === "system"
        ? this.systemAppearance?.matches
          ? "dark"
          : "light"
        : value.theme,
    );
    // Legacy density remains in the persistence DTO, never in UI geometry.
    if (dataset.density !== undefined) delete dataset.density;
  }
  private writeTheme(theme: "light" | "dark"): void {
    const { dataset } = document.documentElement;
    if (dataset.theme !== theme) dataset.theme = theme;
  }
  private fail(error: Failure): void {
    const state = this.state;
    if (state.kind === "ready")
      this.publish({ ...state, busy: false, notice: error });
    else this.publish({ kind: "failed", error });
  }
  private acceptRestore(
    reply: RestoreReply,
    startOnCreate = false,
  ): ThreadTransitionResult {
    return match(reply)
      .with({ kind: "ready" }, ({ draft, directoryAvailable, preferences }) => {
        // Thread selection does not own desktop preferences. A selection
        // receipt may have been sampled before an independent preference save.
        const appearance =
          this.state.kind === "ready" ? this.state.preferences : preferences;
        const previous = this.activeThread;
        const cached = draft ? this.threads.get(draft.threadId) : null;
        const thread = draft
          ? cached?.matches(draft) &&
            (cached.controller.getSnapshot().kind !== "saved" ||
              (cached.controller.getEditorSnapshot().revision ===
                draft.revision &&
                cached.controller.getTextSnapshot() === draft.text))
            ? cached
            : new ThreadModel(
                draft,
                this.bridge,
                transportFailure,
                startOnCreate,
              )
          : null;
        if (thread) this.threads.set(thread.context.threadId, thread);
        if (cached && cached !== thread) cached.dispose();
        const threadSelection: ThreadSelectionState = thread
          ? { kind: "thread", thread, directoryAvailable }
          : { kind: "empty" };
        this.applyAppearance(appearance);
        if (previous !== thread) {
          this.editorBinding = null;
          this.closeAttempt = null;
        }
        this.publish({
          kind: "ready",
          threadSelection,
          preferences: appearance,
          busy: false,
          notice: null,
        });
        void this.refreshThreads();
        return { kind: "applied" as const, selection: threadSelection };
      })
      .with({ kind: "failed" }, ({ error }) => {
        this.fail(error);
        return { kind: "failed" as const, error };
      })
      .with({ kind: "cancelled" }, () => {
        if (this.state.kind === "ready") {
          const ready = { ...this.state, busy: false };
          delete ready.threadTransition;
          this.publish(ready);
        }
        return { kind: "cancelled" as const };
      })
      .exhaustive();
  }
  async start(): Promise<void> {
    if (this.disposed) return;
    void this.attention.start();
    const generation = ++this.requestGeneration;
    const traceId = crypto.randomUUID();
    try {
      const reply = await this.bridge.request({ kind: "restore", traceId });
      if (this.isCurrent(generation)) this.acceptRestore(reply);
    } catch {
      if (this.isCurrent(generation)) this.fail(transportFailure(traceId));
    }
  }
  async refreshThreads(): Promise<void> {
    const traceId = crypto.randomUUID();
    try {
      const reply = await this.bridge.request({
        kind: "list-threads",
        traceId,
      });
      if (!this.disposed && reply.kind === "threads")
        this.threadListStore.setState({
          threads: reply.threads,
          failed: false,
        });
      else if (!this.disposed) this.threadListStore.setState({ failed: true });
    } catch {
      if (!this.disposed) this.threadListStore.setState({ failed: true });
    }
  }
  async choose(): Promise<ThreadTransitionResult> {
    return this.changeThread({
      kind: "choose-project",
      traceId: crypto.randomUUID(),
    });
  }
  async newThread(): Promise<ThreadTransitionResult> {
    const thread = this.activeThread;
    if (thread)
      return this.changeThread({
        kind: "new-thread",
        threadId: thread.context.threadId,
        traceId: crypto.randomUUID(),
      });
    return { kind: "blocked", reason: "not-ready" };
  }
  async selectThread(
    threadId: ThreadContext["threadId"],
  ): Promise<ThreadTransitionResult> {
    if (this.disposed || this.state.kind !== "ready")
      return { kind: "blocked", reason: "not-ready" };
    if (this.state.busy) return { kind: "blocked", reason: "busy" };
    if (this.closeAttempt) return { kind: "blocked", reason: "closing" };
    if (
      this.state.kind === "ready" &&
      this.state.threadTransition === "unknown"
    )
      return { kind: "blocked", reason: "selection-unknown" };
    if (
      this.state.kind === "ready" &&
      this.activeThread?.context.threadId === threadId
    )
      return { kind: "applied", selection: this.state.threadSelection };
    return this.changeThread({
      kind: "select-thread",
      threadId,
      traceId: crypto.randomUUID(),
    });
  }
  private async changeThread(
    command: Extract<
      Command,
      { kind: "choose-project" | "select-thread" | "new-thread" }
    >,
  ): Promise<ThreadTransitionResult> {
    const state = this.state;
    if (this.disposed || state.kind !== "ready")
      return { kind: "blocked", reason: "not-ready" };
    if (state.busy) return { kind: "blocked", reason: "busy" };
    if (state.threadTransition === "unknown")
      return { kind: "blocked", reason: "selection-unknown" };
    if (this.closeAttempt) return { kind: "blocked", reason: "closing" };
    const generation = ++this.requestGeneration;
    const binding = this.editorBinding;
    if (binding && !binding.boundary.freeze())
      return { kind: "blocked", reason: "composing" };
    const previous = this.activeThread;
    this.publish({
      ...state,
      busy: true,
      notice: null,
      threadTransition: "pending",
    });
    try {
      const saved = await (previous?.controller.flush() ??
        Promise.resolve(true));
      if (!this.isCurrent(generation))
        return { kind: "blocked", reason: "superseded" };
      if (!saved) {
        this.publish({ ...state, busy: false });
        return { kind: "blocked", reason: "save-failed" };
      }
      const reply = await this.bridge.request(command);
      if (this.isCurrent(generation)) {
        if (reply.kind === "failed")
          return await this.readSelection(generation, previous, reply.error);
        return this.acceptRestore(
          reply,
          command.kind === "new-thread" || command.kind === "choose-project",
        );
      }
      return { kind: "blocked", reason: "superseded" };
    } catch {
      const error = transportFailure(command.traceId);
      if (this.isCurrent(generation))
        return await this.readSelection(generation, previous, error);
      return { kind: "blocked", reason: "superseded" };
    } finally {
      if (
        this.activeThread === previous &&
        this.editorBinding === binding &&
        !(
          this.state.kind === "ready" &&
          this.state.threadTransition === "unknown"
        )
      )
        binding?.boundary.release();
    }
  }
  /** A command receipt can be lost after Main changes its selection. Never resend it. */
  private async readSelection(
    generation: number,
    previous: ThreadModel | null,
    error: Failure,
  ): Promise<ThreadTransitionResult> {
    try {
      const reply = await this.bridge.request({
        kind: "restore",
        traceId: crypto.randomUUID(),
      });
      if (!this.isCurrent(generation))
        return { kind: "blocked", reason: "superseded" };
      if (reply.kind === "ready") {
        const result = this.acceptRestore(reply);
        if (this.activeThread?.context.threadId !== previous?.context.threadId)
          return result;
        this.fail(error);
        return { kind: "failed", error };
      }
    } catch {
      /* The authoritative selection remains unknown. */
    }
    if (!this.isCurrent(generation))
      return { kind: "blocked", reason: "superseded" };
    if (this.state.kind === "ready")
      this.publish({
        ...this.state,
        busy: false,
        threadTransition: "unknown",
        notice: error,
      });
    return { kind: "unknown", error };
  }
  async reconcileSelection(): Promise<ThreadTransitionResult> {
    const state = this.state;
    if (state.kind !== "ready" || state.threadTransition !== "unknown")
      return { kind: "blocked", reason: "not-ready" };
    if (state.busy || this.closeAttempt)
      return { kind: "blocked", reason: "busy" };
    const binding = this.editorBinding;
    const previous = this.activeThread;
    const generation = ++this.requestGeneration;
    this.publish({ ...state, busy: true });
    const result = await this.readSelection(
      generation,
      previous,
      state.notice ?? transportFailure(crypto.randomUUID()),
    );
    if (
      this.activeThread === previous &&
      this.editorBinding === binding &&
      !(
        this.state.kind === "ready" && this.state.threadTransition === "unknown"
      )
    )
      binding?.boundary.release();
    return result;
  }
  preference(key: "theme" | "sendKey"): Promise<void> {
    const save = () => this.savePreference(key);
    const writing = this.preferenceWrite
      ? this.preferenceWrite.then(save)
      : save();
    this.preferenceWrite = writing;
    void writing.finally(() => {
      if (this.preferenceWrite === writing) this.preferenceWrite = null;
    });
    return writing;
  }
  private async savePreference(key: "theme" | "sendKey"): Promise<void> {
    const state = this.state;
    if (this.disposed || state.kind !== "ready") return;
    const current = state.preferences;
    const value = match(key)
      .with("theme", () => ({
        ...current,
        theme: match(current.theme)
          .with("light", () => "dark" as const)
          .with("dark", () => "system" as const)
          .with("system", () => "light" as const)
          .exhaustive(),
      }))
      .with("sendKey", () => ({
        ...current,
        sendKey:
          current.sendKey === "enter-newline"
            ? ("enter-send" as const)
            : ("enter-newline" as const),
      }))
      .exhaustive();
    const traceId = crypto.randomUUID();
    const failSave = (error: Failure) => {
      if (!this.disposed && this.state.kind === "ready")
        this.publish({ ...this.state, notice: error });
    };
    try {
      const reply = await this.bridge.request({
        kind: "preferences",
        traceId,
        value,
      });
      if (this.disposed) return;
      match(reply)
        .with({ kind: "failed" }, ({ error }) => failSave(error))
        .with({ kind: "preferences-saved" }, ({ value }) => {
          this.applyAppearance(value);
          if (this.state.kind === "ready")
            this.publish({
              ...this.state,
              preferences: value,
              notice: null,
            });
        })
        .exhaustive();
    } catch {
      failSave(transportFailure(traceId));
    }
  }
}
