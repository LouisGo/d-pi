import { z } from "zod";
import { UiMessageSchema } from "../localization/contracts";
export const ConversationLabelSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("literal"), text: z.string() }),
  z.strictObject({ kind: z.literal("message"), value: UiMessageSchema }),
]);
export const ConversationItemSchema = z.strictObject({
  id: z.number().int().nonnegative(),
  role: z.enum(["user", "assistant", "tool", "notice"]),
  text: z.string(),
  state: z.enum(["streaming", "complete", "failed"]),
  label: ConversationLabelSchema,
  notice: UiMessageSchema.optional(),
  truncated: z.boolean().optional(),
});
export type ConversationItem = z.infer<typeof ConversationItemSchema>;
export const ConversationSnapshotSchema = z.strictObject({
  kind: z.literal("snapshot"),
  generation: z.uuid(),
  seq: z.number().int().nonnegative(),
  items: z.array(ConversationItemSchema),
  gap: z.boolean(),
});
export type ConversationSnapshot = z.infer<typeof ConversationSnapshotSchema>;
export const ConversationUpdateSchema = z.strictObject({
  kind: z.literal("update"),
  generation: z.uuid(),
  seq: z.number().int().nonnegative(),
  item: ConversationItemSchema,
  droppedBefore: z.number().int().nonnegative(),
  gap: z.boolean(),
});
export type ConversationUpdate = z.infer<typeof ConversationUpdateSchema>;
export const ConversationEventSchema = z.discriminatedUnion("kind", [
  ConversationSnapshotSchema,
  ConversationUpdateSchema,
]);
export type ConversationEvent = z.infer<typeof ConversationEventSchema>;

export interface ConversationPort {
  connect(
    threadId: string,
    listener: (event: ConversationEvent) => void,
  ): () => void;
}
