import { z } from "zod";
import {
  DirectoryIdentitySchema,
  ThreadIdSchema,
  WorkingDirectoryIdSchema,
} from "../../../shared/identity";

export {
  type DirectoryIdentity,
  DirectoryIdentitySchema,
} from "../../../shared/identity";

export const NativeSessionBindingSchema = z.strictObject({
  threadId: z.uuid(),
  configContextId: z.string().min(1),
  sessionFile: z.string().min(1),
  sessionId: z.string().min(1),
  origin: z.literal("cli").optional(),
  historyRoot: z.string().min(1).optional(),
});
export type NativeSessionBinding = z.infer<typeof NativeSessionBindingSchema>;

// Stable execution context; reading it never loads mutable input or consumption state.
export const ThreadContextSchema = z.strictObject({
  threadId: ThreadIdSchema,
  workingDirectoryId: WorkingDirectoryIdSchema,
  directory: z.string().min(1),
  title: z.string().max(256).optional(),
  origin: z.literal("cli").optional(),
  completed: z.boolean().optional(),
  parentThreadId: ThreadIdSchema.optional(),
});
export type ThreadContext = z.infer<typeof ThreadContextSchema>;
export interface ThreadReader {
  activeThread(): ThreadContext | null;
  threadContext(threadId: string): ThreadContext;
}

export const ExecutionGrantSchema = DirectoryIdentitySchema.extend({
  workingDirectoryId: WorkingDirectoryIdSchema,
});
export type ExecutionGrant = z.infer<typeof ExecutionGrantSchema>;

export const ProjectContextSchema = z.strictObject({
  workingDirectoryId: WorkingDirectoryIdSchema,
  directory: z.string().min(1),
});
export type ProjectContext = z.infer<typeof ProjectContextSchema>;

export const ThreadMutationSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("rename"),
    title: z.string().trim().min(1).max(256),
  }),
  z.strictObject({ kind: z.literal("complete"), value: z.boolean() }),
  z.strictObject({ kind: z.literal("fork") }),
  z.strictObject({ kind: z.literal("delete") }),
]);
export type ThreadMutation = z.infer<typeof ThreadMutationSchema>;
