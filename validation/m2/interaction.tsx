import "./rendering.js";
import { createRoot } from "react-dom/client";
import { Button } from "../../src/app/renderer/components/ui/button";
import { Markdown } from "../../src/app/renderer/reading/markdown";
import type { FrozenSelection } from "../../src/modules/files/core/public";
import { MonacoViewer } from "../../src/modules/files/renderer/editor/monaco-viewer";
import { I18nProvider } from "../../src/modules/preferences/renderer/public";

const probe = {
  clicks: 0,
  selection: null as FrozenSelection | null,
  show() {
    const app = document.querySelector<HTMLElement>(".app-shell");
    if (app) app.hidden = true;
    const host = document.createElement("div");
    host.id = "interaction-fixture";
    Object.assign(host.style, {
      position: "fixed",
      inset: "0",
      padding: "20px",
      overflow: "auto",
      background: "var(--surface)",
    });
    document.body.append(host);
    const portal = document.createElement("button");
    portal.id = "probe-portal";
    portal.textContent = "Portaled vendor control";
    portal.style.cursor = "pointer";
    portal.style.position = "fixed";
    portal.style.bottom = "0";
    document.body.append(portal);
    const pane = {
      text: "const pointer = 1;\nconst selected = 2;",
      source: {
        path: "probe.ts",
        version: "raw:fixture",
        source: "file" as const,
      },
    };
    createRoot(host).render(
      <I18nProvider
        initialSnapshot={{ preference: "en-US", resolvedLocale: "en-US" }}
      >
        <p id="probe-body">Application chrome should never be selectable.</p>
        <div className="flex gap-2">
          <Button id="probe-button" onClick={() => probe.clicks++}>
            Action
          </Button>
          <Button
            id="probe-icon"
            size="icon"
            variant="ghost"
            aria-label="Icon action"
          >
            <svg width="16" height="16">
              <circle cx="8" cy="8" r="5" fill="currentColor" />
            </svg>
          </Button>
          <Button id="probe-disabled" disabled onClick={() => probe.clicks++}>
            Disabled
          </Button>
          <a id="probe-link" href="#fixture">
            Text link
          </a>
          <Button id="probe-navigation" variant="navigation">
            Navigation
          </Button>
          <Button id="probe-selected" variant="navigation" aria-current="page">
            Selected
          </Button>
          <label id="probe-checkbox-label">
            <input id="probe-check" type="checkbox" />
            Toggle
          </label>
        </div>
        <details>
          <summary id="probe-summary">Expandable content</summary>
          <p>Details</p>
        </details>
        <details className="file-meta" open>
          <summary id="probe-file-summary">Sampling details</summary>
          <p id="probe-file-meta">
            /project/probe.ts · raw:fixture · 2026-10-06
          </p>
        </details>
        <div data-selectable>
          <p id="probe-text">
            Readable content supports native selection and copying.
          </p>
          <Button id="probe-reading-button" variant="ghost">
            Embedded operation must not select its label
          </Button>
          <Markdown
            text={
              "Reading **body** and `code`.\n\n```ts\nconst value = 1;\n```"
            }
          />
        </div>
        <input id="probe-input" defaultValue="Editable input" />
        <textarea id="probe-textarea" defaultValue="Editable textarea" />
        <div id="probe-file">
          <MonacoViewer
            view={{ kind: "file", ...pane }}
            onSelection={(value) => {
              probe.selection = value;
            }}
          />
        </div>
        <div id="probe-diff">
          <MonacoViewer
            view={{
              kind: "diff",
              left: pane,
              right: {
                ...pane,
                text: "const pointer = 2;\nconst selected = 3;",
              },
            }}
            onSelection={() => {}}
          />
        </div>
      </I18nProvider>,
    );
  },
};
Object.assign(window, { interactionProbe: probe });
