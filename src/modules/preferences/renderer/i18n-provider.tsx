import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { createI18n, type I18n } from "../../../shared/i18n/create-i18n";
import {
  type LocalePreference,
  type LocaleSnapshot,
  resolveLocale,
} from "../../../shared/i18n/locale";
import type { UiMessage } from "../../../shared/messages/contracts";
import type { LocaleBridge } from "../contracts/public";

interface LocalePreferenceContextValue {
  readonly preference: LocalePreference;
  readonly persistenceFailed: boolean;
  setPreference(preference: LocalePreference): Promise<void>;
}

interface I18nContextValue extends I18n {
  formatMessage(message: UiMessage): string;
}

const I18nContext = createContext<I18nContextValue | null>(null);
const LocalePreferenceContext =
  createContext<LocalePreferenceContextValue | null>(null);

export function browserLocaleFallback(): LocaleSnapshot {
  return {
    preference: "system",
    resolvedLocale: resolveLocale("system", navigator.language),
  };
}

export function I18nProvider({
  bridge,
  initialSnapshot,
  children,
}: {
  bridge?: LocaleBridge | undefined;
  initialSnapshot: LocaleSnapshot;
  children: ReactNode;
}) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [persistenceFailed, setPersistenceFailed] = useState(false);
  const i18n = useMemo(
    () => createI18n(snapshot.resolvedLocale),
    [snapshot.resolvedLocale],
  );
  const translation = useMemo<I18nContextValue>(
    () => ({
      ...i18n,
      formatMessage(message) {
        return i18n.t(
          message.code,
          "params" in message ? message.params : undefined,
        );
      },
    }),
    [i18n],
  );

  useEffect(() => {
    document.documentElement.lang = snapshot.resolvedLocale;
    document.documentElement.dir = "ltr";
  }, [snapshot.resolvedLocale]);

  useEffect(() => {
    if (!bridge) return;
    let active = true;
    let changed = false;
    const unsubscribe = bridge.subscribe((next) => {
      changed = true;
      setSnapshot(next);
    });
    void bridge.snapshot().then(
      (next) => {
        if (active && !changed) setSnapshot(next);
      },
      () => {
        // Initial Main snapshot is already supplied by the bootstrap.
      },
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, [bridge]);

  const value = useMemo<LocalePreferenceContextValue>(
    () => ({
      preference: snapshot.preference,
      persistenceFailed,
      async setPreference(preference) {
        setPersistenceFailed(false);
        if (preference !== "system")
          setSnapshot({ preference, resolvedLocale: preference });
        if (!bridge) {
          setSnapshot({
            preference,
            resolvedLocale: resolveLocale(preference, navigator.language),
          });
          setPersistenceFailed(true);
          return;
        }
        try {
          const result = await bridge.setPreference(preference);
          setSnapshot({
            preference: result.preference,
            resolvedLocale: result.resolvedLocale,
          });
          setPersistenceFailed(!result.persisted);
        } catch {
          setPersistenceFailed(true);
        }
      },
    }),
    [bridge, persistenceFailed, snapshot.preference],
  );
  return (
    <I18nContext value={translation}>
      <LocalePreferenceContext value={value}>
        {children}
      </LocalePreferenceContext>
    </I18nContext>
  );
}

export function useLocalePreference(): LocalePreferenceContextValue {
  const value = useContext(LocalePreferenceContext);
  if (!value) throw new Error("I18nProvider is missing");
  return value;
}

export function useI18n(): I18nContextValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error("I18nProvider is missing");
  return value;
}
