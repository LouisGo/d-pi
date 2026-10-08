import {
  createContext,
  type ReactNode,
  useContext,
  useId,
  useState,
} from "react";
import { useStore } from "zustand";
import { ConfigurationSettings } from "../../../../modules/configuration/renderer/public";
import { useI18n } from "../../../../modules/preferences/renderer/public";
import {
  Button,
  Select,
  SettingRow,
  SettingsGroup,
  SettingsPage,
} from "../../../../modules/ui/renderer/public";
import {
  LightThemeIcon,
  SettingsIcon,
  SystemThemeIcon,
  ToolsIcon,
  WebsiteIcon,
} from "../../components/icons/common";
import { SettingsVisibilityContext } from "../../components/ui/settings-visibility";
import type { AppModel } from "../../wiring/model";
import { AttentionPreferences } from "../attention";
import { Diagnostics } from "../diagnostics";
import { AppearanceSettings, GeneralSettings } from "./preferences";

const sections = [
  "appearance",
  "general",
  "configuration",
  "attention",
  "diagnostics",
] as const;
type SettingsSection = (typeof sections)[number];
const SettingsContext = createContext<{
  section: SettingsSection;
  select: (section: SettingsSection) => void;
  id: string;
}>({ section: "appearance", select: () => {}, id: "settings" });
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [section, select] = useState<SettingsSection>("appearance");
  const id = useId();
  return (
    <SettingsContext.Provider value={{ section, select, id }}>
      {children}
    </SettingsContext.Provider>
  );
}
export function useSettingsSelect() {
  return useContext(SettingsContext).select;
}
export function SettingsNavigation() {
  const { t } = useI18n();
  const { section, select, id } = useContext(SettingsContext);
  const icons = {
    appearance: <LightThemeIcon />,
    general: <SettingsIcon size={16} />,
    configuration: <WebsiteIcon />,
    attention: <SystemThemeIcon />,
    diagnostics: <ToolsIcon size={16} />,
  };
  return (
    <nav className="settings-navigation" aria-label={t("app.layout.settings")}>
      {sections.map((value) => (
        <Button
          key={value}
          variant="navigation"
          aria-current={section === value ? "page" : undefined}
          aria-controls={`${id}-${value}`}
          onClick={() => select(value)}
        >
          {icons[value]}
          {t(
            value === "general"
              ? "settings.general"
              : value === "configuration"
                ? "providers.title"
                : `app.layout.${value}`,
          )}
        </Button>
      ))}
    </nav>
  );
}
function ThreadConfiguration({
  model,
  active,
}: {
  model: AppModel;
  active: boolean;
}) {
  const { t } = useI18n();
  const [scopeChoice, setScopeChoice] = useState<"global" | "thread">("thread");
  const threadSelection = useStore(model.stateStore, (state) =>
    state.kind === "ready" ? state.threadSelection : null,
  );
  const unknown = useStore(
    model.stateStore,
    (state) => state.kind === "ready" && state.threadTransition === "unknown",
  );
  const thread =
    threadSelection?.kind === "thread" ? threadSelection.thread : null;
  return model.configuration ? (
    <>
      {unknown && (
        <p role="status" className="muted">
          {t("settings.configurationUnavailable")}
        </p>
      )}
      <div hidden={unknown} className="configuration-scope">
        <Select<"global" | "thread">
          aria-label={t("providers.roleScope")}
          value={thread ? scopeChoice : "global"}
          onValueChange={setScopeChoice}
          options={[
            { value: "global", label: t("providers.globalScope") },
            ...(thread
              ? [
                  {
                    value: "thread" as const,
                    label: t("providers.threadScope"),
                  },
                ]
              : []),
          ]}
        />
      </div>
      <div hidden={unknown}>
        <ConfigurationSettings
          bridge={model.configuration}
          presentation="page"
          active={active && !unknown}
          scope={
            thread && scopeChoice === "thread"
              ? {
                  kind: "thread",
                  threadId: thread.context.threadId,
                  workingDirectoryId: thread.context.workingDirectoryId,
                }
              : { kind: "application" }
          }
        />
      </div>
    </>
  ) : (
    <p role="status" className="muted">
      {t("settings.configurationUnavailable")}
    </p>
  );
}
function PreferenceFeedback({ model }: { model: AppModel }) {
  const { formatMessage } = useI18n();
  const notice = useStore(model.stateStore, (state) =>
    state.kind === "ready" ? state.notice : null,
  );
  return notice ? (
    <p role="alert" className="failure">
      {formatMessage(notice.message)}
    </p>
  ) : null;
}
export function SettingsSurface({ model }: { model: AppModel }) {
  const { t } = useI18n();
  const { section, id } = useContext(SettingsContext);
  const visible = useContext(SettingsVisibilityContext);
  return (
    <>
      <SettingsPage
        id={`${id}-appearance`}
        title={t("app.layout.appearance")}
        description={t("settings.appearanceDescription")}
        hidden={section !== "appearance"}
      >
        <AppearanceSettings model={model} />
        <PreferenceFeedback model={model} />
      </SettingsPage>
      <SettingsPage
        id={`${id}-general`}
        title={t("settings.general")}
        description={t("settings.generalDescription")}
        hidden={section !== "general"}
      >
        <GeneralSettings model={model} />
        <PreferenceFeedback model={model} />
      </SettingsPage>
      <SettingsPage
        id={`${id}-configuration`}
        title={t("providers.title")}
        description={t("providers.description")}
        hidden={section !== "configuration"}
      >
        <ThreadConfiguration
          model={model}
          active={visible && section === "configuration"}
        />
        <PreferenceFeedback model={model} />
      </SettingsPage>
      <SettingsPage
        id={`${id}-attention`}
        title={t("app.layout.attention")}
        description={t("settings.attentionDescription")}
        hidden={section !== "attention"}
      >
        <AttentionPreferences model={model} />
      </SettingsPage>
      <SettingsPage
        id={`${id}-diagnostics`}
        title={t("app.layout.diagnostics")}
        description={t("settings.diagnosticsDescription")}
        hidden={section !== "diagnostics"}
      >
        <SettingsGroup title={t("settings.diagnosticsTools")}>
          <SettingRow
            label={t("ui.diagnostics.entry")}
            description={t("settings.diagnosticsRowDescription")}
          >
            <Diagnostics contained />
          </SettingRow>
        </SettingsGroup>
      </SettingsPage>
    </>
  );
}
