import {
  type ReactNode,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useStore } from "zustand";
import {
  ChatIcon,
  CloseIcon,
  SettingsIcon,
  SidebarIcon,
} from "@/components/icons/common";
import { IconButton } from "@/components/ui/icon-button";
import { NavigationOverlay } from "@/components/ui/navigation-overlay";
import { ResizableSplit } from "@/components/ui/resizable";
import { SettingsModal } from "@/components/ui/settings-modal";
import {
  type WorkspaceTab,
  WorkspaceTabs,
} from "@/components/ui/workspace-tabs";
import { useI18n } from "../../../../modules/preferences/renderer/public";
import { ConversationVisibilityContext } from "./conversation-visibility";
import { solveGeometry } from "./geometry";
import { createLayoutModel, readLayoutTokens } from "./model";
export type WorkspaceHost = {
  tabs: WorkspaceTab[];
  selected: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
};
// Optional hosts are supplied by real features, or the isolated validation page.
// No production sample tabs/resources are registered here.
export function WorkbenchFrame({
  sidebar,
  settingsNavigation,
  settings,
  toolbar,
  navigationControls,
  children,
  workspace,
  bottom,
  conversationIndicator,
}: {
  sidebar: ReactNode;
  settingsNavigation: ReactNode;
  settings: ReactNode;
  toolbar: ReactNode;
  navigationControls: ReactNode;
  children: ReactNode;
  workspace?: WorkspaceHost;
  bottom?: WorkspaceHost;
  conversationIndicator?: ReactNode;
}) {
  const { t } = useI18n();
  const [tokens] = useState(readLayoutTokens);
  const [model] = useState(() => {
    let storage: Storage | undefined;
    try {
      storage = localStorage;
    } catch {
      /* Window storage can be unavailable. */
    }
    return createLayoutModel(tokens.defaults, storage);
  });
  const intent = useStore(model.store, (value) => value);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const reveal = useCallback(() => setSettingsOpen(false), []);
  const conversation = useMemo(
    () => ({ visible: !settingsOpen, reveal }),
    [settingsOpen, reveal],
  );
  const focusedRegion = useRef<"sidebar" | "workspace" | "bottom" | null>(null);
  const focusedNavigation = useRef<number | null>(null);
  const [overlay, setOverlay] = useState(false);
  const frame = useRef<HTMLDivElement>(null);
  const settingsTrigger = useRef<HTMLButtonElement>(null);
  const navigationTrigger = useRef<HTMLButtonElement>(null);
  const workspaceTrigger = useRef<HTMLButtonElement>(null);
  const bottomTrigger = useRef<HTMLButtonElement>(null);
  const work = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const host = frame.current;
    if (!host) return;
    const measure = () => {
      const rect = host.getBoundingClientRect();
      setBox((last) =>
        last.width === rect.width && last.height === rect.height
          ? last
          : { width: rect.width, height: rect.height },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);
  const geometry = solveGeometry(box, intent, tokens.constraints, {
    workspace: !!workspace?.tabs.length,
    bottom: !!bottom?.tabs.length,
  });
  const commitLeft = useCallback(
    (size: number) => model.commit("sidebar", size),
    [model],
  );
  const commitRight = useCallback(
    (size: number) => model.commit("workspace", size),
    [model],
  );
  const commitBottom = useCallback(
    (size: number) => model.commit("bottom", size),
    [model],
  );
  const focusInHidden = useCallback(
    (region: "sidebar" | "workspace" | "bottom", visible: boolean) => {
      if (region === "sidebar" && focusedNavigation.current !== null) return;
      if (
        !visible &&
        (focusedRegion.current === region ||
          frame.current
            ?.querySelector(`[data-layout-region="${region}"]`)
            ?.contains(document.activeElement))
      ) {
        ({
          sidebar: navigationTrigger,
          workspace: workspaceTrigger,
          bottom: bottomTrigger,
        })[region].current?.focus({ preventScroll: true });
      }
    },
    [],
  );
  useLayoutEffect(() => {
    focusInHidden("sidebar", geometry.sidebar.visible);
    focusInHidden("workspace", geometry.workspace.visible);
    focusInHidden("bottom", geometry.bottom.visible);
  }, [
    geometry.sidebar.visible,
    geometry.workspace.visible,
    geometry.bottom.visible,
    focusInHidden,
  ]);
  useLayoutEffect(() => {
    const index = focusedNavigation.current;
    if (index === null) return;
    const button = frame.current?.querySelectorAll<HTMLButtonElement>(
      ".header-navigation button",
    )[index];
    (button?.disabled ? navigationTrigger.current : button)?.focus({
      preventScroll: true,
    });
  }, [geometry.sidebar.visible]);
  useLayoutEffect(() => {
    if (geometry.sidebar.visible) setOverlay(false);
  }, [geometry.sidebar.visible]);
  const sidebarContent = sidebar;
  const toggleSidebar = () => {
    if (
      !geometry.sidebar.visible &&
      (geometry.sidebar.temporary ||
        box.width - tokens.constraints.rail <
          tokens.constraints.sidebarMin + tokens.constraints.conversationMin)
    )
      setOverlay(true);
    else model.toggle("sidebar");
  };
  const closeSettings = () => {
    setSettingsOpen(false);
    requestAnimationFrame(() => {
      const target =
        work.current?.querySelector<HTMLElement>(".tiptap") ??
        work.current?.querySelector<HTMLElement>("button");
      target?.focus({ preventScroll: true });
    });
  };
  const navigation = (
    <div className="header-navigation">
      {navigationControls}
      <IconButton
        ref={navigationTrigger}
        label={t("app.layout.sidebarToggle")}
        variant="ghost"
        aria-expanded={geometry.sidebar.visible || overlay}
        onClick={toggleSidebar}
      >
        <SidebarIcon />
      </IconButton>
    </div>
  );
  return (
    <ConversationVisibilityContext value={conversation}>
      <div
        ref={frame}
        data-macos={
          typeof navigator !== "undefined" &&
          navigator.userAgent.includes("Mac OS")
        }
        data-sidebar-visible={geometry.sidebar.visible}
        onFocusCapture={(event) => {
          const target = event.target;
          if (!(target instanceof Element)) return;
          const button = target.closest<HTMLButtonElement>(
            ".header-navigation button",
          );
          const navigation = button?.closest(".header-navigation");
          focusedNavigation.current =
            navigation && button
              ? [...navigation.querySelectorAll("button")].indexOf(button)
              : null;
          focusedRegion.current =
            target.id === "navigation-split-separator"
              ? "sidebar"
              : target.id === "workspace-split-separator"
                ? "workspace"
                : target.id === "bottom-split-separator"
                  ? "bottom"
                  : ((["sidebar", "workspace", "bottom"] as const).find(
                      (region) =>
                        frame.current
                          ?.querySelector(`[data-layout-region="${region}"]`)
                          ?.contains(target),
                    ) ?? null);
        }}
        className="window-frame"
        data-layout-settings={settingsOpen}
      >
        <nav className="activity-rail" aria-label={t("app.layout.navigation")}>
          <div className="rail-brand" aria-hidden="true">
            {/* i18n-ignore: product brand */}d
          </div>
          <IconButton
            label={t("app.layout.chat")}
            variant="navigation"
            aria-pressed={!settingsOpen}
            indicator={conversationIndicator}
            onClick={closeSettings}
          >
            <ChatIcon />
          </IconButton>
          <div className="rail-spacer" />
          <IconButton
            ref={settingsTrigger}
            label={t("app.layout.settings")}
            variant="navigation"
            aria-pressed={settingsOpen}
            onClick={() => setSettingsOpen(true)}
          >
            <SettingsIcon />
          </IconButton>
        </nav>
        <ResizableSplit
          id="navigation-split"
          axis="horizontal"
          side="start"
          {...geometry.sidebar}
          min={tokens.constraints.sidebarMin}
          label={t("app.layout.sidebarResize")}
          onCommit={commitLeft}
          auxiliary={
            <aside
              className="primary-sidebar"
              data-layout-region="sidebar"
              aria-label={t("app.layout.sidebar")}
            >
              <div className="panel-header">
                {geometry.sidebar.visible && navigation}
              </div>
              <div className="sidebar-scroll">{sidebarContent}</div>
            </aside>
          }
        >
          <ResizableSplit
            id="bottom-split"
            axis="vertical"
            side="end"
            {...geometry.bottom}
            min={tokens.constraints.bottomMin}
            label={t("app.layout.bottomResize")}
            onCommit={commitBottom}
            auxiliary={
              <PanelHost
                id="bottom"
                host={bottom}
                title={t("app.layout.bottom")}
                visible={geometry.bottom.visible}
                onHide={() => model.toggle("bottom")}
                onEmpty={() =>
                  navigationTrigger.current?.focus({ preventScroll: true })
                }
              />
            }
          >
            <ResizableSplit
              id="workspace-split"
              axis="horizontal"
              side="end"
              {...geometry.workspace}
              min={tokens.constraints.workspaceMin}
              label={t("app.layout.workspaceResize")}
              onCommit={commitRight}
              auxiliary={
                <PanelHost
                  id="workspace"
                  host={workspace}
                  title={t("app.layout.workspace")}
                  visible={geometry.workspace.visible}
                  onHide={() => model.toggle("workspace")}
                  onEmpty={() =>
                    navigationTrigger.current?.focus({ preventScroll: true })
                  }
                />
              }
            >
              <div className="conversation-surface">
                <div className="panel-header conversation-header">
                  {!geometry.sidebar.visible && navigation}
                  {toolbar}
                  {!!workspace?.tabs.length && (
                    <IconButton
                      ref={workspaceTrigger}
                      label={t("app.layout.showWorkspace")}
                      variant="navigation"
                      aria-pressed={intent.workspace.open}
                      onClick={() => model.toggle("workspace")}
                    >
                      <SidebarIcon />
                    </IconButton>
                  )}
                  {!!bottom?.tabs.length && (
                    <IconButton
                      ref={bottomTrigger}
                      label={t("app.layout.showBottom")}
                      variant="navigation"
                      aria-pressed={intent.bottom.open}
                      onClick={() => model.toggle("bottom")}
                    >
                      <SidebarIcon />
                    </IconButton>
                  )}
                </div>
                {(geometry.workspace.temporary ||
                  geometry.bottom.temporary) && (
                  <p className="layout-notice" role="status">
                    {t("app.layout.temporarilyHidden")}
                  </p>
                )}
                <div ref={work} className="conversation-body">
                  {children}
                </div>
              </div>
            </ResizableSplit>
          </ResizableSplit>
        </ResizableSplit>
        <SettingsModal
          open={settingsOpen}
          onClose={reveal}
          title={t("app.layout.settings")}
          closeLabel={t("app.layout.close")}
          returnFocus={settingsTrigger}
          navigation={settingsNavigation}
        >
          {settings}
        </SettingsModal>
        <NavigationOverlay
          open={overlay}
          onClose={() => setOverlay(false)}
          title={t("app.layout.sidebar")}
          closeLabel={t("app.layout.close")}
          returnFocus={navigationTrigger}
          nativeInset={
            typeof navigator !== "undefined" &&
            navigator.userAgent.includes("Mac OS")
          }
        >
          <div
            onClick={(event) => {
              if (
                event.target instanceof Element &&
                event.target.closest(
                  "[data-thread-navigation], [data-new-thread], [data-choose-project]",
                )
              )
                setOverlay(false);
            }}
          >
            {sidebarContent}
          </div>
        </NavigationOverlay>
      </div>
    </ConversationVisibilityContext>
  );
}
function PanelHost({
  id,
  title,
  host,
  visible,
  onHide,
  onEmpty,
}: {
  id: string;
  title: string;
  host: WorkspaceHost | undefined;
  visible: boolean;
  onHide: () => void;
  onEmpty: () => void;
}) {
  const { t } = useI18n();
  return (
    <section
      className="workspace-host"
      data-layout-region={id}
      aria-label={title}
      inert={!visible}
    >
      <div className="panel-header">
        <WorkspaceTabs
          id={id}
          tabs={host?.tabs ?? []}
          selected={host?.selected ?? null}
          onSelect={host?.onSelect ?? (() => {})}
          onClose={host?.onClose ?? (() => {})}
          onEmpty={onEmpty}
          closeLabel={(title) => t("app.layout.closeTab", { title })}
        />
        <IconButton
          variant="ghost"
          label={t("app.layout.close")}
          onClick={onHide}
        >
          <CloseIcon />
        </IconButton>
      </div>
      <div className="workspace-host-body">
        {host?.tabs.map((tab) => (
          <div
            key={tab.id}
            id={`${id}-content-${tab.id}`}
            role="tabpanel"
            aria-labelledby={`${id}-tab-${tab.id}`}
            hidden={host.selected !== tab.id}
            className="workspace-tab-content"
          >
            {tab.content}
          </div>
        ))}
      </div>
    </section>
  );
}
