import { createRoot } from "react-dom/client";
import {
  type DesktopBridge,
  parseDesktopReply,
} from "../../src/app/contracts/desktop-bridge";
import { App } from "../../src/app/renderer/app";
import { AppModel } from "../../src/app/renderer/wiring/model";
import { QueryProvider } from "../../src/app/renderer/wiring/query-client";
import { RuntimeViewSchema } from "../../src/modules/execution/contracts/public";
import { DraftSchema } from "../../src/modules/input/contracts/public";
import type { Preferences } from "../../src/modules/preferences/contracts/public";
import { I18nProvider } from "../../src/modules/preferences/renderer/public";
import type { LocaleSnapshot } from "../../src/shared/i18n/locale";
import "../../src/app/renderer/styles/app.css";

const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 120));
const first = DraftSchema.parse({
  schemaVersion: 1,
  threadId: crypto.randomUUID(),
  workingDirectoryId: crypto.randomUUID(),
  directory: "/isolated/rendering",
  revision: 0,
  text: "A unsent draft",
});
const drafts = [
  first,
  DraftSchema.parse({
    ...first,
    threadId: crypto.randomUUID(),
    text: "B unsent draft",
  }),
  DraftSchema.parse({
    ...first,
    threadId: crypto.randomUUID(),
    text: "C unsent draft",
  }),
];
let selected = first;
let preferences: Preferences = {
  theme: "light",
  density: "normal",
  locale: "system",
};
let locale: LocaleSnapshot = { preference: "en-US", resolvedLocale: "en-US" };
let localeListener: ((value: LocaleSnapshot) => void) | undefined;

import type {
  AttentionBridge,
  AttentionSnapshot,
} from "../../src/app/contracts/attention";

