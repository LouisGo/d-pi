import { ConversationModel } from "../../../modules/conversation/core/public";
import type { RuntimeView } from "../../../modules/execution/contracts/public";
import {
  RuntimeModel,
  SubmissionModel,
} from "../../../modules/execution/renderer/public";
import type { Draft, Failure } from "../../../modules/input/contracts/public";
import {
  AttachmentModel,
  DraftController,
  readAttachmentTokens,
} from "../../../modules/input/core/public";
import { AttachmentImports } from "../../../modules/input/renderer/public";
import type { ThreadContext } from "../../../modules/threads/contracts/public";
import type { DesktopBridge } from "../../contracts/desktop-bridge";
import type { ReadingView } from "../routing/search";

/** Application-owned Thread resources. Detaching a view does not dispose them. */
export class ThreadModel {
  readonly context: ThreadContext;
  readonly key: string;
  readonly controller: DraftController;
  readonly attachments: AttachmentModel | null = null;
  readonly attachmentImports: AttachmentImports | null = null;
  readonly submission: SubmissionModel | null = null;
  readonly runtime: RuntimeModel | null = null;
  readonly reading: ConversationModel | null = null;
  /** View coordinates only; native history/content remain owned by OMP. */
  readonly readingPositions = new Map<ReadingView, number>();
  private previousRuntimeView: RuntimeView | null = null;
  private runtimeReadingUnsubscribe: (() => void) | null = null;
  private disposed = false;

  constructor(
    draft: Draft,
    bridge: DesktopBridge,
    transportFailure: (traceId: string) => Failure,
    startOnCreate = false,
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
      if (bridge.attachments) {
        const attachments = new AttachmentModel(
          bridge.attachments,
          draft.threadId,
        );
        this.attachments = attachments;
        this.attachmentImports = new AttachmentImports(async (input) => {
          const reply = await attachments.run(
            { kind: "import-bytes", ...input },
            true,
          );
          if (reply?.kind !== "attachments")
            throw Error("Attachment import did not complete");
          return reply.items;
        });
      }
      this.runtime = bridge.runtime ? new RuntimeModel(bridge.runtime) : null;
      this.reading = bridge.conversation
        ? new ConversationModel(bridge.conversation)
        : null;
      this.submission = bridge.submission
        ? new SubmissionModel(
            bridge.submission,
            draft.threadId,
            this.controller,
            () => this.canPrepareInput(),
          )
        : null;
      this.runtimeReadingUnsubscribe =
        this.runtime?.subscribe(this.syncReading) ?? null;
      const inspected = this.runtime?.bind(draft.threadId);
      if (startOnCreate)
        void inspected?.then(() => {
          const view = this.runtime?.getSnapshot();
          if (
            !this.disposed &&
            view?.phase === "allowed" &&
            view.trusted &&
            !view.busy
          )
            void this.runtime?.act("start");
        });
    } catch (cause) {
      this.dispose();
      throw cause;
    }
  }

  freezeInputSources(): () => void {
    const releaseAttachments = this.attachments?.freezeSources();
    const releaseImports = this.attachmentImports?.freezeSources();
    return () => {
      releaseAttachments?.();
      releaseImports?.();
    };
  }
  canPrepareInput(): boolean {
    if (this.disposed || !this.controller.canSaveInput()) return false;
    const parsed = readAttachmentTokens(this.controller.getTextSnapshot());
    const ids = parsed.ok ? parsed.tokens.map((item) => item.id) : [];
    if (this.attachments && this.attachments.getReadiness(ids).kind !== "ready")
      return false;
    const sources = this.attachmentImports?.stateStore.getState();
    return !sources || (sources.pending === 0 && sources.failures.length === 0);
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
    this.readingPositions.clear();
    this.submission?.dispose();
    this.attachments?.dispose();
    this.attachmentImports?.dispose();
    this.controller.dispose();
    this.runtimeReadingUnsubscribe?.();
    this.reading?.dispose();
    this.runtime?.dispose();
  }
}
