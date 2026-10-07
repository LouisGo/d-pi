import { z } from "zod";

export const CLIPBOARD_MIME = "application/x-dpi-context-fragment+json";
export const ClipboardTicketSchema = z.strictObject({
  version: z.literal(1),
  instanceId: z.uuid(),
  handleId: z.uuid(),
  expiresAt: z.number().int().positive(),
});
export type ClipboardTicket = z.infer<typeof ClipboardTicketSchema>;
export const ClipboardFailureSchema = z.enum([
  "invalid",
  "expired",
  "busy",
  "failed",
]);
export type ClipboardFailure = z.infer<typeof ClipboardFailureSchema>;
