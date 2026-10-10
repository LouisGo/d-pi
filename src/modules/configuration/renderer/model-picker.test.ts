// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { I18nProvider, useI18n } from "../../preferences/renderer/public";
import type { ConfigurationSnapshot } from "../contracts/public";
import { ModelPickerPanel } from "./model-picker";

const model = (
  provider: string,
  id: string,
  available = true,
): ConfigurationSnapshot["models"][number] => ({
  provider,
  id,
  name: id,
  available,
  reason: available ? null : "authentication-required",
  kind: "chat",
  reasoning: true,
  input: ["text", "image"],
  contextWindow: 128000,
  maxTokens: 32000,
  thinking: {
    efforts: ["low"],
    adjustable: true,
    requiresEffort: false,
    defaultEffort: null,
    defaultLevel: null,
  },
});
async function renderPanel(
  overrides: Partial<Parameters<typeof ModelPickerPanel>[0]> = {},
) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const select = vi.fn();
  const preference = vi.fn();
  const manage = vi.fn();
  const messages = { noResults: "", noFavorites: "" };
  function Panel(props: Parameters<typeof ModelPickerPanel>[0]) {
    const { t } = useI18n();
    messages.noResults = t("models.noResults");
    messages.noFavorites = t("models.noFavorites");
    return createElement(ModelPickerPanel, props);
  }
  await act(async () =>
    root.render(
      createElement(I18nProvider, {
        initialSnapshot: { preference: "en-US", resolvedLocale: "en-US" },
        children: createElement(Panel, {
          models: [
            model("openai-codex", "gpt-current"),
            model("anthropic", "claude-next"),
            model("deepseek", "deepseek-needs-key", false),
            { ...model("google", "image-model"), kind: "image" },
          ],
          currentKey: JSON.stringify(["openai-codex", "gpt-current"]),
          preferences: {
            favorites: [],
            hidden: [JSON.stringify(["openai-codex", "gpt-current"])],
            order: [],
          },
          onSelect: select,
          onPreference: preference,
          onManage: manage,
          ...overrides,
        }),
      }),
    ),
  );
  return {
    host,
    messages,
    select,
    preference,
    manage,
    dispose: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}
it("distinguishes catalog failure from an empty search and exposes an explicit retry", async () => {
  const retry = vi.fn();
  const ui = await renderPanel({ models: [], failed: true, onRetry: retry });
  try {
    expect(ui.host.querySelector('[role="alert"]')).not.toBeNull();
    expect(ui.host.textContent).not.toContain("No matching models");
    const button = Array.from(ui.host.querySelectorAll("button")).find(
      (b) => b.textContent === "Check again",
    );
    expect(button).toBeDefined();
    await act(() => button?.click());
    expect(retry).toHaveBeenCalledOnce();
  } finally {
    await ui.dispose();
  }
});
it("preserves the hidden current model, excludes non-chat models, and keeps unavailable entries truthful", async () => {
  const ui = await renderPanel();
  expect(ui.host.querySelector('[data-current="true"]')?.textContent).toContain(
    "gpt-current",
  );
  expect(ui.host.textContent).not.toContain("image-model");
  const locked = ui.host.querySelector<HTMLButtonElement>(
    '[data-model-id="deepseek-needs-key"]',
  );
  expect(locked).toBeNull();
  expect(ui.host.querySelector('[aria-label="deepseek"]')).toBeNull();
  expect(ui.host.querySelector('[data-model-id="claude-next"]')).toBeNull();
  await act(async () =>
    ui.host
      .querySelector<HTMLButtonElement>('[aria-label="Anthropic"]')
      ?.click(),
  );
  const next = ui.host.querySelector<HTMLButtonElement>(
    '[data-model-id="claude-next"]',
  );
  await act(async () => next?.click());
  expect(ui.select).toHaveBeenCalledWith(
    expect.objectContaining({ provider: "anthropic", id: "claude-next" }),
  );
  await ui.dispose();
});
it("searches native identities, sends favorite intent separately, and supports keyboard selection", async () => {
  const ui = await renderPanel();
  await act(async () =>
    ui.host
      .querySelector<HTMLButtonElement>('[aria-label="Anthropic"]')
      ?.click(),
  );
  const favorite = ui.host.querySelector<HTMLButtonElement>(
    '[aria-label="Favorite claude-next"]',
  );
  await act(async () => favorite?.click());
  expect(ui.preference).toHaveBeenCalledWith({
    kind: "favorite",
    key: JSON.stringify(["anthropic", "claude-next"]),
    value: true,
  });
  expect(ui.select).not.toHaveBeenCalled();
  const input = ui.host.querySelector<HTMLInputElement>("input");
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(input, "anthropic");
    input?.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(ui.host.querySelectorAll("[data-model-id]")).toHaveLength(1);
  await act(async () =>
    input?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
    ),
  );
  expect(document.activeElement?.getAttribute("data-model-id")).toBe(
    "claude-next",
  );
  await ui.dispose();
});
it("blocks model writes while busy but still opens connection settings", async () => {
  const ui = await renderPanel({ disabled: true });
  for (const button of ui.host.querySelectorAll<HTMLButtonElement>(
    "[data-model-id]",
  ))
    expect(button.disabled).toBe(true);
  const manage = [
    ...ui.host.querySelectorAll<HTMLButtonElement>("button"),
  ].find((b) => b.textContent?.includes("Manage providers"));
  await act(async () => manage?.click());
  expect(ui.manage).toHaveBeenCalledOnce();
  expect(ui.select).not.toHaveBeenCalled();
  await ui.dispose();
});
it("keeps native policy exclusions unselectable and preserves caret keys in search", async () => {
  const ui = await renderPanel({
    currentKey: JSON.stringify(["openai-codex", "excluded"]),
    models: [
      model("openai-codex", "eligible"),
      { ...model("openai-codex", "excluded"), sessionSelectable: false },
    ],
  });
  expect(
    ui.host.querySelector<HTMLButtonElement>('[data-model-id="excluded"]')
      ?.disabled,
  ).toBe(true);
  const input = ui.host.querySelector<HTMLInputElement>("input");
  input?.focus();
  const home = new KeyboardEvent("keydown", {
    key: "Home",
    bubbles: true,
    cancelable: true,
  });
  await act(async () => input?.dispatchEvent(home));
  expect(home.defaultPrevented).toBe(false);
  expect(document.activeElement).toBe(input);
  await ui.dispose();
});

