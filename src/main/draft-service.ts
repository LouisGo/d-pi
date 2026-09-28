import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { access, realpath, stat } from "node:fs/promises";
import { match } from "ts-pattern";
import { type Failure } from "../features/draft/contracts";
import { type Command, type Reply } from "../shared/desktop-bridge";
import { diagnosticCode } from "./diagnostic-code";
import type { AppStorage } from "./storage/app-storage";
export function failure(
  traceId: string,
  code: Failure["code"],
  safeMessage: string,
  causeCode?: string,
): Extract<Reply, { kind: "failed" }> {
  return {
    kind: "failed",
    error: {
      errorId: randomUUID(),
      traceId,
      code,
      category:
        code === "storage-unavailable"
          ? "storage"
          : code === "directory-unavailable"
            ? "permission"
            : "validation",
      observedAt: "main",
      reportedBy: "app",
      attribution: "unknown",
      handlingOwner: "draft",
      recovery:
        code === "revision-conflict" ? "reconcile_first" : "user_action",
      safeMessage,
      ...(causeCode ? { causeCode } : {}),
    },
  };
}
export async function resolveDirectory(path: string): Promise<string> {
  const canonical = await realpath(path);
  if (!(await stat(canonical)).isDirectory()) throw new Error("Not directory");
  await access(canonical, constants.R_OK);
  return canonical;
}
export class DraftService {
  private choosing = false;
  constructor(
    private readonly storage: Pick<AppStorage, "drafts" | "preferences">,
    private readonly choose: () => Promise<string | null>,
  ) {}
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
          // S1 has one foreground draft; no implicit switch to an unreachable old draft.
          if (this.choosing || this.storage.drafts.active())
            return failure(
              traceId,
              "invalid-request",
              "当前已有草稿，请继续当前项目。",
            );
          this.choosing = true;
          try {
            const path = await this.choose();
            if (path === null) return { kind: "cancelled" as const };
            let directory: string;
            try {
              directory = await resolveDirectory(path);
            } catch {
              return failure(
                traceId,
                "directory-unavailable",
                "目录不存在或无法读取，请重新选择。",
              );
            }
            return {
              kind: "ready" as const,
              draft: this.storage.drafts.create(directory),
              directoryAvailable: true,
              preferences: this.storage.preferences.read(),
            };
          } finally {
            this.choosing = false;
          }
        })
        .with(
          { kind: "save" },
          ({ traceId, threadId, expectedRevision, text }) => {
            if (this.storage.drafts.active()?.threadId !== threadId)
              return failure(
                traceId,
                "invalid-request",
                "草稿身份不匹配，已阻止写入。",
              );
            const revision = this.storage.drafts.save(
              threadId,
              expectedRevision,
              text,
            );
            return revision === null
              ? failure(
                  traceId,
                  "revision-conflict",
                  "草稿版本冲突。当前输入已保留，请核对保存状态后选择要保留的内容。",
                )
              : { kind: "saved" as const, threadId, revision };
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
        "无法读取或保存本地数据；未删除数据库，请保留当前输入后重试。",
        diagnosticCode(error),
      );
    }
  }
}
