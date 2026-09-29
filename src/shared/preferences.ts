import { z } from "zod";
import { LocalePreferenceSchema } from "./i18n/locale";
export const PreferencesSchema = z.strictObject({
  theme: z.enum(["light", "dark"]),
  density: z.enum(["normal", "compact"]),
  sendKey: z.enum(["enter-send", "enter-newline"]).optional(),
  locale: LocalePreferenceSchema,
});
export type Preferences = z.infer<typeof PreferencesSchema>;
