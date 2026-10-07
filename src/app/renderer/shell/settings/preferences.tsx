import { useId } from "react";
import { useStore } from "zustand";
import type { Preferences } from "../../../../modules/preferences/contracts/public";
import {
  useI18n,
  useLocalePreference,
} from "../../../../modules/preferences/renderer/public";
import {
  ChoiceGroup,
  Select,
  SettingRow,
  SettingsGroup,
} from "../../../../modules/ui/renderer/public";
import type { AppModel } from "../../wiring/model";

function ThemePreview({ mode }: { mode: Preferences["theme"] }) {
  return (
    <span className="theme-preview" data-mode={mode} aria-hidden="true">
      {mode === "system" ? (
        <>
          <ThemePreview mode="light" />
          <ThemePreview mode="dark" />
        </>
      ) : (
        <>
          <span className="theme-preview-sidebar" />
          <span className="theme-preview-main">
            <span className="theme-preview-line" />
            <span className="theme-preview-line" />
            <span className="theme-preview-line" />
            <span className="theme-preview-input" />
          </span>
        </>
      )}
    </span>
  );
}
export function AppearanceSettings({ model }: { model: AppModel }) {
  const { t } = useI18n();
  const theme = useStore(model.stateStore, (state) =>
    state.kind === "ready" ? state.preferences.theme : "system",
  );
  const busy = useStore(
    model.stateStore,
    (state) =>
      state.kind === "ready" &&
      (state.busy || state.threadTransition === "unknown"),
  );
  return (
    <SettingsGroup title={t("settings.visualStyle")}>
      <SettingRow
        label={t("app.layout.theme")}
        description={t("settings.themeDescription")}
      >
        <ChoiceGroup
          value={theme}
          disabled={busy}
          aria-label={t("app.layout.theme")}
          onValueChange={(value) => void model.preference("theme", value)}
          options={[
            {
              value: "system",
              label: t("settings.themeSystem"),
              preview: <ThemePreview mode="system" />,
            },
            {
              value: "light",
              label: t("settings.themeLight"),
              preview: <ThemePreview mode="light" />,
            },
            {
              value: "dark",
              label: t("settings.themeDark"),
              preview: <ThemePreview mode="dark" />,
            },
          ]}
        />
      </SettingRow>
    </SettingsGroup>
  );
}
export function GeneralSettings({ model }: { model: AppModel }) {
  const { t } = useI18n();
  const { preference, setPreference, persistenceFailed } =
    useLocalePreference();
  const languageId = useId();
  const shortcutId = useId();
  const sendKey = useStore(model.stateStore, (state) =>
    state.kind === "ready"
      ? (state.preferences.sendKey ?? "enter-send")
      : "enter-send",
  );
  const busy = useStore(
    model.stateStore,
    (state) =>
      state.kind === "ready" &&
      (state.busy || state.threadTransition === "unknown"),
  );
  return (
    <>
      <SettingsGroup title={t("settings.application")}>
        <SettingRow
          label={t("app.toolbar.language")}
          htmlFor={languageId}
          description={t("settings.languageDescription")}
        >
          <Select
            id={languageId}
            value={preference}
            disabled={busy}
            onValueChange={(value) => void setPreference(value)}
            options={[
              { value: "system", label: t("app.toolbar.systemLanguage") },
              { value: "zh-CN", label: t("app.toolbar.chinese") },
              { value: "en-US", label: t("app.toolbar.english") },
            ]}
          />
        </SettingRow>
      </SettingsGroup>
      {persistenceFailed && (
        <p role="alert" className="failure">
          {t("app.language.saveFailed")}
        </p>
      )}
      <SettingsGroup title={t("settings.composer")}>
        <SettingRow
          label={t("settings.sendKey")}
          htmlFor={shortcutId}
          description={t("settings.sendKeyDescription")}
        >
          <Select
            id={shortcutId}
            disabled={busy}
            value={sendKey}
            onValueChange={(value) => void model.preference("sendKey", value)}
            options={[
              { value: "enter-send", label: t("settings.enterSend") },
              { value: "enter-newline", label: t("settings.commandEnterSend") },
            ]}
          />
        </SettingRow>
        <SettingRow
          label={t("settings.expandedComposer")}
          description={t("settings.expandedDescription")}
        >
          <kbd className="settings-key">{t("settings.commandEnterKey")}</kbd>
        </SettingRow>
      </SettingsGroup>
    </>
  );
}
