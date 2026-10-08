import { match } from "ts-pattern";
import { saveDraft } from "../../../modules/input/main/public";
import { ProjectSelectionService } from "../../../modules/threads/main/public";
import { diagnosticCode } from "../../../platform/main/diagnostics/public";
import { resolveDirectory } from "../../../platform/node/filesystem/public";
import type { Command, Reply } from "../../contracts/desktop-bridge";
import { failure } from "../../contracts/failure";
import type { AppStorage } from "./app-storage";

export class DesktopCommandService {
  private readonly projects: ProjectSelectionService;

  constructor(
    private readonly storage: Pick<
      AppStorage,
      "drafts" | "preferences" | "threads"
    >,
    choose: () => Promise<string | null>,
    private readonly reconcileNativeSessions?: (
      traceId: string,
    ) => Promise<"ready" | "partial" | "unavailable">,
  ) {
    this.projects = new ProjectSelectionService(storage.threads, choose);
  }

  private async restore(
    traceId: string,
    discover = true,
  ): Promise<Extract<Reply, { kind: "ready" }>> {
    // Restoring an existing chat must not wait on configuration or catalog I/O.
    const existing = this.storage.threads.activeThread();
    const discovery = discover
      ? this.reconcileNativeSessions?.(traceId)
      : undefined;
    const nativeIndex = !existing ? await discovery : undefined;
    if (existing) void discovery?.catch(() => {});
    const draft = this.storage.drafts.active();
    let directoryAvailable = true;
    if (draft) {
      try {
        directoryAvailable =
          (await resolveDirectory(draft.directory)) === draft.directory;
      } catch {
        directoryAvailable = false;
      }
    }
    return {
      kind: "ready",
      ...(nativeIndex ? { nativeIndex } : {}),
      draft,
      directoryAvailable,
      preferences: this.storage.preferences.read(),
    };
  }

  async execute(command: Command): Promise<Reply> {
    try {
      return await match(command)
        .with({ kind: "restore" }, async () => {
          return this.restore(command.traceId);
        })
        .with({ kind: "list-threads" }, async () => {
          const nativeIndex = await this.reconcileNativeSessions?.(
            command.traceId,
          );
          return {
            kind: "threads" as const,
            threads: this.storage.threads.list(),
            ...(nativeIndex ? { nativeIndex } : {}),
          };
        })
        .with({ kind: "select-thread" }, async ({ threadId }) => {
          this.storage.threads.select(threadId);
          return this.restore(command.traceId, false);
        })
        .with({ kind: "new-thread" }, async ({ threadId }) => {
          const thread = this.storage.threads.threadContext(threadId);
          const directory = await resolveDirectory(thread.directory);
          if (directory !== thread.directory) throw Error("Directory changed");
          this.storage.threads.create(directory);
          return this.restore(command.traceId, false);
        })
        .with({ kind: "choose-project" }, async ({ traceId }) => {
          const result = await this.projects.chooseProject();
          if (result.kind === "already-active")
            return failure(traceId, "invalid-request", "draft.alreadyActive");
          if (result.kind === "cancelled") return result;
          if (result.kind === "directory-unavailable")
            return failure(
              traceId,
              "directory-unavailable",
              "draft.directoryUnavailable",
            );
          return {
            kind: "ready" as const,
            draft: this.storage.drafts.read(result.thread.threadId),
            directoryAvailable: true,
            preferences: this.storage.preferences.read(),
          };
        })
        .with(
          { kind: "save" },
          ({ traceId, threadId, expectedRevision, text }) => {
            const result = saveDraft(this.storage.drafts, {
              threadId,
              expectedRevision,
              text,
            });
            if (result.kind === "identity-mismatch")
              return failure(
                traceId,
                "invalid-request",
                "draft.identityMismatch",
              );
            if (result.kind === "revision-conflict")
              return failure(
                traceId,
                "revision-conflict",
                "draft.revisionConflict",
              );
            return result;
          },
        )
        .with({ kind: "preferences" }, ({ value }) => {
          this.storage.preferences.save(value);
          return { kind: "preferences-saved" as const, value };
        })
        .exhaustive();
    } catch (error) {
      return failure(
        command.traceId,
        "storage-unavailable",
        "draft.storageUnavailable",
        diagnosticCode(error),
      );
    }
  }
}
