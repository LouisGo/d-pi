import { resolveDirectory } from "../../../platform/node/filesystem/public";
import type { ThreadContext } from "../contracts/public";
import type { ThreadRepository } from "./thread-repository";

export type ChooseProjectResult =
  | { kind: "already-active" }
  | { kind: "cancelled" }
  | { kind: "directory-unavailable" }
  | { kind: "ready"; thread: ThreadContext };

export class WorkspaceService {
  private choosing = false;

  constructor(
    private readonly threads: Pick<ThreadRepository, "activeThread" | "create">,
    private readonly choose: () => Promise<string | null>,
  ) {}

  activeThread(): ThreadContext | null {
    return this.threads.activeThread();
  }

  async chooseProject(): Promise<ChooseProjectResult> {
    if (this.choosing || this.threads.activeThread())
      return { kind: "already-active" };
    this.choosing = true;
    try {
      const path = await this.choose();
      if (path === null) return { kind: "cancelled" };
      let directory: string;
      try {
        directory = await resolveDirectory(path);
      } catch {
        return { kind: "directory-unavailable" };
      }
      return { kind: "ready", thread: this.threads.create(directory) };
    } finally {
      this.choosing = false;
    }
  }
}
