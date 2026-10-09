import { z } from "zod";
export const MessageTimestampSchema = z
  .number()
  .int()
  .nonnegative()
  .max(8640000000000000);
const iso = z.iso.datetime({ offset: true });
export function nativeMessageTime(value: unknown): number | undefined {
  const number = MessageTimestampSchema.safeParse(value);
  if (number.success) return number.data;
  const string = iso.safeParse(value);
  if (!string.success) return undefined;
  const parsed = MessageTimestampSchema.safeParse(Date.parse(string.data));
  return parsed.success ? parsed.data : undefined;
}
