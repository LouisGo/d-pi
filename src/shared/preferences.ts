import { z } from "zod";
export const PreferencesSchema = z.strictObject({
  theme: z.enum(["light", "dark"]),
  density: z.enum(["normal", "compact"]),
  sendKey: z.enum(["enter-send", "enter-newline"]).optional(),
});
export type Preferences = z.infer<typeof PreferencesSchema>;
