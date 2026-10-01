import type { IpcRenderer } from "electron";
import {
  GitReplySchema,
  GitRequestSchema,
} from "../../../modules/changes/contracts/public";
import {
  HistoryPageSchema,
  HistoryRequestSchema,
  ProjectHistoryCatalogSchema,
  ProjectHistoryRequestSchema,
} from "../../../modules/conversation/contracts/public";
import {
  FileReplySchema,
  FileRequestSchema,
} from "../../../modules/files/contracts/public";
import type { DesktopBridge } from "../../contracts/desktop-bridge";
export function createProjectReadBridge(
  ipcRenderer: IpcRenderer,
): Pick<DesktopBridge, "history" | "files" | "git"> {
  return {
    history: {
      async projectList(threadId) {
        return ProjectHistoryCatalogSchema.parse(
          await ipcRenderer.invoke(
            "history:project",
            ProjectHistoryRequestSchema.parse({
              kind: "list",
              threadId,
              traceId: crypto.randomUUID(),
            }),
          ),
        );
      },
      async projectRead(threadId, key, cursor) {
        return HistoryPageSchema.parse(
          await ipcRenderer.invoke(
            "history:project",
            ProjectHistoryRequestSchema.parse({
              kind: "read",
              threadId,
              key,
              cursor,
              traceId: crypto.randomUUID(),
            }),
          ),
        );
      },
      async read(threadId, cursor) {
        return HistoryPageSchema.parse(
          await ipcRenderer.invoke(
            "history:read",
            HistoryRequestSchema.parse({ threadId, cursor }),
          ),
        );
      },
    },
    files: {
      async request(command) {
        const value = FileRequestSchema.parse(command);
        return FileReplySchema.parse(
          await ipcRenderer.invoke("files:request", value),
        );
      },
    },
    git: {
      async request(command) {
        const value = GitRequestSchema.parse(command);
        return GitReplySchema.parse(
          await ipcRenderer.invoke("git:request", value),
        );
      },
    },
  };
}
