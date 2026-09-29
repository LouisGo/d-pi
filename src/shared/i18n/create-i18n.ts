import { createIntl, createIntlCache } from "@formatjs/intl";
import { enUSMessages, type MessageKey, zhCNMessages } from "./catalog";
import type { SupportedLocale } from "./locale";

export type MessageValues = Record<string, string | number | Date>;
export interface I18n {
  readonly locale: SupportedLocale;
  t(key: MessageKey, values?: MessageValues): string;
}

const cache = createIntlCache();
type RuntimeImportMeta = ImportMeta & { env?: { DEV?: boolean } };
type RuntimeConsole = { error(...values: unknown[]): void };
const isDevelopment = (import.meta as RuntimeImportMeta).env?.DEV === true;
const runtime = globalThis as typeof globalThis & { console?: RuntimeConsole };

export function createI18n(locale: SupportedLocale): I18n {
  const messages = locale === "zh-CN" ? zhCNMessages : enUSMessages;
  const intl = createIntl({ locale, messages }, cache);
  const english = createIntl(
    { locale: "en-US", messages: enUSMessages },
    cache,
  );
  return {
    locale,
    t(key, values) {
      const fallback = enUSMessages[key];
      if (fallback === undefined) {
        if (isDevelopment) runtime.console?.error(`Missing i18n key: ${key}`);
        return key;
      }
      const target = messages[key];
      if (target === undefined && isDevelopment)
        runtime.console?.error(`Missing ${locale} message: ${key}`);
      const formatter = target === undefined ? english : intl;
      return formatter.formatMessage(
        { id: key, defaultMessage: fallback },
        values,
      );
    },
  };
}
