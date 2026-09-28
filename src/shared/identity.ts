import { z } from "zod";
export const ThreadIdSchema = z.uuid().brand<"ThreadId">();
export const WorkspaceIdSchema = z.uuid().brand<"WorkspaceId">();
export const TraceIdSchema = z.uuid();
export type ThreadId = z.infer<typeof ThreadIdSchema>;
export type WorkspaceId = z.infer<typeof WorkspaceIdSchema>;
