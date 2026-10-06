import { useContext } from "react";
import { useStore } from "zustand";
import { DarkThemeIcon, LightThemeIcon } from "@/components/icons/common";
import { Button } from "@/components/ui/button";
import {
  useI18n,
  useLocalePreference,
} from "../../../modules/preferences/renderer/public";
import type { AppModel } from "../wiring/model";
import { ConversationVisibilityContext } from "./layout/conversation-visibility";
import { NavigationHistory } from "./navigation-history";

export function PreferenceToolbar({ model }: { model: AppModel }) {
  const { reveal } = useContext(ConversationVisibilityContext);
  const hasThread = useStore(
    model.stateStore,
    (state) =>
      state.kind === "ready" && state.threadSelection.kind === "thread",
  );
  const { t } = useI18n();
  const { preference, setPreference, persistenceFailed } =
    useLocalePreference();
  const theme = useStore(model.stateStore, (state) =>
    state.kind === "ready" ? state.preferences.theme : "light",
  );
  const busy = useStore(
    model.stateStore,
    (state) => state.kind === "ready" && state.threadTransition === "unknown",
  );
  return (
    <header className="toolbar">
      <NavigationHistory disabled={busy} />
      <Button
        variant="default"
        disabled={busy || !hasThread}
        onClick={() => {
          reveal();
          void model.newThread();
        }}
      >
        {t("app.toolbar.newThread")}
      </Button>
      <ThreadHeaderTitle model={model} />
      <div className="flex gap-2">
        <select
          aria-label={t("app.toolbar.language")}
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
        {persistenceFailed && (
          <span role="alert" className="failure">
            {t("app.language.saveFailed")}
          </span>
        )}
        <Button
          variant="ghost"
          disabled={busy}
          aria-label={
            theme === "light"
              ? t("app.toolbar.darkTheme")
              : t("app.toolbar.lightTheme")
          }
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => void model.preference("theme")}
        >
          {theme === "light" ? <DarkThemeIcon /> : <LightThemeIcon />}
        </Button>
      </div>
    </header>
  );
}

function ThreadHeaderTitle({ model }: { model: AppModel }) {
  const directory = useStore(model.stateStore, (state) =>
    state.kind === "ready" && state.threadSelection.kind === "thread"
      ? state.threadSelection.thread.context.directory
      : null,
  );
  return directory ? (
    <span className="toolbar-title" title={directory}>
      {directory.split("/").filter(Boolean).at(-1)}
    </span>
  ) : null;
}
