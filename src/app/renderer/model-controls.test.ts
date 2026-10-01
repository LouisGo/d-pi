// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import type {
  ConfigurationBridge,
  ConfigurationSnapshot,
} from "../../modules/configuration/contracts/public";
import {
  type RuntimeCommand,
  RuntimeViewSchema,
} from "../../modules/execution/contracts/public";
import { DraftSchema } from "../../modules/input/contracts/public";
import { I18nProvider } from "../../modules/preferences/renderer/public";
import type { DesktopBridge } from "../contracts/desktop-bridge";
import { failure } from "../contracts/failure";
import { ModelControls } from "./model-controls";
import { ThreadModel } from "./thread-model";

it("renders native effort metadata and sends default, off and minimal as distinct intentions", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const draft = DraftSchema.parse({
    schemaVersion: 1,
    threadId: crypto.randomUUID(),
    workingDirectoryId: crypto.randomUUID(),
    directory: "/fixture",
    revision: 0,
    text: "",
  });
  const commands: RuntimeCommand[] = [];
  const view = RuntimeViewSchema.parse({
    threadId: draft.threadId,
    traceId: crypto.randomUUID(),
    configuration: { code: "runtime.configDefault" },
    revision: 0,
    phase: "ready",
    trusted: true,
    busy: false,
    model: "fixture/minimal",
    thinkingLevel: "off",
    message: { code: "runtime.readyToSend" },
  });
  const desktop: DesktopBridge = {
    request: async () => {
      throw Error("unused");
    },
    onCloseRequest: () => () => {},
    onCloseCancelled: () => () => {},
    completeClose: () => {},
    runtime: {
      subscribe: () => () => {},
      request: async (command) => {
        commands.push(command);
        return { kind: "view", view };
      },
    },
  };
  const thread = new ThreadModel(
    draft,
    desktop,
    (traceId) =>
      failure(traceId, "transport-unavailable", "draft.transportUnknown").error,
  );
  const capabilities = (
    efforts: ConfigurationSnapshot["models"][number]["thinking"]["efforts"],
    requiresEffort = false,
  ) => ({
    efforts,
    adjustable: efforts.length > 0,
    requiresEffort,
    defaultEffort: null,
    defaultLevel: null,
  });
  const models: ConfigurationSnapshot["models"] = [
    {
      provider: "fixture",
      id: "deepseek",
      name: "DeepSeek",
      available: true,
      reason: null,
      reasoning: true,
      input: ["text"],
      thinking: capabilities(["low", "high", "max"]),
    },
    {
      provider: "fixture",
      id: "minimal",
      name: "Minimal",
      available: true,
      reason: null,
      reasoning: true,
      input: ["text"],
      thinking: capabilities(["minimal", "low"]),
    },
    {
      provider: "fixture",
      id: "fixed",
      name: "Fixed",
      available: true,
      reason: null,
      reasoning: true,
      input: ["text"],
      thinking: capabilities([]),
    },
    {
      provider: "fixture",
      id: "required",
      name: "Required",
      available: true,
      reason: null,
      reasoning: true,
      input: ["text"],
      thinking: capabilities(["low", "high"], true),
    },
    {
      provider: "fixture",
      id: "plain",
      name: "Plain",
      available: true,
      reason: null,
      reasoning: false,
      input: ["text"],
      thinking: capabilities([]),
    },
  ];
  const bridge: ConfigurationBridge = {
    subscribe: () => () => {},
    request: async (command) => {
      if (command.kind !== "snapshot") throw Error("unexpected");
      return {
        kind: "snapshot",
        scope: command.scope,
        traceId: command.traceId,
        source: { directory: "/native", profile: null, cwd: draft.directory },
        models,
        defaultModel: null,
        openaiAuthenticated: false,
        deepseekAuthenticated: false,
        catalogError: false,
        coverage: "complete",
        issues: [],
      };
    },
  };
  const client = new QueryClient();
  const element = document.createElement("div");
  document.body.append(element);
  const root = createRoot(element);
  try {
    await act(async () => {
      root.render(
        createElement(
          QueryClientProvider,
          { client },
          createElement(I18nProvider, {
            initialSnapshot: { preference: "zh-CN", resolvedLocale: "zh-CN" },
            children: createElement(ModelControls, { thread, bridge }),
          }),
        ),
      );
      await new Promise((resolve) => setTimeout(resolve, 40));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 40));
    });
    const selects = element.querySelectorAll("select");
    const model = selects[0],
      thinking = selects[1];
    if (!model || !thinking) throw Error("missing selectors");
    expect(model.value).toBe(JSON.stringify(["fixture", "minimal"]));
    expect(thinking.value).toBe("off");
    const choose = async (id: string) =>
      act(async () => {
        model.value = JSON.stringify(["fixture", id]);
        model.dispatchEvent(new Event("change", { bubbles: true }));
      });
    const options = () =>
      Array.from(thinking.options).map((option) => option.value);
    await choose("deepseek");
    expect(options()).toEqual(["default", "off", "low", "high", "max"]);
    await choose("required");
    expect(options()).toEqual(["default", "low", "high"]);
    await choose("fixed");
    expect(thinking.disabled).toBe(true);
    expect(options()).toEqual(["default"]);
    await choose("plain");
    expect(thinking.disabled).toBe(true);
    expect(options()).toEqual(["default"]);
    await choose("minimal");
    expect(options()).toEqual(["default", "off", "minimal", "low"]);
    const apply = () =>
      Array.from(element.querySelectorAll("button")).find(
        (button) => button.textContent?.trim() === "应用到当前会话",
      );
    const selectThinking = async (value: string) =>
      act(async () => {
        thinking.value = value;
        thinking.dispatchEvent(new Event("change", { bubbles: true }));
      });
    await act(async () => apply()?.click());
    await selectThinking("off");
    await act(async () => apply()?.click());
    await selectThinking("minimal");
    await act(async () => apply()?.click());
    expect(
      commands
        .filter((command) => command.kind === "select-model")
        .map((command) =>
          command.kind === "select-model" ? command.selection.thinking : null,
        ),
    ).toEqual([
      { kind: "default" },
      { kind: "off" },
      { kind: "effort", effort: "minimal" },
    ]);
    await act(async () => {
      client.setQueryData<ConfigurationSnapshot>(
        [
          "configuration",
          {
            kind: "thread",
            threadId: draft.threadId,
            workingDirectoryId: draft.workingDirectoryId,
          },
        ],
        (previous) =>
          previous
            ? {
                ...previous,
                models: previous.models.map((m) =>
                  m.id === "minimal"
                    ? { ...m, thinking: capabilities(["low"]) }
                    : m,
                ),
              }
            : previous,
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 40));
    });
    expect(options()).toEqual(["default", "off", "low"]);
    expect(apply()?.disabled).toBe(true);
    await selectThinking("default");
    expect(apply()?.disabled).toBe(false);
  } finally {
    await act(async () => root.unmount());
    thread.dispose();
    client.clear();
    element.remove();
  }
});
