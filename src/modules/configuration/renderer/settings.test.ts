// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { I18nProvider } from "../../preferences/renderer/public";
import type {
  ConfigurationBridge,
  ConfigurationEvent,
} from "../contracts/public";
import { ConfigurationSettings } from "./settings";

it("retains the native browser challenge while the later authorization-code prompt is displayed, then clears it on cancel", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const element = document.createElement("div");
  document.body.append(element);
  const root = createRoot(element);
  let receive: ((event: ConfigurationEvent) => void) | undefined;
  const jobId = crypto.randomUUID();
  const scope = { kind: "application" } as const;
  let traceId: string = crypto.randomUUID();
  const source = { directory: "/isolated", profile: null, cwd: "/probe" };
  const bridge: ConfigurationBridge = {
    subscribe(listener) {
      receive = listener;
      return () => {
        receive = undefined;
      };
    },
    request: vi.fn<ConfigurationBridge["request"]>(async (command) => {
      if (command.kind === "snapshot")
        return {
          kind: "snapshot",
          scope,
          traceId: command.traceId,
          source,
          coverage: "complete",
          issues: [],
          models: [],
          defaultModel: null,
          openaiAuthenticated: false,
          deepseekAuthenticated: false,
          catalogError: false,
        };
      if (command.kind === "login") {
        traceId = command.traceId;
        return { kind: "started", jobId, scope, traceId, source };
      }
      if (command.kind === "cancel")
        receive?.({
          kind: "finished",
          jobId,
          scope,
          traceId,
          source,
          result: "cancelled",
        });
      return { kind: "done", scope, traceId: command.traceId, source };
    }),
  };
  try {
    await act(async () =>
      root.render(
        createElement(
          QueryClientProvider,
          { client },
          createElement(I18nProvider, {
            initialSnapshot: { preference: "zh-CN", resolvedLocale: "zh-CN" },
            children: createElement(ConfigurationSettings, {
              bridge,
              scope,
            }),
          }),
        ),
      ),
    );
    await act(async () => {
      const details = element.querySelector("details");
      if (!details) throw Error("missing details");
      details.open = true;
      details.dispatchEvent(new Event("toggle"));
    });
    const button = (text: string) =>
      Array.from(element.querySelectorAll("button")).find(
        (b) => b.textContent?.trim() === text,
      );
    await act(async () => button("登录 OpenAI 账户")?.click());
    await act(async () => {
      receive?.({
        kind: "challenge",
        jobId,
        scope,
        traceId,
        source,
        url: "https://auth.openai.com/oauth/authorize",
        instructions: "native instructions",
      });
      receive?.({
        kind: "prompt",
        jobId,
        scope,
        traceId,
        source,
        message: "Paste authorization code",
        secret: false,
      });
    });
    expect(element.textContent).toContain("Paste authorization code");
    expect(button("在系统浏览器登录")).toBeDefined();
    await act(async () => button("取消登录")?.click());
    expect(element.textContent).toContain("已取消，可重新登录");
    expect(button("在系统浏览器登录")).toBeUndefined();
    expect(button("登录 OpenAI 账户")?.disabled).toBe(false);
  } finally {
    await act(async () => root.unmount());
    client.clear();
    element.remove();
  }
});