it("searches displayed provider aliases and native names while selecting the native model", async () => {
  const google = model("google", "gemini-example");
  const ui = await renderPanel({
    models: [google, model("anthropic", "claude-example")],
    currentKey: null,
    providers: [
      {
        id: "google",
        name: "Google Gemini",
        storageProvider: "google",
        disabled: false,
        authState: "configured",
        authSource: null,
        loginMethods: [],
        accounts: [],
        modelCount: 1,
        baseUrl: null,
      },
    ],
  });
  try {
    for (const query of ["Google AI", "gOoGlE aI", "Google Gemini", "google"]) {
      await act(() => {
        const input = ui.host.querySelector("input");
        Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value",
        )?.set?.call(input, query);
        input?.dispatchEvent(new Event("input", { bubbles: true }));
      });
      const choices = [
        ...ui.host.querySelectorAll<HTMLButtonElement>("[data-model-id]"),
      ];
      expect(choices.map((el) => el.dataset.modelId)).toEqual([
        "gemini-example",
      ]);
      await act(() => choices[0]?.click());
      expect(ui.select).toHaveBeenLastCalledWith(google);
    }
  } finally {
    await ui.dispose();
  }
});

it("distinguishes an empty favorite collection from a favorite search with no matches", async () => {
  const key = JSON.stringify(["openai-codex", "gpt-current"]);
  const ui = await renderPanel({
    preferences: { favorites: [key], hidden: [], order: [] },
  });
  try {
    await act(() =>
      ui.host
        .querySelector<HTMLButtonElement>('[aria-label="Favorites"]')
        ?.click(),
    );
    const search = async (query: string) =>
      act(() => {
        const input = ui.host.querySelector("input");
        Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value",
        )?.set?.call(input, query);
        input?.dispatchEvent(new Event("input", { bubbles: true }));
      });
    expect(
      ui.host.querySelector('[data-model-id="gpt-current"]'),
    ).not.toBeNull();
    await search("zzzz");
    expect(ui.host.querySelector(".model-picker-empty")?.textContent).toBe(
      ui.messages.noResults,
    );
    await search("");
    expect(
      ui.host.querySelector('[data-model-id="gpt-current"]'),
    ).not.toBeNull();
  } finally {
    await ui.dispose();
  }
  const empty = await renderPanel();
  try {
    await act(() =>
      empty.host
        .querySelector<HTMLButtonElement>('[aria-label="Favorites"]')
        ?.click(),
    );
    expect(empty.host.querySelector(".model-picker-empty")?.textContent).toBe(
      empty.messages.noFavorites,
    );
  } finally {
    await empty.dispose();
  }
});
