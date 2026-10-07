import { z } from "zod";
import {
  type LocalePreference,
  LocalePreferenceSchema,
  type LocaleSnapshot,
  LocaleSnapshotSchema,
} from "../../../shared/i18n/locale";
export const PreferencesSchema = z.strictObject({
  theme: z.enum(["light", "dark", "system"]),
  // Compatibility DTO for existing database/IPC snapshots; not an appearance option.
  density: z.enum(["normal", "compact"]),
  sendKey: z.enum(["enter-send", "enter-newline"]).optional(),
  locale: LocalePreferenceSchema,
});
export type Preferences = z.infer<typeof PreferencesSchema>;

export const NotificationPreferencesSchema = z.strictObject({
  system: z.boolean(),
  completion: z.boolean(),
});
export type NotificationPreferences = z.infer<
  typeof NotificationPreferencesSchema
>;

export const LocaleSetResultSchema = LocaleSnapshotSchema.extend({
  persisted: z.boolean(),
});
export type LocaleSetResult = z.infer<typeof LocaleSetResultSchema>;
export interface LocaleBridge {
  snapshot(): Promise<LocaleSnapshot>;
  subscribe(listener: (snapshot: LocaleSnapshot) => void): () => void;
  setPreference(preference: LocalePreference): Promise<LocaleSetResult>;
}
