import { useContext } from "react";
import { match } from "ts-pattern";
import { useStore } from "zustand";
import {
  AddIcon,
  DarkThemeIcon,
  LightThemeIcon,
  SystemThemeIcon,
} from "@/components/icons/common";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import {
  useI18n,
  useLocalePreference,
} from "../../../modules/preferences/renderer/public";
import type { AppModel } from "../wiring/model";
import { ConversationVisibilityContext } from "./layout/conversation-visibility";
import { NavigationHistory } from "./navigation-history";

export function ThreadNavigationControls({ model }: { model: AppModel }) {
  const busy = useStore(
    model.stateStore,
    (state) => state.kind === "ready" && state.threadTransition === "unknown",
  );
  return <NavigationHistory disabled={busy} />;
}

export function NewThreadButton({ model }: { model: AppModel }) {
  const { reveal } = useContext(ConversationVisibilityContext);
  const { t } = useI18n();
  const enabled = useStore(
    model.stateStore,
    (state) =>
      state.kind === "ready" &&
      state.threadSelection.kind === "thread" &&
      state.threadTransition !== "unknown",
  );
  return (
    <Button
      data-new-thread
      variant="ghost"
      disabled={!enabled}
      onClick={() => {
        reveal();
        void model.newThread();
      }}
    >
      <AddIcon />
      {t("app.toolbar.newThread")}
    </Button>
  );
}

export function PreferenceToolbar({ model }: { model: AppModel }) {
  return (
    <header className="toolbar">
      <ThreadHeaderTitle model={model} />
      <ThemeToggle model={model} />
    </header>
  );
}

function ThemeToggle({ model }: { model: AppModel }) {
  const { t } = useI18n();
  const theme = useStore(model.stateStore, (state) =>
    state.kind === "ready" ? state.preferences.theme : "light",
  );
  const busy = useStore(
    model.stateStore,
    (state) => state.kind === "ready" && state.threadTransition === "unknown",
  );
  const label = match(theme)
    .with("light", () => t("app.toolbar.darkTheme"))
    .with("dark", () => t("app.toolbar.systemTheme"))
    .with("system", () => t("app.toolbar.lightTheme"))
    .exhaustive();
  const icon = match(theme)
    .with("light", () => <LightThemeIcon />)
    .with("dark", () => <DarkThemeIcon />)
    .with("system", () => <SystemThemeIcon />)
    .exhaustive();
  return (
    <IconButton
      variant="ghost"
      disabled={busy}
      label={label}
      data-theme-preference={theme}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => void model.preference("theme")}
    >
      {icon}
    </IconButton>
  );
}

export function AppearanceSettings({ model }: { model: AppModel }) {
  const { t } = useI18n();
  const { preference, setPreference, persistenceFailed } =
    useLocalePreference();
  const busy = useStore(
    model.stateStore,
    (state) => state.kind === "ready" && state.threadTransition === "unknown",
  );
  return (
    <>
      <label className="settings-preference-row">
        <span>{t("app.toolbar.language")}</span>
        <select
          value={preference}
          disabled={busy}
          onChange={(event) => {
            const value = event.currentTarget.value;
            if (value === "system" || value === "zh-CN" || value === "en-US")
              void setPreference(value);
          }}
        >
          <option value="system">{t("app.toolbar.systemLanguage")}</option>
          <option value="zh-CN">{t("app.toolbar.chinese")}</option>
          <option value="en-US">{t("app.toolbar.english")}</option>
        </select>
      </label>
      {persistenceFailed && (
        <p role="alert" className="failure">
          {t("app.language.saveFailed")}
        </p>
      )}
      <div className="settings-preference-row">
        <span>{t("app.layout.theme")}</span>
        <ThemeToggle model={model} />
      </div>
    </>
  );
}

function ThreadHeaderTitle({ model }: { model: AppModel }) {
  const directory = useStore(model.stateStore, (state) =>
    state.kind === "ready" && state.threadSelection.kind === "thread"
      ? state.threadSelection.thread.context.directory
      : null,
  );
  return (
    <span className="toolbar-title" title={directory ?? undefined}>
      {directory?.split("/").filter(Boolean).at(-1)}
    </span>
  );
}
