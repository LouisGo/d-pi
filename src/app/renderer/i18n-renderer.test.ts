import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./app";
import type { AppModel, ViewState } from "./model";

let locale: "zh-CN" | "en-US" = "zh-CN";

vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof import("react")>();
  return {
    ...react,
    useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => unknown) =>
      getSnapshot(),
  };
});

vi.mock("../../modules/preferences/renderer/public", async () => {
  const { createI18n } = await import("../../shared/i18n/create-i18n");
  return {
    useI18n: () => ({
      ...createI18n(locale),
      preference: locale,
      persistenceFailed: false,
      setPreference: () => Promise.resolve(),
    }),
  };
});

vi.mock("./workbench/composer", () => ({ Composer: () => null }));
vi.mock("./conversation", () => ({
  Conversation: () => null,
  History: () => null,
  Submissions: () => null,
}));
vi.mock("./runtime-panel", () => ({ RuntimePanel: () => null }));
vi.mock("@/components/icons/common", () => ({
  DarkThemeIcon: () => null,
  FolderIcon: () => null,
  LightThemeIcon: () => null,
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children }: { children: ReactNode }) =>
    createElement("button", null, children),
}));

const state: ViewState = {
  kind: "ready",
  draft: null,
  directoryAvailable: true,
  preferences: {
    theme: "light",
    density: "normal",
    sendKey: "enter-send",
    locale: "system",
  },
  busy: false,
  notice: null,
};

function renderApp() {
  const model = {
    subscribe: () => () => {},
    getSnapshot: () => state,
  } as unknown as AppModel;
  return renderToStaticMarkup(createElement(App, { model }));
}

describe("renderer locale", () => {
  beforeEach(() => {
    locale = "zh-CN";
  });

  it("updates visible app copy when the locale changes", () => {
    const chinese = renderApp();
    expect(chinese).toContain("在项目里，写下第一步");
    expect(chinese).toContain("选择项目并创建草稿");

    locale = "en-US";
    const english = renderApp();
    expect(english).toContain("Write your first step in a project");
    expect(english).toContain("Choose a project and create a draft");
    expect(english).not.toContain("在项目里，写下第一步");
  });
});
