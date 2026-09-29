import { match } from "ts-pattern";
import { subscribeWithSelector } from "zustand/middleware";
import { createStore, type StateCreator } from "zustand/vanilla";
import { ConversationModel } from "../../modules/conversation/core/public";
import type { RuntimeView } from "../../modules/execution/contracts/public";
import {
  RuntimeModel,
  SubmissionModel,
} from "../../modules/execution/renderer/public";
import type { Draft, Failure } from "../../modules/input/contracts/public";
import { DraftController } from "../../modules/input/core/public";
import type { Preferences } from "../../modules/preferences/contracts/public";
import type { DesktopBridge, Reply } from "../contracts/desktop-bridge";
export type ViewState =
  | { kind: "loading" }
  | { kind: "failed"; error: Failure }
  | {
      kind: "ready";
      draft: Draft | null;
      directoryAvailable: boolean;
      preferences: Preferences;
      busy: boolean;
      notice: Failure | null;
    };
// The published application state is the whole store state: `publish` replaces
// it, so a state member never keeps fields of another member (see `publish`).
const appInitial: StateCreator<
  ViewState,
  [],
  [["zustand/subscribeWithSelector", never]]
> = () => ({ kind: "loading" });
const createAppStore = () =>
  createStore<ViewState>()(subscribeWithSelector(appInitial));