let attentionSnapshot: AttentionSnapshot = {
  instanceId: crypto.randomUUID(),
  revision: 1,
  entries: [],
  preferences: { system: false, completion: false },
  system: "disabled",
  coverageGap: false,
  openRequest: null,
};
let receiveAttention: ((value: AttentionSnapshot) => void) | undefined;
const attentionCommands: string[] = [];
const attention: AttentionBridge = {
  subscribe: (listener) => {
    receiveAttention = listener;
    return () => {
      receiveAttention = undefined;
    };
  },
  request: async (command) => {
    attentionCommands.push(command.kind);
    if (command.kind !== "snapshot")
      attentionSnapshot = {
        ...attentionSnapshot,
        revision: attentionSnapshot.revision + 1,
        entries: attentionSnapshot.entries.map((entry) =>
          (command.kind === "visible" && entry.threadId === command.threadId) ||
          (command.kind === "seen" && entry.eventId === command.eventId)
            ? { ...entry, unread: false }
            : entry,
        ),
        openRequest:
          command.kind === "opened" ? null : attentionSnapshot.openRequest,
      };
    if (command.kind === "preferences")
      attentionSnapshot = {
        ...attentionSnapshot,
        preferences: command.value,
        system: command.value.system ? "unavailable" : "disabled",
      };
    return {
      kind: "snapshot",
      traceId: command.traceId,
      snapshot: attentionSnapshot,
    };
  },
};
const runtimeCommands: { kind: string; threadId: string }[] = [];
export const bridge: DesktopBridge = {
  ...(location.pathname.endsWith("/workbench.html") ||
  location.pathname.endsWith("/settings.html")
    ? { attention }
    : {}),
  request: async (command) => {
    if (command.kind === "preferences") {
      await pause();
      preferences = command.value;
      return parseDesktopReply(command, {
        kind: "preferences-saved",
        value: preferences,
      });
    }
    if (command.kind === "list-threads")
      return parseDesktopReply(command, {
        kind: "threads",
        threads: drafts.map(({ threadId, workingDirectoryId, directory }) => ({
          threadId,
          workingDirectoryId,
          directory,
        })),
      });
    if (command.kind === "select-thread") {
      await pause();
      const next = drafts.find((draft) => draft.threadId === command.threadId);
      if (!next) throw Error("Missing fixture Thread");
      selected = next;
    }
    if (command.kind === "new-thread") {
      await pause();
      selected = DraftSchema.parse({
        ...first,
        threadId: crypto.randomUUID(),
        text: "",
      });
      drafts.unshift(selected);
    }
    if (
      command.kind === "restore" ||
      command.kind === "select-thread" ||
      command.kind === "new-thread"
    )
      return parseDesktopReply(command, {
        kind: "ready",
        draft: selected,
        directoryAvailable: true,
        preferences,
      });
    if (command.kind === "save") {
      const draft = drafts.find((draft) => draft.threadId === command.threadId);
      if (!draft) throw Error("Missing draft");
      draft.text = command.text;
      draft.revision = command.expectedRevision + 1;
      return parseDesktopReply(command, {
        kind: "saved",
        threadId: draft.threadId,
        revision: draft.revision,
      });
    }
    throw Error("Unexpected fixture command");
  },
  locale: {
    snapshot: async () => locale,
    subscribe: (listener) => {
      localeListener = listener;
      return () => {
        localeListener = undefined;
      };
    },
    setPreference: async (preference) => {
      await pause();
      locale = {
        preference,
        resolvedLocale: preference === "system" ? "en-US" : preference,
      };
      localeListener?.(locale);
      return { ...locale, persisted: true };
    },
  },
  configuration: {
    subscribe: () => () => {},
    request: async (command) => {
      if (command.kind !== "snapshot")
        throw Error("Read-only configuration fixture");
      return {
        kind: "snapshot",
        scope: command.scope,
        traceId: command.traceId,
        source: { directory: "/isolated", profile: null, cwd: first.directory },
        coverage: "complete",
        issues: [],
        models: [],
        defaultModel: null,
        openaiAuthenticated: false,
        deepseekAuthenticated: false,
        catalogError: false,
      };
    },
  },
  runtime: {
    subscribe: () => () => {},
    request: async (command) => {
      runtimeCommands.push(command);
      return {
        kind: "view",
        view: RuntimeViewSchema.parse({
          threadId: command.threadId,
          traceId: command.traceId,
          revision: command.kind === "start" ? 1 : 0,
          phase:
            command.kind === "start"
              ? "ready"
              : drafts.some(
                    (d) => d.threadId === command.threadId && d.text !== "",
                  )
                ? "interrupted"
                : "allowed",
          trusted: true,
          busy: false,
          model: command.kind === "start" ? "fixture/model" : null,
          configuration: { code: "runtime.configDefault" },
          message: { code: "runtime.previousSessionReadOnly" },
        }),
      };
    },
  },
  conversation: {
    connect: (threadId, listener) => {
      listener({
        kind: "snapshot",
        seq: 0,
        connectionGeneration: crypto.randomUUID(),
        gap: false,
        items: Array.from(
          { length: location.pathname.endsWith("/workbench.html") ? 3 : 1 },
          (_, index) => ({
            id: index + 1,
            role: "assistant",
            state: "complete",
            label: { kind: "literal", text: "OMP fixture" },
            text:
              `# ${threadId}\n\n![inert fixture](https://example.invalid/asset.png)\n\n[link](https://example.invalid)\n\n\`\`\`ts\nconst value = 42;\n\`\`\`\n\n` +
              Array.from(
                { length: 60 },
                (_, i) =>
                  `Fixture paragraph ${i}: **reading content stays stable**.`,
              ).join("\n\n"),
          }),
        ),
      });
      return () => {};
    },
  },
  submission: {
    request: async () => ({ kind: "list", receipts: [] }),
    subscribe: () => () => {},
  },
  files: {
    request: async (command) => ({
      kind: "completed",
      operationId: command.operationId,
      traceId: command.traceId,
      reply: { kind: "unavailable", reason: "missing" },
    }),
    cancel: async (command) => ({ kind: "acknowledged", ...command }),
  },
  git: {
    request: async (command) => ({
      kind: "completed",
      operationId: command.operationId,
      traceId: command.traceId,
      reply: { kind: "unavailable", reason: "not-git" },
    }),
    cancel: async (command) => ({ kind: "acknowledged", ...command }),
  },
  history: {
    read: async () => ({ kind: "unavailable", reason: "missing" }),
    projectList: async () => ({
      kind: "catalog",
      sessions: [],
      partial: false,
    }),
    projectRead: async () => ({ kind: "unavailable", reason: "missing" }),
  },
  onCloseRequest: () => () => {},
  onCloseCancelled: () => () => {},
  completeClose: () => {},
};
export const model = new AppModel(bridge);
export function mountRenderingFixture(
  hosts?: import("../../src/app/renderer/shell/layout/hosts-context").WorkbenchHosts,
) {
  const root = document.getElementById("root");
  if (!root) throw Error("Missing root");
  const renderingRoot = createRoot(root);
  renderingRoot.render(
    <QueryProvider>
      <I18nProvider bridge={bridge.locale} initialSnapshot={locale}>
        <App model={model} {...(hosts ? { hosts } : {})} />
      </I18nProvider>
    </QueryProvider>,
  );
  void model.start();
  return renderingRoot;
}
const probe = {
  model,
  runtimeCommands,
  firstId: first.threadId,
  secondId: drafts[1]?.threadId,
  pause,
};
Object.assign(window, {
  probe,
  attentionProbe: {
    emit: (open = false) => {
      const snapshot = model.getSnapshot();
      if (
        snapshot.kind !== "ready" ||
        snapshot.threadSelection.kind !== "thread"
      )
        throw Error("No active Thread");
      const threadId = snapshot.threadSelection.thread.context.threadId;
      const entry = {
        threadId,
        eventId: crypto.randomUUID(),
        traceId: crypto.randomUUID(),
        kind: "needs-answer" as const,
        unread: true,
      };
      attentionSnapshot = {
        ...attentionSnapshot,
        revision: attentionSnapshot.revision + 1,
        entries: [entry],
        openRequest: open
          ? { id: crypto.randomUUID(), threadId, eventId: entry.eventId }
          : null,
      };
      receiveAttention?.(attentionSnapshot);
    },
    snapshot: () => attentionSnapshot,
    commands: () => attentionCommands,
  },
});

if (
  !location.pathname.endsWith("workbench.html") &&
  !location.pathname.endsWith("settings.html")
)
  mountRenderingFixture();
