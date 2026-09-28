import { z } from "zod";
import type { Draft } from "../../shared/contracts";
export const DirectoryIdentitySchema = z.strictObject({
  directory: z.string().min(1),
  device: z.string().min(1),
  inode: z.string().min(1),
});
export type DirectoryIdentity = z.infer<typeof DirectoryIdentitySchema>;
export function sameDirectoryIdentity(
  a: DirectoryIdentity,
  b: DirectoryIdentity,
): boolean {
  return (
    a.directory === b.directory && a.device === b.device && a.inode === b.inode
  );
}
export const RuntimeGrantSchema = DirectoryIdentitySchema.extend({
  workspaceId: z.uuid(),
});
export type RuntimeGrant = z.infer<typeof RuntimeGrantSchema>;
export interface AdmissionStore {
  read(threadId: string): Draft;
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
      draft: Draft,
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
      const draft = this.store.read(threadId);
      const identity = await this.identify(draft.directory);
      if (
        identity.directory !== draft.directory ||
        (boundDirectory && !sameDirectoryIdentity(boundDirectory, identity))
      )
        return { kind: "denied", reason: "directory-changed" };
      if (generation !== this.generation)
        return { kind: "denied", reason: "browse" };
      this.store.grantExecution({
        ...identity,
        workspaceId: draft.workspaceId,
      });
      return { kind: "allowed" };
    } catch {
      return { kind: "denied", reason: "unavailable" };
    }
  }
  async start(threadId: string): Promise<AdmissionResult> {
    const generation = this.generation;
    try {
      const draft = this.store.read(threadId);
      const grant = this.store.executionGrant(draft.workspaceId);
      if (!grant) return { kind: "denied", reason: "browse" };
      const identity = await this.identify(draft.directory);
      if (
        grant.directory !== identity.directory ||
        identity.directory !== draft.directory ||
        grant.device !== identity.device ||
        grant.inode !== identity.inode
      )
        return { kind: "denied", reason: "directory-changed" };
      if (
        generation !== this.generation ||
        !this.store.executionGrant(draft.workspaceId)
      )
        return { kind: "denied", reason: "browse" };
      await this.launch(draft, identity);
      return { kind: "started" };
    } catch {
      return { kind: "denied", reason: "unavailable" };
    }
  }
  revoke(threadId: string): void {
    this.generation++;
    this.store.revokeExecution(this.store.read(threadId).workspaceId);
  }
}
