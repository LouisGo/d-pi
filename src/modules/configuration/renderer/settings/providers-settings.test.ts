// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ModelPickerPreferenceChange } from "../../../preferences/contracts/public";
import { I18nProvider } from "../../../preferences/renderer/public";
import type {
  ConfigurationBridge,
  ConfigurationEvent,
  ConfigurationScope,
  ConfigurationSnapshot,
} from "../../contracts/public";
import { ConfigurationScopeSchema } from "../../contracts/public";
import { ConfigurationSettings } from "./settings";

const source = {
  directory: "/native-home",
  cwd: "/workspace",
  profile: "work",
};
const revision = "a".repeat(64);
const application = { kind: "application" } as const;
const thread = ConfigurationScopeSchema.parse({
  kind: "thread",
  threadId: "00000000-0000-4000-8000-000000000001",
  workingDirectoryId: "00000000-0000-4000-8000-000000000002",
});
const model = (id: string, provider = "openai") => ({
  provider,
  id,
  name: id,
  available: true,
  reason: null,
  kind: "chat",
  contextWindow: 128000,
  maxTokens: 16000,
  custom: false,
  reasoning: true,
  input: ["text", "image"],
  assignableRoles: ["default", "smol"],
  sessionSelectable: true,
  thinking: {
    efforts: [],
    adjustable: false,
    requiresEffort: false,
    defaultEffort: null,
    defaultLevel: null,
  },
});
function snapshot(
  scope: ConfigurationScope,
  traceId: string,
): ConfigurationSnapshot {
  return {
    kind: "snapshot",
    scope,
    traceId,
    source,
    coverage: "complete",
    issues: [],
    catalogError: false,
    revision,
    defaultModel: "openai/gpt-example",
    openaiAuthenticated: true,
    deepseekAuthenticated: false,
    providers: [
      {
        id: "openai",
        name: "OpenAI",
        storageProvider: "openai",
        disabled: false,
        authState: "configured",
        authSource: { kind: "oauth", concrete: true },
        loginMethods: [
          {
            id: "openai",
            name: "OpenAI account",
            kind: "oauth-code",
            available: true,
            probe: "none",
          },
        ],
        accounts: [
          { credentialId: 7, type: "oauth", email: "sample@example.test" },
        ],
        modelCount: 2,
        baseUrl: null,
      },
      {
        id: "anthropic",
        name: "Anthropic",
        storageProvider: "anthropic",
        disabled: false,
        authState: "required",
        authSource: null,
        loginMethods: [
          {
            id: "anthropic",
            name: "Claude API key",
            kind: "api-key",
            available: true,
            probe: "anthropic-messages",
          },
        ],
        accounts: [],
        modelCount: 0,
        baseUrl: null,
      },
    ],
    models: [
      model("gpt-example"),
      {
        ...model("custom-model"),
        custom: true,
        baseUrl: "https://example.test/v1",
        api: "openai-completions",
        cost: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0 },
      },
    ],
    modelRoles: [
      {
        role: "default",
        name: "Default",
        value: "openai/gpt-example",
        source: "global",
        globalValue: "openai/gpt-example",
        projectValue: null,
      },
      {
        role: "image",
        name: "Image",
        value: null,
        source: null,
        globalValue: null,
        projectValue: null,
      },
    ],
  };
}

