import { clsx } from "clsx";
import { type ReactNode, useRef, useState } from "react";
import {
  AddIcon,
  ChatIcon,
  SettingsIcon,
  SidebarIcon,
} from "../../components/icons/common";
import { Button } from "../../components/ui/button";
import { IconButton } from "../../components/ui/icon-button";
import { NavigationOverlay } from "../../components/ui/navigation-overlay";
import { ResizableSplit } from "../../components/ui/resizable";
import { SettingsModal } from "../../components/ui/settings-modal";
import { WorkspaceTabs } from "../../components/ui/workspace-tabs";
import { demoLabels as labels } from "./catalog";
import styles from "./component-dashboard.module.css";
import { iconPreviews } from "./icon-catalog";

function Sample({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles["gallery-sample"]}>
      <div className={styles["gallery-sample-control"]}>{children}</div>
      <span className={styles["gallery-label"]}>{label}</span>
    </div>
  );
}
export function ButtonDemo() {
  const [count, setCount] = useState(0);
  const [pressed, setPressed] = useState(false);
  return (
    <>
      <div className={styles["gallery-samples"]}>
        <Sample label="default">
          <Button onClick={() => setCount(count + 1)}>{labels.primary}</Button>
        </Sample>
        <Sample label="ghost">
          <Button variant="ghost" onClick={() => setCount(count + 1)}>
            {labels.ghost}
          </Button>
        </Sample>
        <Sample label="navigation / aria-pressed">
          <Button
            variant="navigation"
            aria-pressed={pressed}
            onClick={() => setPressed(!pressed)}
          >
            {pressed ? labels.pressed : labels.navigation}
          </Button>
        </Sample>
        <Sample label="default / icon">
          <Button
            size="icon"
            aria-label={labels.icon}
            onClick={() => setCount(count + 1)}
          >
            <AddIcon />
          </Button>
        </Sample>
        {(["default", "ghost", "navigation"] as const).map((variant) => (
          <Sample key={variant} label={`${variant} / disabled`}>
            <Button variant={variant} disabled>
              {labels.disabled}
            </Button>
          </Sample>
        ))}
      </div>
      <output
        className={styles["gallery-feedback"]}
        aria-label={labels.buttonFeedback}
      >
        {labels.buttonCount(count)}
      </output>
    </>
  );
}
export function IconButtonDemo() {
  const [count, setCount] = useState(0);
  return (
    <>
      <div className={styles["gallery-samples"]}>
        <Sample label="tooltip">
          <IconButton
            variant="ghost"
            label={labels.add}
            onClick={() => setCount(count + 1)}
          >
            <AddIcon />
          </IconButton>
        </Sample>
        <Sample label="indicator: 0">
          <IconButton
            variant="ghost"
            label={labels.zero}
            indicator={<span className={styles["gallery-badge"]}>0</span>}
            onClick={() => setCount(count + 1)}
          >
            <ChatIcon />
          </IconButton>
        </Sample>
        <Sample label="indicator: 999+">
          <IconButton
            variant="ghost"
            label={labels.overflow}
            indicator={<span className={styles["gallery-badge"]}>999+</span>}
            onClick={() => setCount(count + 1)}
          >
            <ChatIcon />
          </IconButton>
        </Sample>
        <Sample label="indicator: status">
          <IconButton
            variant="ghost"
            label={labels.attention}
            indicator={<span className="activity-indicator" />}
            onClick={() => setCount(count + 1)}
          >
            <SettingsIcon />
          </IconButton>
        </Sample>
        <Sample label="disabled">
          <IconButton variant="ghost" label={labels.inactive} disabled>
            <AddIcon />
          </IconButton>
        </Sample>
      </div>
      <output className={styles["gallery-feedback"]}>
        {labels.iconFeedback(count)}
      </output>
    </>
  );
}
const initialTabs = [
  { id: "files", title: labels.files, content: labels.files },
  { id: "preview", title: labels.preview, content: labels.preview },
  { id: "settings", title: labels.settings, content: labels.settings },
];
export function TabsDemo() {
  const [tabs, setTabs] = useState(initialTabs);
  const [selected, setSelected] = useState<string | null>("files");
  const fallback = useRef<HTMLDivElement>(null);
  const active = tabs.find((tab) => tab.id === selected);
  return (
    <div
      className={styles["gallery-tabs-preview"]}
      ref={fallback}
      tabIndex={-1}
    >
      <WorkspaceTabs
        id="gallery-tabs"
        tabs={tabs}
        selected={selected}
        onSelect={setSelected}
        onClose={(id) => {
          const next = tabs.filter((tab) => tab.id !== id);
          setTabs(next);
          if (selected === id) setSelected(next[0]?.id ?? null);
        }}
        closeLabel={labels.closeTab}
        onEmpty={() => fallback.current?.focus()}
      />
      {active ? (
        <div
          className={styles["gallery-tab-content"]}
          id={`gallery-tabs-content-${active.id}`}
          role="tabpanel"
          aria-labelledby={`gallery-tabs-tab-${active.id}`}
        >
          {labels.tabBody}
          {active.content}
        </div>
      ) : (
        <p className={styles["gallery-feedback"]}>{labels.tabEmpty}</p>
      )}
    </div>
  );
}
function SplitPreview({ axis }: { axis: "horizontal" | "vertical" }) {
  const [size, setSize] = useState(120);
  const [visible, setVisible] = useState(true);
  return (
    <div className={styles["gallery-split-preview"]}>
      <div className={styles["gallery-demo-toolbar"]}>
        <span>
          {axis === "horizontal" ? labels.horizontal : labels.vertical}
        </span>
        <Button variant="ghost" onClick={() => setVisible(!visible)}>
          {visible ? labels.hide : labels.show}
        </Button>
      </div>
      <div className={styles["gallery-split-host"]}>
        <ResizableSplit
          id={`gallery-${axis}`}
          axis={axis}
          side={axis === "horizontal" ? "start" : "end"}
          size={size}
          min={60}
          max={220}
          visible={visible}
          label={
            axis === "horizontal"
              ? labels.horizontalLabel
              : labels.verticalLabel
          }
          onCommit={setSize}
          auxiliary={
            <div
              className={clsx(
                styles["gallery-panel"],
                styles["gallery-panel-auxiliary"],
              )}
            >
              {labels.auxiliaryPanel}
            </div>
          }
        >
          <div className={styles["gallery-panel"]}>{labels.mainPanel}</div>
        </ResizableSplit>
      </div>
      <output className={styles["gallery-feedback"]}>
        {labels.panelSize(size)}
      </output>
    </div>
  );
}
export function SplitDemo() {
  return (
    <div className={styles["gallery-split-pair"]}>
      <SplitPreview axis="horizontal" />
      <SplitPreview axis="vertical" />
    </div>
  );
}
export function NavigationDemo() {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(labels.overview);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <>
      <Button ref={trigger} variant="ghost" onClick={() => setOpen(true)}>
        <SidebarIcon />
        {labels.openNavigation}
      </Button>
      <p className={styles["gallery-feedback"]}>{labels.choice(selected)}</p>
      <NavigationOverlay
        open={open}
        onClose={() => setOpen(false)}
        title={labels.navigationTitle}
        closeLabel={labels.closeNavigation}
        returnFocus={trigger}
        nativeInset={false}
      >
        <div className={styles["gallery-overlay-content"]}>
          <p>{labels.overlayHint}</p>
          <nav className={styles["gallery-demo-navigation"]}>
            {[labels.overview, labels.files, labels.settings].map((name) => (
              <Button
                key={name}
                variant="navigation"
                aria-pressed={selected === name}
                onClick={() => setSelected(name)}
              >
                {name}
              </Button>
            ))}
          </nav>
        </div>
      </NavigationOverlay>
    </>
  );
}
export function SettingsDemo() {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(labels.appearance);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <>
      <Button ref={trigger} variant="ghost" onClick={() => setOpen(true)}>
        <SettingsIcon />
        {labels.openSettings}
      </Button>
      <p className={styles["gallery-feedback"]}>{labels.choice(selected)}</p>
      <SettingsModal
        open={open}
        onClose={() => setOpen(false)}
        title={labels.settingsTitle}
        closeLabel={labels.closeSettings}
        returnFocus={trigger}
        navigation={
          <nav className={styles["gallery-demo-navigation"]}>
            {[labels.appearance, labels.about].map((name) => (
              <Button
                key={name}
                variant="navigation"
                aria-pressed={selected === name}
                onClick={() => setSelected(name)}
              >
                {name}
              </Button>
            ))}
          </nav>
        }
      >
        <div className={styles["gallery-overlay-content"]}>
          <h3>{selected}</h3>
          <p>{labels.overlayHint}</p>
          <p>{labels.choice(selected)}</p>
        </div>
      </SettingsModal>
    </>
  );
}
export function IconsDemo() {
  return (
    <div className={styles["gallery-icon-grid"]} data-gallery-icons>
      {iconPreviews.map(({ key, name, Icon }) => (
        <Sample key={key} label={name}>
          <div className={styles["gallery-samples"]}>
            {([16, 18, 20, 24] as const).map((size) => (
              <Sample key={size} label={`${size} px`}>
                <Icon size={size} />
              </Sample>
            ))}
          </div>
        </Sample>
      ))}
    </div>
  );
}
