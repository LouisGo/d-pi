import { z } from "zod";
import {
  DirectoryIdentitySchema,
  ThreadIdSchema,
  WorkspaceIdSchema,
} from "../../../shared/identity";

export {
  type DirectoryIdentity,
  DirectoryIdentitySchema,
} from "../../../shared/identity";

export const NativeBindingSchema = z.strictObject({
  threadId: z.uuid(),
  configContextId: z.string().min(1),
  sessionFile: z.string().min(1),
  sessionId: z.string().min(1),
});
export type NativeBinding = z.infer<typeof NativeBindingSchema>;

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

export const RuntimeGrantSchema = DirectoryIdentitySchema.extend({
  workspaceId: WorkspaceIdSchema,
});
export type RuntimeGrant = z.infer<typeof RuntimeGrantSchema>;
