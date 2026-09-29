import { match } from "ts-pattern";
import type { Draft, Failure } from "../features/draft/contracts";
import { DraftController } from "../features/draft/controller";
import { RuntimeModel } from "../features/runtime/model";
import { SubmissionModel } from "../features/submission/model";
import type { DesktopBridge, Reply } from "../shared/desktop-bridge";
import type { Preferences } from "../shared/preferences";
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
  private state: ViewState = { kind: "loading" };
  private listeners = new Set<() => void>();
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
  }
  getSnapshot = (): ViewState => this.state;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  private publish(state: ViewState): void {
    this.state = state;
    for (const listener of this.listeners) listener();
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
