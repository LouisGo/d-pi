import { match } from "ts-pattern";
import type { Command, Reply } from "../../contracts/desktop-bridge";
import { saveDraft } from "../../../modules/input/main/public";
import { WorkspaceService } from "../../../modules/workspace/main/public";
import { resolveDirectory } from "../../../platform/node/filesystem/public";
import type { AppStorage } from "./app-storage";
import { diagnosticCode } from "../../../platform/main/diagnostics/public";
import { failure } from "../../contracts/failure";

export class DesktopCommandService {
  private readonly workspace: WorkspaceService;

  constructor(
    private readonly storage: Pick<
      AppStorage,
      "drafts" | "preferences" | "threads"
    >,
    choose: () => Promise<string | null>,
  ) {
    this.workspace = new WorkspaceService(storage.threads, choose);
  }

  async execute(command: Command): Promise<Reply> {
    try {
      return await match(command)
        .with({ kind: "restore" }, async () => {
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
            kind: "ready" as const,
            draft,
            directoryAvailable,
            preferences: this.storage.preferences.read(),
          };
        })
        .with({ kind: "choose-project" }, async ({ traceId }) => {
          const result = await this.workspace.chooseProject();
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
