// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import type { LocaleBridge } from "../contracts/public";
import { I18nProvider, useI18n, useLocalePreference } from "./i18n-provider";

it("keeps translation consumers untouched for same-language preference and persistence changes", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const translated = vi.fn();
  let control: ReturnType<typeof useLocalePreference> | undefined;
  const bridge: LocaleBridge = {
    snapshot: async () => ({ preference: "system", resolvedLocale: "en-US" }),
    subscribe: () => () => {},
    setPreference: async (preference) => ({
      preference,
      resolvedLocale: preference === "system" ? "en-US" : preference,
      persisted: false,
    }),
  };
  function Copy() {
    translated();
    const { t } = useI18n();
    return createElement("span", null, t("app.toolbar.newThread"));
  }
  function Settings() {
    control = useLocalePreference();
    return createElement("span", null, String(control.persistenceFailed));
  }
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        createElement(I18nProvider, {
          bridge,
          initialSnapshot: { preference: "system", resolvedLocale: "en-US" },
          children: [
            createElement(Copy, { key: "copy" }),
            createElement(Settings, { key: "settings" }),
          ],
        }),
      ),
    );
    const before = translated.mock.calls.length;
    await act(() => control?.setPreference("en-US"));
    expect(control?.persistenceFailed).toBe(true);
    expect(translated.mock.calls.length).toBe(before);
    await act(() => control?.setPreference("zh-CN"));
    expect(container.textContent).toContain("新会话");
    expect(translated.mock.calls.length).toBe(before + 1);
  } finally {
    await act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});
