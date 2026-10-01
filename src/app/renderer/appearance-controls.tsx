import { useRouter, useRouterState } from "@tanstack/react-router";
import { useStore } from "zustand";
import {
  DarkThemeIcon,
  FolderIcon,
  LightThemeIcon,
} from "@/components/icons/common";
import { Button } from "@/components/ui/button";
import { useI18n } from "../../modules/preferences/renderer/public";
import type { AppModel } from "./model";

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

export function ThreadNotice({ model }: { model: AppModel }) {
  const { t, formatMessage } = useI18n();
  const notice = useStore(model.stateStore, (state) =>
    state.kind === "ready" ? state.notice : null,
  );
  const uncertain = useStore(
    model.stateStore,
    (state) => state.kind === "ready" && state.threadTransition === "unknown",
  );
  const busy = useStore(
    model.stateStore,
    (state) => state.kind === "ready" && state.busy,
  );
  if (!notice) return null;
  return (
    <div role="alert" className="notice failure">
      {formatMessage(notice.message)}
      <span className="trace"> {notice.traceId}</span>
      {uncertain && (
        <>
          <p>{t("app.navigation.selectionUnknown")}</p>
          <Button
            disabled={busy}
            onClick={() => void model.reconcileSelection()}
          >
            {t("app.navigation.checkSelection")}
          </Button>
        </>
      )}
    </div>
  );
}

export function ChooseProjectButton({ model }: { model: AppModel }) {
  const { t } = useI18n();
  const busy = useStore(
    model.stateStore,
    (state) =>
      state.kind === "ready" &&
      (state.busy || state.threadTransition === "unknown"),
  );
  return (
    <Button disabled={busy} onClick={() => void model.choose()}>
      <FolderIcon />
      {t("app.empty.choose")}
    </Button>
  );
}

function NavigationHistory({ disabled }: { disabled: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const index = useRouterState({
    select: (state) => state.location.state.__TSR_index,
  });
  return (
    <div className="flex gap-2">
      <Button
        variant="ghost"
        disabled={disabled || index === 0}
        onClick={() => router.history.back()}
      >
        {t("app.navigation.back")}
      </Button>
      <Button
        variant="ghost"
        disabled={disabled || index >= router.history.length - 1}
        onClick={() => router.history.forward()}
      >
        {t("app.navigation.forward")}
      </Button>
    </div>
  );
}
