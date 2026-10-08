// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { I18nProvider } from "../../preferences/renderer/public";
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
  await act(async () =>
    root.render(
      createElement(I18nProvider, {
        initialSnapshot: { preference: "en-US", resolvedLocale: "en-US" },
        children: createElement(ModelPickerPanel, {
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
    select,
    preference,
    manage,
    dispose: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}
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
