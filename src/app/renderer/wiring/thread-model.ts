import {
  ConversationModel,
  ReadingPositions,
} from "../../../modules/conversation/core/public";
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
  readonly readingSources = new ReadingPositions();
  private previousRuntimeView: RuntimeView | null = null;
  private runtimeReadingUnsubscribe: (() => void) | null = null;
  private disposed = false;
  private active = false;
  private activationGeneration = 0;
  private automaticStartAttempted = false;
  private inspected: Promise<void> = Promise.resolve();

  constructor(
    draft: Draft,
    bridge: DesktopBridge,
    transportFailure: (traceId: string) => Failure,
  ) {
    this.context = {
      threadId: draft.threadId,
      workingDirectoryId: draft.workingDirectoryId,
      directory: draft.directory,
      ...(draft.origin ? { origin: draft.origin } : {}),
      ...(draft.title ? { title: draft.title } : {}),
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
      this.runtime?.setPreparationActive(false);
      this.inspected = this.runtime?.bind(draft.threadId) ?? Promise.resolve();
    } catch (cause) {
      this.dispose();
      throw cause;
    }
  }

  /** Selection owns preparation; view mounts and history reads do not. */
  activate(): void {
    if (this.disposed || this.active) return;
    this.active = true;
    this.runtime?.setPreparationActive(true);
    const generation = ++this.activationGeneration;
    // A grant can have changed while this cached, untrusted Thread was away.
    // Re-read admission on selection instead of asking for the same grant again.
    const inspected =
      generation > 1 && this.runtime?.getSnapshot()?.phase === "browse"
        ? this.runtime.act("inspect")
        : this.inspected;
    void inspected.then(() => {
      const view = this.runtime?.getSnapshot();
      if (
        this.disposed ||
        !this.active ||
        generation !== this.activationGeneration ||
        this.automaticStartAttempted ||
        view?.phase !== "allowed" ||
        !view.trusted ||
        view.busy
      )
        return;
      // A failed or uncertain startup needs an explicit retry, never a loop
      // caused by returning to this Thread or publishing another runtime view.
      this.automaticStartAttempted = true;
      void this.runtime?.act("start");
    });
  }

  deactivate(): void {
    if (!this.active) return;
    this.active = false;
    ++this.activationGeneration;
    this.runtime?.setPreparationActive(false);
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
      this.context.directory === context.directory &&
      this.context.origin === context.origin
    );
  }

  private syncReading = (): void => {
    if (this.disposed) return;
    const view = this.runtime?.getSnapshot();
    if (!view) return;
    if (view.phase === "ready") this.automaticStartAttempted = false;
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
    this.deactivate();
    this.disposed = true;
    this.readingPositions.clear();
    this.readingSources.dispose();
    this.submission?.dispose();
    this.attachments?.dispose();
    this.attachmentImports?.dispose();
    this.controller.dispose();
    this.runtimeReadingUnsubscribe?.();
    this.reading?.dispose();
    this.runtime?.dispose();
  }
}
