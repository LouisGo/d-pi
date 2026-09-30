import { z } from "zod";
export const ThreadIdSchema = z.uuid().brand<"ThreadId">();
export const WorkspaceIdSchema = z.uuid().brand<"WorkspaceId">();
export const TraceIdSchema = z.uuid();
export type ThreadId = z.infer<typeof ThreadIdSchema>;

type RuntimeCrypto = { randomUUID?: () => string };
export function createId(): string {
  const runtime = globalThis as typeof globalThis & { crypto?: RuntimeCrypto };
  const id = runtime.crypto?.randomUUID?.();
  if (!id) throw new Error("UUID generation unavailable");
  return id;
}

export const DirectoryIdentitySchema = z.strictObject({
  directory: z.string().min(1),
  device: z.string().min(1),
  inode: z.string().min(1),
});
export type DirectoryIdentity = z.infer<typeof DirectoryIdentitySchema>;