let host: HTMLDivElement;
let root: Root;
let client: QueryClient;
let receive: ((event: ConfigurationEvent) => void) | undefined;
let currentSnapshot: (
  scope: ConfigurationScope,
  traceId: string,
) => ConfigurationSnapshot;
let bridge: ConfigurationBridge;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  currentSnapshot = snapshot;
  bridge = {
    subscribe(listener) {
      receive = listener;
      return () => {
        receive = undefined;
      };
    },
    request: vi.fn<ConfigurationBridge["request"]>(async (command) => {
      if (command.kind === "snapshot")
        return currentSnapshot(command.scope, command.traceId);
      return {
        kind: "done",
        scope: "scope" in command ? command.scope : application,
        traceId: command.traceId,
        source,
      };
    }),
  };
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
  vi.unstubAllGlobals();
});
async function render(
  props: Partial<Parameters<typeof ConfigurationSettings>[0]> = {},
) {
  await act(async () =>
    root.render(
      createElement(
        QueryClientProvider,
        { client },
        createElement(I18nProvider, {
          initialSnapshot: { preference: "en-US", resolvedLocale: "en-US" },
          children: createElement(ConfigurationSettings, {
            bridge,
            scope: application,
            presentation: "page",
            ...props,
          }),
        }),
      ),
    ),
  );
  await act(
    async () => new Promise<void>((resolve) => setTimeout(resolve, 25)),
  );
}
function button(name: string) {
  const found = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
    (el) =>
      el.getAttribute("aria-label") === name || el.textContent?.trim() === name,
  );
  if (!found) throw Error(`missing button ${name}`);
  return found;
}
async function input(selector: string, value: string) {
  const field = host.querySelector<HTMLInputElement>(selector);
  if (!field) throw Error(`missing input ${selector}`);
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set?.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

it("prioritizes connected enabled providers for the initial settings detail without dropping other native providers", async () => {
  currentSnapshot = (scope, traceId) => {
    const result = snapshot(scope, traceId);
    return { ...result, providers: [...(result.providers ?? [])].reverse() };
  };
  await render();
  expect(button("OpenAI").getAttribute("aria-pressed")).toBe("true");
  expect(button("Anthropic")).toBeDefined();
  const names = [...host.querySelectorAll(".providers-provider-button")].map(
    (el) => el.getAttribute("aria-label"),
  );
  expect(names).toEqual(["OpenAI", "Anthropic"]);
});

it("renders native provider brands and explicit status/source, enables with CAS and confirms exact account disconnect", async () => {
  await render();
  expect(button("OpenAI").getAttribute("aria-pressed")).toBe("true");
  expect(host.querySelector('svg[data-brand="openai"]')).not.toBeNull();
  expect(host.textContent).toContain("Connected");
  expect(host.textContent).toContain("/native-home");
  expect(host.textContent).toContain("sample@example.test");
  await act(async () =>
    host
      .querySelector<HTMLElement>('[role="switch"][aria-label="Enable OpenAI"]')
      ?.click(),
  );
  expect(bridge.request).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: "provider-enable",
      providerId: "openai",
      enabled: false,
      expectedRevision: revision,
      scope: application,
    }),
  );
  await act(async () => button("Disconnect account").click());
  expect(
    vi
      .mocked(bridge.request)
      .mock.calls.some(([command]) => command.kind === "logout"),
  ).toBe(false);
  await act(async () => button("Confirm disconnect").click());
  expect(bridge.request).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: "logout",
      credentialId: 7,
      providerId: "openai",
      expectedRevision: revision,
      scope: application,
    }),
  );
});

