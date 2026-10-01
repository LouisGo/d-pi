import { ConversationModel } from "../../../modules/conversation/core/public";
import type { RuntimeView } from "../../../modules/execution/contracts/public";
import {
  RuntimeModel,
  SubmissionModel,
} from "../../../modules/execution/renderer/public";
import type { Draft, Failure } from "../../../modules/input/contracts/public";
import { DraftController } from "../../../modules/input/core/public";
import type { ThreadContext } from "../../../modules/threads/contracts/public";
import type { DesktopBridge } from "../../contracts/desktop-bridge";

/** Application-owned Thread resources. Detaching a view does not dispose them. */
export class ThreadModel {
  readonly context: ThreadContext;
  readonly key: string;
  readonly controller: DraftController;
  readonly submission: SubmissionModel | null = null;
  readonly runtime: RuntimeModel | null = null;
  readonly reading: ConversationModel | null = null;
  private previousRuntimeView: RuntimeView | null = null;
  private runtimeReadingUnsubscribe: (() => void) | null = null;
  private disposed = false;

  constructor(
    draft: Draft,
    bridge: DesktopBridge,
    transportFailure: (traceId: string) => Failure,
  ) {
    this.context = {
      threadId: draft.threadId,
      workingDirectoryId: draft.workingDirectoryId,
      directory: draft.directory,
    };
    this.key = JSON.stringify([
      draft.threadId,
      draft.workingDirectoryId,
      draft.directory,
    ]);
    this.controller = new DraftController(
      draft,
      async (expectedRevision, text) => {
        const traceId = crypto.randomUUID();
        try {
          return await bridge.request({
            kind: "save",
            traceId,
            threadId: draft.threadId,
            expectedRevision,
            text,
          });
        } catch {
          return { kind: "failed", error: transportFailure(traceId) };
        }
      },
      () => transportFailure(crypto.randomUUID()),
    );
    try {
      this.runtime = bridge.runtime ? new RuntimeModel(bridge.runtime) : null;
      this.reading = bridge.conversation
        ? new ConversationModel(bridge.conversation)
        : null;
      this.submission = bridge.submission
        ? new SubmissionModel(
            bridge.submission,
            draft.threadId,
            this.controller,
          )
        : null;
      this.runtimeReadingUnsubscribe =
        this.runtime?.subscribe(this.syncReading) ?? null;
      this.runtime?.bind(draft.threadId);
    } catch (cause) {
      this.dispose();
      throw cause;
    }
  }

  matches(context: ThreadContext): boolean {
    return (
      this.context.threadId === context.threadId &&
      this.context.workingDirectoryId === context.workingDirectoryId &&
      this.context.directory === context.directory
    );
  }

  private syncReading = (): void => {
    if (this.disposed) return;
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
    if (this.disposed) return;
    this.disposed = true;
    this.submission?.dispose();
    this.controller.dispose();
    this.runtimeReadingUnsubscribe?.();
    this.reading?.dispose();
    this.runtime?.dispose();
  }
}
