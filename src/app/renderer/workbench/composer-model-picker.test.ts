// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import type {
  ConfigurationBridge,
  ConfigurationSnapshot,
} from "../../../modules/configuration/contracts/public";
import {
  type RuntimeCommand,
  type RuntimeView,
  RuntimeViewSchema,
} from "../../../modules/execution/contracts/public";
import { DraftSchema } from "../../../modules/input/contracts/public";
import { I18nProvider } from "../../../modules/preferences/renderer/public";
import {
  type DesktopBridge,
  parseDesktopReply,
} from "../../contracts/desktop-bridge";
import { ConversationVisibilityContext } from "../shell/layout/conversation-visibility";
import { AppModel } from "../wiring/model";
import { ComposerModelPicker } from "./composer-model-picker";

const settle = () => new Promise((resolve) => setTimeout(resolve, 40));
async function setup(
  accept: boolean | "reject" | "offline" = true,
  override: Partial<RuntimeView> = {},
) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const draft = DraftSchema.parse({
    schemaVersion: 1,
    threadId: crypto.randomUUID(),
    workingDirectoryId: crypto.randomUUID(),
    directory: "/fixture",
    revision: 0,
    text: "retained",
  });
  const base = RuntimeViewSchema.parse({
    threadId: draft.threadId,
    traceId: crypto.randomUUID(),
    configuration: { code: "runtime.configDefault" },
    revision: 0,
    phase: accept === "offline" ? "interrupted" : "ready",
    modelSelection: accept === "offline" ? "next-start" : "live",
    trusted: true,
    busy: false,
    model: "openai-codex/gpt-current",
    thinkingLevel: "medium",
    modelOperation: { traceId: crypto.randomUUID(), status: "acknowledged" },
    selectedModel: {
      provider: "openai-codex",
      modelId: "gpt-current",
      thinking: { kind: "default" },
    },
    message: { code: "runtime.readyToSend" },
    ...override,
  });
  const commands: RuntimeCommand[] = [];
  const configCommands: unknown[] = [];
  const config: ConfigurationBridge = {
    subscribe: () => () => {},
    request: async (command) => {
      configCommands.push(command);
      if (command.kind !== "snapshot") throw Error("Unexpected config write");
      const models: ConfigurationSnapshot["models"] = [
        "gpt-current",
        "gpt-next",
      ].map((id) => ({
        provider: "openai-codex",
        id,
        name: id,
        kind: "chat",
        available: true,
        sessionSelectable: true,
        reason: null,
        reasoning: true,
        input: ["text"],
        thinking: {
          adjustable: true,
          requiresEffort: false,
          efforts: ["medium", "minimal"],
          defaultEffort: "medium",
          defaultLevel: "medium",
        },
      }));
      return {
        kind: "snapshot",
        scope: command.scope,
        traceId: command.traceId,
        source: { cwd: "/fixture", directory: "/native", profile: null },
        models,
        defaultModel: null,
        openaiAuthenticated: true,
        deepseekAuthenticated: false,
        catalogError: false,
        coverage: "complete",
        issues: [],
      };
    },
  };
  const bridge: DesktopBridge = {
    configuration: config,
    request: async (command) => {
      if (command.kind === "restore")
        return parseDesktopReply(command, {
          kind: "ready",
          draft,
          directoryAvailable: true,
          preferences: { theme: "light", density: "normal", locale: "en-US" },
        });
      if (command.kind === "list-threads")
        return parseDesktopReply(command, { kind: "threads", threads: [] });
      if (command.kind === "preferences")
        return parseDesktopReply(command, {
          kind: "preferences-saved",
          value: command.value,
        });
      throw Error(`Unexpected ${command.kind}`);
    },
    runtime: {
      subscribe: () => () => {},
      request: async (command) => {
        commands.push(command);
        if (command.kind === "select-model" && accept === "reject")
          return {
            kind: "failed",
            error: {
              traceId: command.traceId,
              code: "active-thread",
              category: "unknown",
              message: { code: "runtime.controlFailed" },
            },
          };
        if (command.kind === "select-model")
          return {
            kind: "view",
            view: accept
              ? {
                  ...base,
                  traceId: command.traceId,
                  revision: base.revision + 1,
                  model:
                    accept === "offline"
                      ? base.model
                      : `${command.selection.provider}/${command.selection.modelId}`,
                  selectedModel: command.selection,
                  modelOperation: {
                    traceId: command.traceId,
                    status: "acknowledged",
                  },
                }
              : {
                  ...base,
                  traceId: command.traceId,
                  phase: "interrupted",
                  message: { code: "runtime.connectionUnknown" },
                },
          };
        return { kind: "view", view: base };
      },
    },
    onCloseRequest: () => () => {},
    onCloseCancelled: () => () => {},
    completeClose: () => {},
  };
  const model = new AppModel(bridge);
  await model.start();
  const state = model.getSnapshot();
  if (state.kind !== "ready" || state.threadSelection.kind !== "thread")
    throw Error("Missing fixture Thread");
  const thread = state.threadSelection.thread;
  const runtime = thread.runtime;
  if (!runtime) throw Error("Missing fixture Runtime");
  await runtime.act("inspect");
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const client = new QueryClient();
  const manage = vi.fn();
  await act(async () =>
    root.render(
      createElement(
        QueryClientProvider,
        { client },
        createElement(I18nProvider, {
          initialSnapshot: { preference: "en-US", resolvedLocale: "en-US" },
          children: createElement(
            ConversationVisibilityContext.Provider,
            {
              value: { visible: true, reveal: () => {}, openProviders: manage },
            },
            createElement(ComposerModelPicker, { thread, model, runtime }),
          ),
        }),
      ),
    ),
  );
  const trigger = host.querySelector<HTMLButtonElement>(
    '[aria-label="Switch model"]',
  );
  await act(async () => {
    trigger?.click();
    await settle();
  });
  await act(settle);
  return {
    host,
    commands,
    configCommands,
    manage,
    dispose: async () => {
      await act(async () => root.unmount());
      model.dispose();
      client.clear();
      host.remove();
    },
  };
}
it("switches via Runtime and renders confirmed native selection without writing shared defaults", async () => {
  const ui = await setup();
  const next = document.querySelector<HTMLButtonElement>(
    '[data-model-id="gpt-next"]',
  );
  expect(next).not.toBeNull();
  await act(async () => {
    next?.click();
    await settle();
  });
  expect(ui.commands.filter((c) => c.kind === "select-model")).toEqual([
    expect.objectContaining({
      selection: {
        provider: "openai-codex",
        modelId: "gpt-next",
        thinking: { kind: "default" },
      },
    }),
  ]);
  expect(
    ui.host.querySelector('[aria-label="Switch model"]')?.textContent,
  ).toContain("gpt-next");
  expect(
    ui.configCommands.every(
      (c) =>
        typeof c === "object" &&
        c !== null &&
        "kind" in c &&
        c.kind === "snapshot",
    ),
  ).toBe(true);
  await ui.dispose();
});
it("keeps native readback and an actionable failure when a switch cannot be confirmed", async () => {
  const ui = await setup(false);
  await act(async () => {
    document
      .querySelector<HTMLButtonElement>('[data-model-id="gpt-next"]')
      ?.click();
    await settle();
  });
  expect(
    ui.host.querySelector('[aria-label="Switch model"]')?.textContent,
  ).toContain("gpt-current");
  expect(document.querySelector('[role="alert"]')).not.toBeNull();
  expect(document.querySelector('[data-model-id="gpt-next"]')).not.toBeNull();
  await ui.dispose();
});
it("routes the panel to provider settings and keeps default distinct from effective medium", async () => {
  const ui = await setup();
  expect(
    ui.host.querySelector('[aria-label="Reasoning effort"]')?.textContent,
  ).toContain("Default");
  const button = [
    ...document.querySelectorAll<HTMLButtonElement>("button"),
  ].find((b) => b.textContent === "Manage providers");
  await act(async () => button?.click());
  expect(ui.manage).toHaveBeenCalledOnce();
  expect(ui.commands.filter((c) => c.kind === "select-model")).toHaveLength(0);
  await ui.dispose();
});

