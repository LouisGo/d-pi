import { z } from "zod";
import { ThreadIdSchema, WorkspaceIdSchema } from "../../shared/identity";

// Stable execution context; reading it never loads mutable input or consumption state.
export const ThreadContextSchema = z.strictObject({
  threadId: ThreadIdSchema,
  workspaceId: WorkspaceIdSchema,
  directory: z.string().min(1),
});
export type ThreadContext = z.infer<typeof ThreadContextSchema>;
export interface ThreadReader {
  activeThread(): ThreadContext | null;
  threadContext(threadId: string): ThreadContext;
}

export const DirectoryIdentitySchema = z.strictObject({
  directory: z.string().min(1),
  device: z.string().min(1),
  inode: z.string().min(1),
});
export type DirectoryIdentity = z.infer<typeof DirectoryIdentitySchema>;
export const RuntimeGrantSchema = DirectoryIdentitySchema.extend({
  workspaceId: WorkspaceIdSchema,
});
export type RuntimeGrant = z.infer<typeof RuntimeGrantSchema>;
