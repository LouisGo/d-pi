import { useState } from "react";
import { createRoot } from "react-dom/client";
import { App } from "../../src/app/renderer/app";
import { ChatIcon } from "../../src/app/renderer/components/icons/common";
import { IconButton } from "../../src/app/renderer/components/ui/icon-button";
import type { WorkbenchHosts } from "../../src/app/renderer/shell/layout/hosts-context";
import type { WorkspaceTab } from "../../src/app/renderer/shell/layout/workbench-frame";
import { QueryProvider } from "../../src/app/renderer/wiring/query-client";
import { MonacoViewer } from "../../src/modules/files/renderer/editor/monaco-viewer";
import { I18nProvider } from "../../src/modules/preferences/renderer/public";
import { bridge, model } from "./rendering.js";

const rightSamples: WorkspaceTab[] = [
  {
    id: "source",
    title: "Isolated source container",
    content: (
      <>
        <p data-selectable>
          Isolated container sample — not a production workspace feature.
        </p>
        <MonacoViewer
          view={{
            kind: "file",
            text: "// Isolated geometry sample\nconst reading = true;\n".repeat(
              30,
            ),
            source: { path: "sample.ts", source: "file", version: "fixture" },
          }}
          onSelection={() => {}}
        />
      </>
    ),
  },
  {
    id: "details",
    title: "Isolated details container",
    content: (
      <p data-selectable>
        Second isolated panel for keyboard and tab continuity.
      </p>
    ),
  },
];
const bottomSamples: WorkspaceTab[] = [
  {
    id: "sample",
    title: "Isolated bottom container",
    content: (
      <>
        <IconButton
          label="Numeric indicator fixture"
          indicator={<span>999+</span>}
        >
          <ChatIcon />
        </IconButton>
        <IconButton label="Zero indicator fixture" indicator={0}>
          <ChatIcon />
        </IconButton>
        <IconButton
          label="Long accessible label does not occupy icon layout"
          disabled
          indicator={
            <span role="status">
              <span className="sr-only">Long accessible status</span>
            </span>
          }
        >
          <ChatIcon />
        </IconButton>
        <pre data-selectable>
          {"Container scrolling sample; no PTY or browser is running.\n".repeat(
            50,
          )}
        </pre>
      </>
    ),
  },
];
function Harness() {
  const [enabled, setEnabled] = useState(false);
  const [right, setRight] = useState(rightSamples);
  const [bottom, setBottom] = useState(bottomSamples);
  const [selectedRight, selectRight] = useState("source");
  const [selectedBottom, selectBottom] = useState("sample");
  Object.assign(window, {
    hostProbe: {
      enable: () => setEnabled(true),
      reset: () => {
        setRight(rightSamples);
        setBottom(bottomSamples);
      },
      disable: () => setEnabled(false),
    },
  });
  const hosts: WorkbenchHosts = enabled
    ? {
        workspace: {
          tabs: right,
          selected: selectedRight,
          onSelect: selectRight,
          onClose: (id) => {
            const next = right.filter((tab) => tab.id !== id);
            setRight(next);
            if (selectedRight === id) selectRight(next[0]?.id ?? "");
          },
        },
        bottom: {
          tabs: bottom,
          selected: selectedBottom,
          onSelect: selectBottom,
          onClose: (id) => setBottom(bottom.filter((tab) => tab.id !== id)),
        },
      }
    : {};
  return <App model={model} hosts={hosts} />;
}
const root = document.getElementById("root");
if (!root) throw Error("Missing root");
createRoot(root).render(
  <QueryProvider>
    <I18nProvider
      bridge={bridge.locale}
      initialSnapshot={{ preference: "en-US", resolvedLocale: "en-US" }}
    >
      <Harness />
    </I18nProvider>
  </QueryProvider>,
);
void model.start();
