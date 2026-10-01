import { useStore } from "zustand";
import { DarkThemeIcon, LightThemeIcon } from "@/components/icons/common";
import { Button } from "@/components/ui/button";
import { useI18n } from "../../../modules/preferences/renderer/public";
import type { AppModel } from "../wiring/model";
import { NavigationHistory } from "./navigation-history";

export function PreferenceToolbar({
  model,
  hasThread,
}: {
  model: AppModel;
  hasThread: boolean;
}) {
  const { t, preference, setPreference, persistenceFailed } = useI18n();
  const theme = useStore(model.stateStore, (state) =>
    state.kind === "ready" ? state.preferences.theme : "light",
  );
  const density = useStore(model.stateStore, (state) =>
    state.kind === "ready" ? state.preferences.density : "normal",
  );
  const busy = useStore(
    model.stateStore,
    (state) =>
      state.kind === "ready" &&
      (state.busy || state.threadTransition === "unknown"),
  );
  return (
    <header className="toolbar">
      <NavigationHistory disabled={busy} />
      <Button
        variant="default"
        disabled={busy || !hasThread}
        onClick={() => void model.newThread()}
      >
        {t("app.toolbar.newThread")}
      </Button>
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
        <Button
          variant="ghost"
          disabled={busy}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => void model.preference("density")}
        >
          {density === "normal"
            ? t("app.toolbar.compactDensity")
            : t("app.toolbar.normalDensity")}
        </Button>
      </div>
    </header>
  );
}