it("warns before a native generation probe, preserves the old job across provider/scope changes and reports continuation failure", async () => {
  const jobId = crypto.randomUUID();
  let authTrace = "";
  vi.mocked(bridge.request).mockImplementation(async (command) => {
    if (command.kind === "snapshot")
      return currentSnapshot(command.scope, command.traceId);
    if (command.kind === "login") {
      authTrace = command.traceId;
      return {
        kind: "started",
        jobId,
        scope: command.scope,
        traceId: command.traceId,
        source,
      };
    }
    if (command.kind === "answer") throw Error("transport down");
    return {
      kind: "done",
      scope: application,
      traceId: command.traceId,
      source,
    };
  });
  await render();
  await act(async () => button("Anthropic").click());
  expect(host.textContent).toContain("model validation request");
  expect(host.textContent).toContain("incur a charge");
  await act(async () => button("Claude API key").click());
  await act(async () =>
    receive?.({
      kind: "prompt",
      jobId,
      scope: application,
      traceId: authTrace,
      source,
      providerId: "anthropic",
      message: "Native prompt",
      secret: true,
      placeholder: "Native placeholder",
      allowEmpty: true,
    }),
  );
  await act(async () => button("OpenAI").click());
  await render({ scope: thread });
  expect(receive).toBeDefined();
  expect(
    host
      .querySelector('input[placeholder="Native placeholder"]')
      ?.getAttribute("type"),
  ).toBe("password");
  await act(async () =>
    host
      .querySelector("form[data-auth-prompt]")
      ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(bridge.request).toHaveBeenCalledWith(
    expect.objectContaining({ kind: "answer", jobId, value: "" }),
  );
  expect(host.querySelector('[role="alert"]')?.textContent).toContain(
    "connection",
  );
  expect(host.textContent).toContain("Native prompt");
});

it("keeps all models, including hidden and unpaged models, in device reorder and excludes ineligible role options", async () => {
  currentSnapshot = (scope, traceId) => ({
    ...snapshot(scope, traceId),
    models: Array.from({ length: 103 }, (_, i) => model(`model-${i}`)),
  });
  const changed = vi.fn<(change: ModelPickerPreferenceChange) => Promise<void>>(
    async () => {},
  );
  const key = (id: string) => JSON.stringify(["openai", id]);
  await render({
    modelPicker: {
      favorites: [],
      hidden: [key("model-1")],
      order: [JSON.stringify(["anthropic", "other"])],
    },
    onModelPreference: changed,
  });
  expect(host.querySelectorAll("[data-settings-model]")).toHaveLength(100);
  await act(async () => button("Move model-0 down").click());
  const change = changed.mock.calls[0]?.[0];
  expect(change).toEqual({
    kind: "order",
    keys: [
      JSON.stringify(["anthropic", "other"]),
      key("model-1"),
      key("model-0"),
      ...Array.from({ length: 101 }, (_, i) => key(`model-${i + 2}`)),
    ],
  });
  await act(async () => button("Show more models").click());
  expect(host.querySelectorAll("[data-settings-model]")).toHaveLength(103);
  await act(async () => button("Image").click());
  expect(document.querySelectorAll('[role="option"]')).toHaveLength(1);
  expect(document.querySelector('[role="option"]')?.textContent).toBe(
    "Inherit default",
  );
});

it("writes an eligible role only to the explicit target and clears project override with null", async () => {
  currentSnapshot = (scope, traceId) => {
    const value = snapshot(scope, traceId);
    if (value.modelRoles?.[0])
      value.modelRoles[0].projectValue = "openai/gpt-example";
    return value;
  };
  await render({ scope: thread });
  await act(async () => button("Default").click());
  await act(async () =>
    document
      .querySelector<HTMLElement>('[role="option"][data-value=""]')
      ?.click(),
  );
  expect(bridge.request).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: "set-model-role",
      role: "default",
      target: "project",
      selector: null,
      expectedRevision: revision,
      scope: thread,
    }),
  );
});

it("edits only custom models and preserves source metadata in a CAS save, then confirms delete", async () => {
  await render();
  expect(
    host.querySelector('button[aria-label="Edit gpt-example"]'),
  ).toBeNull();
  await act(async () => button("Edit custom-model").click());
  await input('input[name="model-name"]', "Renamed model");
  await act(async () => button("Save model").click());
  expect(bridge.request).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: "upsert-custom-model",
      expectedRevision: revision,
      model: expect.objectContaining({
        provider: "openai",
        id: "custom-model",
        name: "Renamed model",
        contextWindow: 128000,
        maxTokens: 16000,
        api: "openai-completions",
      }),
    }),
  );
  await act(async () => button("Delete custom-model").click());
  expect(
    vi
      .mocked(bridge.request)
      .mock.calls.some(([command]) => command.kind === "delete-custom-model"),
  ).toBe(false);
  await act(async () => button("Confirm delete").click());
  expect(bridge.request).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: "delete-custom-model",
      providerId: "openai",
      modelId: "custom-model",
      expectedRevision: revision,
    }),
  );
});

it("clears unsubmitted keys, model editors, and disconnect targets on provider or scope changes", async () => {
  currentSnapshot = (scope, traceId) => {
    const value = snapshot(scope, traceId);
    if (value.providers?.[0]) {
      value.providers[0].apiKeyEditable = true;
      value.providers[0].keyValidation = "none";
    }
    return value;
  };
  await render();
  await input(".providers-key-form input", "private-unsubmitted-key");
  await act(async () => button("Anthropic").click());
  await act(async () => button("OpenAI").click());
  expect(
    host.querySelector<HTMLInputElement>(".providers-key-form input")?.value,
  ).toBe("");
  await act(async () => button("Edit custom-model").click());
  await act(async () => button("Disconnect account").click());
  expect(button("Confirm disconnect")).toBeDefined();
  await render({ scope: thread });
  expect(host.querySelector(".providers-custom-form")).toBeNull();
  expect(
    [...host.querySelectorAll("button")].some(
      (el) => el.textContent === "Confirm disconnect",
    ),
  ).toBe(false);
  expect(
    vi
      .mocked(bridge.request)
      .mock.calls.every(([command]) => command.kind === "snapshot"),
  ).toBe(true);
});

