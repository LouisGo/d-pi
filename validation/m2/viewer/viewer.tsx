import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { FilePanel } from "../../../src/app/renderer/workbench/file-panel";
import type { GitBridge } from "../../../src/modules/changes/contracts/public";
import type { FileBridge } from "../../../src/modules/files/contracts/public";
import { I18nProvider } from "../../../src/modules/preferences/renderer/public";
import { ThreadContextSchema } from "../../../src/modules/threads/contracts/public";
import "../../../src/app/renderer/styles/app.css";

// Count real browser Worker construction/termination before dynamically loading
// Monaco. This fixture substitutes file IPC only, and never connects an Agent.
const workerStats = { created: 0, terminated: 0 };
const BrowserWorker = globalThis.Worker;
globalThis.Worker = class extends BrowserWorker {
  #terminated = false;
  constructor(url: string | URL, options?: WorkerOptions) {
    super(url, options);
    workerStats.created++;
  }
  override terminate() {
    if (!this.#terminated) {
      workerStats.terminated++;
      this.#terminated = true;
    }
    super.terminate();
  }
};

const client = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});
const resource = ThreadContextSchema.parse({
  threadId: crypto.randomUUID(),
  workingDirectoryId: crypto.randomUUID(),
  directory: "/viewer-fixture",
});
const text = Array.from(
  { length: 400 },
  (_, index) => `line ${index + 1}: current content`,
).join("\n");
let reads = 0;
const files: FileBridge = {
  request: async (command) => {
    reads++;
    return {
      kind: "completed",
      operationId: command.operationId,
      traceId: command.traceId,
      reply:
        command.kind === "list"
          ? {
              kind: "entries",
              path: "",
              entries: [{ name: "a.txt", path: "a.txt", kind: "file" }],
              truncated: false,
            }
          : {
              kind: "text",
              path: "a.txt",
              text,
              bytes: text.length,
              version: "file-v1",
              capturedAt: "fixture",
              coverage: "complete",
            },
    };
  },
  cancel: async (identity) => ({ kind: "acknowledged", ...identity }),
};
const git: GitBridge = {
  request: async (command) => {
    reads++;
    return {
      kind: "completed",
      operationId: command.operationId,
      traceId: command.traceId,
      reply:
        command.kind === "list"
          ? {
              kind: "changes",
              repository: resource.directory,
              head: "fixture",
              capturedAt: "fixture",
              coverage: "project-paths-current-sample",
              entries: [
                { path: "a.txt", scope: "index-worktree", status: "modified" },
              ],
              truncated: false,
            }
          : {
              kind: "diff",
              repository: resource.directory,
              path: "a.txt",
              scope: "index-worktree",
              head: "fixture",
              capturedAt: "fixture",
              coverage: "single-file-current-sample",
              left: {
                kind: "text",
                text: text.replace("current", "old"),
                version: "left-v1",
                source: "index",
                coverage: "complete",
              },
              right: {
                kind: "text",
                text,
                version: "file-v1",
                source: "worktree",
                coverage: "complete",
              },
            },
    };
  },
  cancel: async (identity) => ({ kind: "acknowledged", ...identity }),
};
const { MonacoViewer } = await import(
  "../../../src/modules/files/renderer/editor/monaco-viewer"
);
const monaco = await import("monaco-editor/editor/editor.api");
let setPanelActive: (active: boolean) => void = () => {};
function Probe() {
  const [active, setActive] = useState(false);
  setPanelActive = setActive;
  return (
    <QueryClientProvider client={client}>
      <I18nProvider
        initialSnapshot={{ preference: "en-US", resolvedLocale: "en-US" }}
      >
        <FilePanel
          resource={resource}
          files={files}
          git={git}
          active={active}
          editor={MonacoViewer}
          onAttach={() => {}}
        />
      </I18nProvider>
    </QueryClientProvider>
  );
}
Object.assign(window, {
  viewerProbe: {
    active: (active: boolean) => setPanelActive(active),
    open: (kind: "file" | "diff") =>
      document
        .querySelector<HTMLButtonElement>(
          kind === "file" ? ".file-list button" : ".change-list button",
        )
        ?.click(),
    snapshot: () => ({
      reads,
      models: monaco.editor.getModels().length,
      ...workerStats,
      activeWorkers: workerStats.created - workerStats.terminated,
      queries: client.getQueryCache().getAll().length,
      fileTargets: document.querySelectorAll(".file-list button").length,
      visible: document.visibilityState,
      viewer: !!document.querySelector(".monaco-editor"),
    }),
  },
});
createRoot(document.getElementById("root")!).render(<Probe />);
