import { z } from "zod";

export const SupportedLocaleSchema = z.enum(["zh-CN", "en-US"]);
export type SupportedLocale = z.infer<typeof SupportedLocaleSchema>;

export const LocalePreferenceSchema = z.enum(["system", "zh-CN", "en-US"]);
export type LocalePreference = z.infer<typeof LocalePreferenceSchema>;

export const LocaleSnapshotSchema = z.strictObject({
  preference: LocalePreferenceSchema,
  resolvedLocale: SupportedLocaleSchema,
});
export type LocaleSnapshot = z.infer<typeof LocaleSnapshotSchema>;

export function resolveLocale(
  preference: LocalePreference,
  systemLocale: string,
): SupportedLocale {
  if (preference !== "system") return preference;
  return systemLocale.toLowerCase().startsWith("zh") ? "zh-CN" : "en-US";
}