it("shows external credentials and unvalidated key behavior, retains failed input, and does not retry conflicting writes", async () => {
  currentSnapshot = (scope, traceId) => {
    const value = snapshot(scope, traceId);
    if (value.providers?.[0]) {
      value.providers[0].apiKeyEditable = true;
      value.providers[0].keyValidation = "none";
      value.providers[0].authSource = {
        kind: "env",
        concrete: true,
        envVar: "OPENAI_API_KEY",
      };
    }
    return value;
  };
  vi.mocked(bridge.request).mockImplementation(async (command) => {
    if (command.kind === "snapshot")
      return currentSnapshot(command.scope, command.traceId);
    return {
      kind: "failed",
      scope: "scope" in command ? command.scope : application,
      traceId: command.traceId,
      source,
      code:
        command.kind === "save-key"
          ? "authentication-rejected"
          : "configuration-conflict",
    };
  });
  await render();
  expect(host.textContent).toContain("OPENAI_API_KEY");
  expect(host.textContent).toContain("without an online validation request");
  await input(".providers-key-form input", "retry-this-key");
  await act(async () =>
    host
      .querySelector(".providers-key-form")
      ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(
    host.querySelector<HTMLInputElement>(".providers-key-form input")?.value,
  ).toBe("retry-this-key");
  await act(async () =>
    host
      .querySelector<HTMLElement>('[role="switch"][aria-label="Enable OpenAI"]')
      ?.click(),
  );
  expect(host.textContent).toContain("changed elsewhere");
  expect(
    vi
      .mocked(bridge.request)
      .mock.calls.filter(([command]) => command.kind === "provider-enable"),
  ).toHaveLength(1);
  expect(
    host
      .querySelector('[role="switch"][aria-label="Enable OpenAI"]')
      ?.getAttribute("aria-checked"),
  ).toBe("true");
});

it("keeps the edit revision fixed when a refreshed snapshot changes the native model", async () => {
  await render();
  await act(async () => button("Edit custom-model").click());
  await input('input[name="model-name"]', "Unsaved local name");
  currentSnapshot = (scope, traceId) => ({
    ...snapshot(scope, traceId),
    revision: "b".repeat(64),
    models: snapshot(scope, traceId).models.map((entry) =>
      entry.id === "custom-model"
        ? { ...entry, baseUrl: "https://changed.example.test/v1" }
        : entry,
    ),
  });
  await act(async () => client.invalidateQueries());
  await act(
    async () => new Promise<void>((resolve) => setTimeout(resolve, 25)),
  );
  expect(
    client.getQueryData<ConfigurationSnapshot>(["configuration", application])
      ?.revision,
  ).toBe("b".repeat(64));
  await act(async () => button("Save model").click());
  expect(bridge.request).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: "upsert-custom-model",
      expectedRevision: revision,
      model: expect.objectContaining({ name: "Unsaved local name" }),
    }),
  );
});

it("keeps destructive confirmations tied to the native revision that was confirmed", async () => {
  await render();
  await act(async () => button("Delete custom-model").click());
  await act(async () => button("Disconnect account").click());
  currentSnapshot = (scope, traceId) => ({
    ...snapshot(scope, traceId),
    revision: "b".repeat(64),
  });
  await act(async () => client.invalidateQueries());
  await act(
    async () => new Promise<void>((resolve) => setTimeout(resolve, 25)),
  );
  await act(async () => button("Confirm disconnect").click());
  await act(async () => button("Confirm delete").click());
  for (const kind of ["logout", "delete-custom-model"]) {
    expect(bridge.request).toHaveBeenCalledWith(
      expect.objectContaining({ kind, expectedRevision: revision }),
    );
  }
});
