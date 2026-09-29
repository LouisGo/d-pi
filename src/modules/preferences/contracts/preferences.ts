import { z } from "zod";
import {
  type LocalePreference,
  LocalePreferenceSchema,
  type LocaleSnapshot,
  LocaleSnapshotSchema,
} from "../../../shared/i18n/locale";
export const PreferencesSchema = z.strictObject({
  theme: z.enum(["light", "dark"]),
  density: z.enum(["normal", "compact"]),
  sendKey: z.enum(["enter-send", "enter-newline"]).optional(),
  locale: LocalePreferenceSchema,
});
export type Preferences = z.infer<typeof PreferencesSchema>;

export const LocaleSetResultSchema = LocaleSnapshotSchema.extend({
  persisted: z.boolean(),
});
export type LocaleSetResult = z.infer<typeof LocaleSetResultSchema>;
export interface LocaleBridge {
  snapshot(): Promise<LocaleSnapshot>;
  subscribe(listener: (snapshot: LocaleSnapshot) => void): () => void;
  setPreference(preference: LocalePreference): Promise<LocaleSetResult>;
}
