import { useContext } from "react";
import { match } from "ts-pattern";
import { useStore } from "zustand";
import {
  DarkThemeIcon,
  LightThemeIcon,
  SystemThemeIcon,
} from "@/components/icons/common";
import { IconButton } from "@/components/ui/icon-button";
import { useI18n } from "../../../modules/preferences/renderer/public";
import { Button } from "../../../modules/ui/renderer/public";
import { NewChatIcon } from "../components/icons/sidebar";
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
      variant="navigation"
      size="sidebar"
      disabled={!enabled}
      onClick={() => {
        reveal();
        void model.commands.execute({ kind: "new" });
      }}
    >
      <NewChatIcon />
      {t("app.toolbar.newThread")}
    </Button>
  );
}

export function PreferenceToolbar({
  model,
  title,
}: {
  model: AppModel;
  title?: string | undefined;
}) {
  return (
    <header className="toolbar">
      {title ? (
        <span className="toolbar-title">{title}</span>
      ) : (
        <ThreadHeaderTitle model={model} />
      )}
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
