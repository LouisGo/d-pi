import {
  type DirectoryIdentity,
  type RuntimeGrant,
  type ThreadContext,
} from "../../workspace/contracts/public";
export function sameDirectoryIdentity(
  a: DirectoryIdentity,
  b: DirectoryIdentity,
): boolean {
  return (
    a.directory === b.directory && a.device === b.device && a.inode === b.inode
  );
}
export interface AdmissionStore {
  threadContext(threadId: string): ThreadContext;
  executionGrant(workspaceId: string): RuntimeGrant | null;
  grantExecution(grant: RuntimeGrant): void;
  revokeExecution(workspaceId: string): void;
}
export type AdmissionResult =
  | { kind: "allowed" }
  | { kind: "started" }
  | { kind: "denied"; reason: "browse" | "directory-changed" | "unavailable" };
export class RuntimeAdmission {
  constructor(
    private readonly store: AdmissionStore,
    private readonly identify: (
      directory: string,
    ) => Promise<DirectoryIdentity>,
    private readonly launch: (
      thread: ThreadContext,
      identity: DirectoryIdentity,
    ) => Promise<void>,
  ) {}
  private generation = 0;
  async allow(
    threadId: string,
    boundDirectory?: DirectoryIdentity,
  ): Promise<AdmissionResult> {
    const generation = this.generation;
    try {
      const thread = this.store.threadContext(threadId);
      const identity = await this.identify(thread.directory);
      if (
        identity.directory !== thread.directory ||
        (boundDirectory && !sameDirectoryIdentity(boundDirectory, identity))
      )
        return { kind: "denied", reason: "directory-changed" };
      if (generation !== this.generation)
        return { kind: "denied", reason: "browse" };
      this.store.grantExecution({
        ...identity,
        workspaceId: thread.workspaceId,
      });
      return { kind: "allowed" };
    } catch {
      return { kind: "denied", reason: "unavailable" };
    }
  }
  async start(threadId: string): Promise<AdmissionResult> {
    const generation = this.generation;
    try {
      const thread = this.store.threadContext(threadId);
      const grant = this.store.executionGrant(thread.workspaceId);
      if (!grant) return { kind: "denied", reason: "browse" };
      const identity = await this.identify(thread.directory);
      if (
        grant.directory !== identity.directory ||
        identity.directory !== thread.directory ||
        grant.device !== identity.device ||
        grant.inode !== identity.inode
      )
        return { kind: "denied", reason: "directory-changed" };
      if (
        generation !== this.generation ||
        !this.store.executionGrant(thread.workspaceId)
      )
        return { kind: "denied", reason: "browse" };
      await this.launch(thread, identity);
      return { kind: "started" };
    } catch {
      return { kind: "denied", reason: "unavailable" };
    }
  }
  revoke(threadId: string): void {
    this.generation++;
    this.store.revokeExecution(this.store.threadContext(threadId).workspaceId);
  }
}
