import { match } from "ts-pattern";
import { subscribeWithSelector } from "zustand/middleware";
import { createStore } from "zustand/vanilla";
import type { Failure } from "../../../modules/input/contracts/public";
import type { DraftController } from "../../../modules/input/core/public";
import {
  DraftEditorCache,
  hasUnpersistedAttachmentSources,
} from "../../../modules/input/renderer/public";
import type {
  ModelPickerPreferenceChange,
  Preferences,
} from "../../../modules/preferences/contracts/public";
import { updateModelPickerPreferences } from "../../../modules/preferences/core/public";
import type {
  ProjectContext,
  ThreadContext,
  ThreadMutation,
} from "../../../modules/threads/contracts/public";
import type {
  Command,
  DesktopBridge,
  ReplyFor,
} from "../../contracts/desktop-bridge";
import { AttentionModel } from "./attention-model";
import { SidebarModel } from "./sidebar-model";
import { ThreadCommands } from "./thread-commands";
import { ThreadModel } from "./thread-model";

export type {
  ThreadSelectionState,
  ThreadTransitionResult,
} from "./thread-transition";

import type {
  ThreadSelectionState,
  ThreadTransitionResult,
} from "./thread-transition";
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
type PreferenceChange =
  | { kind: "theme"; target: Preferences["theme"] | undefined }
  | { kind: "sendKey"; target: Preferences["sendKey"] }
  | { kind: "modelPicker"; change: ModelPickerPreferenceChange };

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
// Indexing replies are partial samples, not evidence that an existing row vanished.
function mergeDiscoveryRows<T>(
  current: T[],
  incoming: T[],
  identity: (row: T) => string,
): T[] {
  return [
    ...new Map(
      [...current, ...incoming].map((row) => [identity(row), row]),
    ).values(),
  ];
}
export class AppModel {
  readonly sidebar: SidebarModel;
  readonly commands: ThreadCommands;
  readonly draftEditors: DraftEditorCache;
  private readonly store: AppStore = createAppStore();
  readonly stateStore: AppStateStore = this.store;
  readonly threadListStore = createStore<{
    threads: ThreadContext[];
    projects: ProjectContext[];
    failed: boolean;
    // A settled discovery reply has arrived; an empty result also counts.
    initialized: boolean;
    pending?: boolean;
    nativeIndex?: "ready" | "indexing" | "partial" | "unavailable" | undefined;
  }>(() => ({
    threads: [],
    projects: [],
    failed: false,
    initialized: false,
    pending: true,
  }));
  private readonly threads = new Map<string, ThreadModel>();
  private readonly cacheSubscriptions = new Map<ThreadModel, () => void>();
  private cachePruneScheduled = false;
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
    releaseSources: () => void;
  } | null = null;
  readonly attention: AttentionModel;
  constructor(
    private readonly bridge: DesktopBridge,
    private readonly threadCacheLimit = 8,
  ) {
    this.sidebar = new SidebarModel(bridge);
    this.commands = new ThreadCommands(this);
    this.draftEditors = new DraftEditorCache(undefined, bridge.attachments);
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
  private closeInputMessage(): Failure["message"] | null {
    const inactive = Array.from(this.threads.values()).find(
      (thread) =>
        thread !== this.activeThread &&
        thread.controller.getSnapshot().kind !== "saved",
    );
    if (inactive)
      return {
        code: "draft.inactiveClosePending",
        params: { thread: inactive.context.threadId.slice(0, 6) },
      };
    if (
      hasUnpersistedAttachmentSources() ||
      Array.from(this.threads.values()).some(
        (thread) => !thread.canPrepareInput(),
      )
    )
      return { code: "attachment.closePending" };
    return null;
  }
  private showCloseBlocked(message: Failure["message"]): void {
    if (this.state.kind !== "ready") return;
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
        message,
      },
    });
  }
  async prepareClose(): Promise<boolean> {
    if (
      this.disposed ||
      this.closeAttempt !== null ||
      (this.state.kind === "ready" && this.state.threadTransition !== undefined)
    )
      return false;
    const blocked = this.closeInputMessage();
    if (blocked) {
      this.showCloseBlocked(blocked);
      return false;
    }
    const binding = this.editorBinding;
    if (binding && !binding.boundary.freeze()) return false;
    const sourceReleases = Array.from(this.threads.values(), (thread) => {
      const releasePreparation = thread.suspendPreparation();
      const releaseInput = thread.freezeInputSources();
      return () => {
        releaseInput();
        releasePreparation();
      };
    });
    const attempt = {
      thread: this.activeThread,
      binding,
      releaseSources: () => {
        for (const release of sourceReleases) release();
      },
    };
    this.closeAttempt = attempt;
    const saved = await (attempt.thread?.controller.flush() ??
      Promise.resolve(true));
    if (
      this.disposed ||
      this.closeAttempt !== attempt ||
      this.activeThread !== attempt.thread ||
      this.editorBinding !== binding
    ) {
      attempt.releaseSources();
      return false;
    }
    const rechecked = this.closeInputMessage();
    if (rechecked) {
      this.showCloseBlocked(rechecked);
      this.cancelClose();
      return false;
    }
    if (!saved) {
      binding?.boundary.release();
      this.closeAttempt = null;
      attempt.releaseSources();
    }
    return saved;
  }
  cancelClose(): void {
    const attempt = this.closeAttempt;
    this.closeAttempt = null;
    attempt?.releaseSources();
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
    this.closeAttempt?.releaseSources();
    this.closeAttempt = null;
    this.store.setState({ kind: "disposed" }, true);
    for (const thread of this.threads.values()) thread.dispose();
    for (const unsubscribe of this.cacheSubscriptions.values()) unsubscribe();
    this.cacheSubscriptions.clear();
    this.threads.clear();
    this.draftEditors.dispose();
    this.attention.dispose();
    this.sidebar.dispose();
    this.commands.dispose();
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
  private acceptRestore(reply: RestoreReply): ThreadTransitionResult {
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
            : new ThreadModel(draft, this.bridge, transportFailure)
          : null;
        if (thread) {
          // Presentation metadata refreshes without replacing the runtime owner.
          thread.context.title = draft?.title;
          // Map insertion order is selection recency, not creation recency.
          this.threads.delete(thread.context.threadId);
          this.threads.set(thread.context.threadId, thread);
          if (!this.cacheSubscriptions.has(thread)) {
            const releases = [
              thread.runtime?.subscribe(() => this.scheduleCachePrune()),
              thread.submission?.subscribe(() => this.scheduleCachePrune()),
            ];
            this.cacheSubscriptions.set(thread, () =>
              releases.forEach((release) => release?.()),
            );
          }
        }
        if (cached && cached !== thread) {
          this.cacheSubscriptions.get(cached)?.();
          this.cacheSubscriptions.delete(cached);
          cached.dispose();
        }
        const threadSelection: ThreadSelectionState = thread
          ? { kind: "thread", thread, directoryAvailable }
          : { kind: "empty" };
        this.applyAppearance(appearance);
        if (previous !== thread) {
          previous?.deactivate();
          this.editorBinding = null;
          this.closeAttempt?.releaseSources();
          this.closeAttempt = null;
        }
        this.publish({
          kind: "ready",
          threadSelection,
          preferences: appearance,
          busy: false,
          notice: null,
        });
        thread?.activate();
        this.scheduleCachePrune();
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
  private scheduleCachePrune(): void {
    if (this.cachePruneScheduled || this.disposed) return;
    this.cachePruneScheduled = true;
    queueMicrotask(() => {
      this.cachePruneScheduled = false;
      if (this.disposed || (this.state.kind === "ready" && this.state.busy))
        return;
      // Work in flight is pinned outside the idle-cache budget.
      let idle = [...this.threads.values()].filter(
        (thread) => thread === this.activeThread || thread.canEvict(),
      ).length;
      for (const [id, thread] of this.threads) {
        if (idle <= this.threadCacheLimit) break;
        const history = this.draftEditors.historyState(thread.key);
        if (
          !thread.canEvict() ||
          history.pending ||
          history.failed ||
          history.limited ||
          !this.draftEditors.evict(thread.key)
        )
          continue;
        this.threads.delete(id);
        this.cacheSubscriptions.get(thread)?.();
        this.cacheSubscriptions.delete(thread);
        thread.dispose();
        idle--;
      }
    });
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
  private threadRefreshPending: Promise<void> | null = null;
  refreshThreads(afterMutation = false): Promise<void> {
    if (this.threadRefreshPending)
      return afterMutation
        ? this.threadRefreshPending.then(() => this.refreshThreads())
        : this.threadRefreshPending;
    this.threadRefreshPending = this.discoverThreads().finally(() => {
      this.threadRefreshPending = null;
    });
    return this.threadRefreshPending;
  }
  private async discoverThreads(): Promise<void> {
    if (this.disposed) return;
    this.threadListStore.setState({ pending: true });
    const traceId = crypto.randomUUID();
    try {
      let next = true;
      while (next && !this.disposed) {
        const reply = await this.bridge.request({
          kind: "list-threads",
          traceId,
        });
        if (this.disposed) return;
        if (reply.kind !== "threads") {
          this.threadListStore.setState({ failed: true, pending: false });
          return;
        }
        if (reply.sidebar) this.sidebar.accept(reply.sidebar);
        next = reply.nativeIndex === "indexing";
        this.threadListStore.setState((state) => ({
          threads: next
            ? mergeDiscoveryRows(
                state.threads,
                reply.threads,
                (row) => row.threadId,
              )
            : reply.threads,
          projects: next
            ? mergeDiscoveryRows(
                state.projects,
                reply.projects ?? [],
                (row) => row.workingDirectoryId,
              )
            : (reply.projects ?? []),
          failed: false,
          initialized: state.initialized || !next,
          pending: next,
          nativeIndex: reply.nativeIndex,
        }));
      }
    } catch {
      if (!this.disposed)
        this.threadListStore.setState({ failed: true, pending: false });
    }
  }
  async choose(): Promise<ThreadTransitionResult> {
    return this.changeThread({
      kind: "choose-project",
      traceId: crypto.randomUUID(),
    });
  }
  async newThread(
    sourceThreadId?: ThreadContext["threadId"],
  ): Promise<ThreadTransitionResult> {
    const threadId = sourceThreadId ?? this.activeThread?.context.threadId;
    if (threadId)
      return this.changeThread({
        kind: "new-thread",
        threadId,
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
  manageThread(
    threadId: ThreadContext["threadId"],
    mutation: ThreadMutation,
  ): Promise<ThreadTransitionResult> {
    return this.changeThread({
      kind: "thread-command",
      threadId,
      mutation,
      traceId: crypto.randomUUID(),
    });
  }
  private async changeThread(
    command: Extract<
      Command,
      {
        kind:
          | "choose-project"
          | "select-thread"
          | "new-thread"
          | "thread-command";
      }
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
    previous?.deactivate();
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
        if (reply.kind === "thread-command-result") {
          const restored = await this.bridge.request({
            kind: "restore",
            traceId: crypto.randomUUID(),
          });
          if (!this.isCurrent(generation))
            return { kind: "blocked", reason: "superseded" };
          const result = this.acceptRestore(restored);
          if (
            command.kind === "thread-command" &&
            command.mutation.kind === "delete"
          ) {
            const removed = this.threads.get(command.threadId);
            if (removed && removed !== this.activeThread) {
              this.cacheSubscriptions.get(removed)?.();
              this.cacheSubscriptions.delete(removed);
              this.threads.delete(command.threadId);
              removed.dispose();
            }
          }
          await this.refreshThreads(true);
          return result;
        }
        return this.acceptRestore(reply);
      }
      return { kind: "blocked", reason: "superseded" };
    } catch {
      const error = transportFailure(command.traceId);
      if (this.isCurrent(generation)) {
        const result = await this.readSelection(generation, previous, error);
        if (command.kind === "thread-command") await this.refreshThreads(true);
        return result;
      }
      return { kind: "blocked", reason: "superseded" };
    } finally {
      if (
        this.activeThread === previous &&
        this.editorBinding === binding &&
        !(
          this.state.kind === "ready" &&
          this.state.threadTransition === "unknown"
        )
      ) {
        if (
          this.isCurrent(generation) &&
          this.state.kind === "ready" &&
          !this.state.busy &&
          this.state.threadTransition === undefined
        )
          previous?.activate();
        binding?.boundary.release();
      }
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
  modelPreference(change: ModelPickerPreferenceChange): Promise<void> {
    return this.enqueuePreference({ kind: "modelPicker", change });
  }
  preference(
    ...args:
      | [key: "theme", target?: Preferences["theme"]]
      | [key: "sendKey", target?: Preferences["sendKey"]]
  ): Promise<void> {
    const change =
      args[0] === "theme"
        ? { kind: "theme" as const, target: args[1] }
        : { kind: "sendKey" as const, target: args[1] };
    return this.enqueuePreference(change);
  }
  private enqueuePreference(change: PreferenceChange): Promise<void> {
    const save = () => this.savePreference(change);
    const writing = this.preferenceWrite
      ? this.preferenceWrite.then(save)
      : save();
    this.preferenceWrite = writing;
    const release = () => {
      if (this.preferenceWrite === writing) this.preferenceWrite = null;
    };
    void writing.then(release, release);
    return writing;
  }
  private async savePreference(change: PreferenceChange): Promise<void> {
    const state = this.state;
    if (this.disposed || state.kind !== "ready") return;
    const current = state.preferences;
    if (
      change.kind !== "modelPicker" &&
      change.target !== undefined &&
      current[change.kind] === change.target
    )
      return;
    const value = match(change)
      .with({ kind: "theme" }, ({ target }) => ({
        ...current,
        theme:
          target ??
          match(current.theme)
            .with("light", () => "dark" as const)
            .with("dark", () => "system" as const)
            .with("system", () => "light" as const)
            .exhaustive(),
      }))
      .with({ kind: "sendKey" }, ({ target }) => ({
        ...current,
        sendKey:
          target ??
          (current.sendKey === "enter-newline"
            ? ("enter-send" as const)
            : ("enter-newline" as const)),
      }))
      .with({ kind: "modelPicker" }, ({ change }) => ({
        ...current,
        modelPicker: updateModelPickerPreferences(current.modelPicker, change),
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
