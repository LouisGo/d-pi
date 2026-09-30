import {
  type DirectoryIdentity,
  type ExecutionGrant,
  type ThreadContext,
} from "../../threads/contracts/public";
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
  executionGrant(workingDirectoryId: string): ExecutionGrant | null;
  grantExecution(grant: ExecutionGrant): void;
  revokeExecution(workingDirectoryId: string): void;
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
  private admissionGeneration = 0;
  async allow(
    threadId: string,
    boundDirectory?: DirectoryIdentity,
  ): Promise<AdmissionResult> {
    const admissionGeneration = this.admissionGeneration;
    try {
      const thread = this.store.threadContext(threadId);
      const identity = await this.identify(thread.directory);
      if (
        identity.directory !== thread.directory ||
        (boundDirectory && !sameDirectoryIdentity(boundDirectory, identity))
      )
        return { kind: "denied", reason: "directory-changed" };
      if (admissionGeneration !== this.admissionGeneration)
        return { kind: "denied", reason: "browse" };
      this.store.grantExecution({
        ...identity,
        workingDirectoryId: thread.workingDirectoryId,
      });
      return { kind: "allowed" };
    } catch {
      return { kind: "denied", reason: "unavailable" };
    }
  }
  async start(threadId: string): Promise<AdmissionResult> {
    const admissionGeneration = this.admissionGeneration;
    try {
      const thread = this.store.threadContext(threadId);
      const grant = this.store.executionGrant(thread.workingDirectoryId);
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
        admissionGeneration !== this.admissionGeneration ||
        !this.store.executionGrant(thread.workingDirectoryId)
      )
        return { kind: "denied", reason: "browse" };
      await this.launch(thread, identity);
      return { kind: "started" };
    } catch {
      return { kind: "denied", reason: "unavailable" };
    }
  }
  revoke(threadId: string): void {
    this.admissionGeneration++;
    this.store.revokeExecution(
      this.store.threadContext(threadId).workingDirectoryId,
    );
  }
}