export type AppStore = ReturnType<typeof createAppStore>;
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
  // Vanilla store, no React binding: the renderer reads it through
  // `getSnapshot`/`subscribe`, exactly as it did with the listener set.
  private readonly store: AppStore = createAppStore();
  private disposed = false;
  controller: DraftController | null = null;
  submission: SubmissionModel | null = null;
  editorBoundary: { freeze: () => boolean; release: () => void } | null = null;
  async prepareClose(): Promise<boolean> {
    if (this.editorBoundary && !this.editorBoundary.freeze()) return false;
    const saved = await (this.controller?.flush() ?? Promise.resolve(true));
    if (!saved) this.editorBoundary?.release();
    return saved;
  }
  cancelClose(): void {
    this.editorBoundary?.release();
  }
  async reconcileDraft(): Promise<void> {
    const traceId = crypto.randomUUID();
    await this.controller?.reconcile(async () => {
      try {
        const reply = await this.bridge.request({ kind: "restore", traceId });
        return match(reply)
          .with({ kind: "ready" }, ({ draft }) =>
            draft
              ? { kind: "snapshot" as const, draft }
              : { kind: "failed" as const, error: transportFailure(traceId) },
          )
          .with({ kind: "failed" }, (value) => value)
          .with(
            { kind: "saved" },
            { kind: "preferences-saved" },
            { kind: "cancelled" },
            () => ({
              kind: "failed" as const,
              error: transportFailure(traceId),
            }),
          )
          .exhaustive();
      } catch {
        return { kind: "failed", error: transportFailure(traceId) };
      }
    });
  }
  readonly runtime: RuntimeModel | null;
  readonly reading: ConversationModel | null;
  private previousRuntimeView: RuntimeView | null = null;
  private readonly runtimeReadingUnsubscribe: (() => void) | null;
  get history() {
    return this.bridge.history;
  }
  get files() {
    return this.bridge.files;
  }
  get git() {
    return this.bridge.git;
  }
  constructor(private readonly bridge: DesktopBridge) {
    this.runtime = bridge.runtime ? new RuntimeModel(bridge.runtime) : null;
    this.reading = bridge.conversation
      ? new ConversationModel(bridge.conversation)
      : null;
    this.runtimeReadingUnsubscribe =
      this.runtime?.subscribe(this.syncReading) ?? null;
  }
  private syncReading = (): void => {
    const view = this.runtime?.getSnapshot();
    if (!view) return;
    const previous = this.previousRuntimeView;
    this.previousRuntimeView = view;
    if (
      this.reading &&
      (!previous ||
        previous.threadId !== view.threadId ||
        (view.phase === "ready" && previous.phase !== "ready"))
    )
      this.reading.connect(view.threadId);
  };
  dispose(): void {
    this.disposed = true;
    this.runtimeReadingUnsubscribe?.();
    this.reading?.dispose();
    this.runtime?.dispose();
  }
  /**
   * Live read of the published state. Every former `this.state` read resolves
   * to the current store value at the same point in time as before.
   */
  private get state(): ViewState {
    return this.store.getState();
  }
  getSnapshot = (): ViewState => this.store.getState();
  subscribe = (listener: () => void): (() => void) =>
    this.store.subscribe(
      (state) => state,
      () => listener(),
    );
  /**
   * Fine grained subscription for one projection of the published state, e.g.
   * one ready-state field. Plain `subscribe` still fires for every published
   * state.
   */
  subscribeTo<Selection>(
    selector: (state: ViewState) => Selection,
    listener: () => void,
  ): () => void {
    return this.store.subscribe(selector, () => listener());
  }
  private publish(state: ViewState): void {
    if (this.disposed) return;
    // `replace` keeps the whole-state assignment of the former container:
    // merging would let one union member keep fields of another.
    this.store.setState(state, true);
  }
  private accept(reply: Reply): void {
    match(reply)
      .with({ kind: "ready" }, ({ draft, directoryAvailable, preferences }) => {
        if (draft) this.runtime?.bind(draft.threadId);
        if (draft && !this.controller)
          this.controller = new DraftController(
            draft,
            async (expectedRevision, text) => {
              const traceId = crypto.randomUUID();
              let result: Reply;
              try {
                result = await this.bridge.request({
                  kind: "save",
                  traceId,
                  threadId: draft.threadId,
                  expectedRevision,
                  text,
                });
              } catch {
                return { kind: "failed", error: transportFailure(traceId) };
              }
              return match(result)
                .with({ kind: "saved" }, (value) => value)
                .with({ kind: "failed" }, (value) => value)
                .with(
                  { kind: "ready" },
                  { kind: "preferences-saved" },
                  { kind: "cancelled" },
                  () => ({
                    kind: "failed" as const,
                    error: transportFailure(traceId),
                  }),
                )
                .exhaustive();
            },
            () => transportFailure(crypto.randomUUID()),
          );
        if (
          draft &&
          this.controller &&
          this.bridge.submission &&
          !this.submission
        )
          this.submission = new SubmissionModel(
            this.bridge.submission,
            draft.threadId,
            this.controller,
          );
        document.documentElement.dataset.theme = preferences.theme;
        document.documentElement.dataset.density = preferences.density;
        this.publish({
          kind: "ready",
          draft,
          directoryAvailable,
          preferences,
          busy: false,
          notice: null,
        });
      })
      .with({ kind: "failed" }, ({ error }) => {
        if (this.state.kind === "ready")
          this.publish({ ...this.state, busy: false, notice: error });
        else this.publish({ kind: "failed", error });
      })
      .with({ kind: "cancelled" }, () => {
        if (this.state.kind === "ready")
          this.publish({ ...this.state, busy: false });
      })
      .with({ kind: "preferences-saved" }, ({ value }) => {
        document.documentElement.dataset.theme = value.theme;
        document.documentElement.dataset.density = value.density;
        if (this.state.kind === "ready")
          this.publish({
            ...this.state,
            preferences: value,
            busy: false,
            notice: null,
          });
      })
      .with({ kind: "saved" }, () => {})
      .exhaustive();
  }
  async start(): Promise<void> {
    const traceId = crypto.randomUUID();
    try {
      this.accept(await this.bridge.request({ kind: "restore", traceId }));
    } catch {
      this.accept({ kind: "failed", error: transportFailure(traceId) });
    }
  }
  async choose(): Promise<void> {
    if (this.state.kind !== "ready" || this.state.busy || this.state.draft)
      return;
    this.publish({ ...this.state, busy: true, notice: null });
    const traceId = crypto.randomUUID();
    try {
      this.accept(
        await this.bridge.request({ kind: "choose-project", traceId }),
      );
    } catch {
      this.accept({ kind: "failed", error: transportFailure(traceId) });
    }
  }
  async preference(key: Exclude<keyof Preferences, "locale">): Promise<void> {
    if (this.state.kind !== "ready" || this.state.busy) return;
    const current = this.state.preferences;
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
    this.publish({ ...this.state, busy: true });
    const traceId = crypto.randomUUID();
    try {
      this.accept(
        await this.bridge.request({ kind: "preferences", traceId, value }),
      );
    } catch {
      this.accept({ kind: "failed", error: transportFailure(traceId) });
    }
  }
}