it("does not reuse an earlier success when reselecting the same model is rejected", async () => {
  const ui = await setup("reject");
  await act(async () => {
    document
      .querySelector<HTMLButtonElement>('[data-model-id="gpt-current"]')
      ?.click();
    await settle();
  });
  expect(document.querySelector('[role="alert"]')).not.toBeNull();
  expect(
    document.querySelector('[data-model-id="gpt-current"]'),
  ).not.toBeNull();
  await ui.dispose();
});

it.each(["interrupted", "failed"] as const)(
  "accepts an acknowledged offline replacement in %s while retaining the actual model",
  async (phase) => {
    const ui = await setup("offline", { phase });
    try {
      const starts = ui.commands.filter((c) => c.kind === "start").length;
      const next = document.querySelector<HTMLButtonElement>(
        '[data-model-id="gpt-next"]',
      );
      expect(next?.disabled).toBe(false);
      await act(async () => {
        next?.click();
        await settle();
      });
      expect(ui.commands.filter((c) => c.kind === "select-model")).toHaveLength(
        1,
      );
      expect(document.querySelector('[data-model-id="gpt-next"]')).toBeNull();
      expect(ui.host.textContent).toContain("gpt-next");
      expect(ui.host.textContent).toContain("Next connection");
      expect(ui.commands.filter((c) => c.kind === "start")).toHaveLength(
        starts,
      );
      expect(
        ui.configCommands.every(
          (c) => (c as { kind: string }).kind === "snapshot",
        ),
      ).toBe(true);
    } finally {
      await ui.dispose();
    }
  },
);

it.each([
  { phase: "interrupted", modelSelection: undefined },
  { phase: "interrupted", modelSelection: "blocked" },
  { phase: "starting", modelSelection: "next-start" },
  { phase: "interrupted", modelSelection: "next-start", busy: true },
] as const)("keeps unsafe recovery disabled: %j", async (override) => {
  const ui = await setup("offline", override);
  try {
    const next = document.querySelector<HTMLButtonElement>(
      '[data-model-id="gpt-next"]',
    );
    expect(next?.disabled).toBe(true);
    await act(async () => next?.click());
    expect(ui.commands.filter((c) => c.kind === "select-model")).toHaveLength(
      0,
    );
  } finally {
    await ui.dispose();
  }
});
