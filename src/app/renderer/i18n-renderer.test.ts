import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./app";
import type { AppModel, ViewState } from "./model";
import { QueryProvider } from "./query-client";

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
// The Monaco adapter is not part of this locale check and must not load here:
// its editor bundle reaches into `window` at module scope.
vi.mock("./workbench/editor", () => ({ LazyFileEditor: () => null }));
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
  threadSelection: { kind: "empty" },
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
  const stateStore = {
    getState: () => state,
    getInitialState: () => state,
    subscribe: () => () => {},
  };
  const model = {
    stateStore,
  } as unknown as AppModel;
  // The file and Git panels read through TanStack Query, so this render needs
  // the same query client the renderer entry installs.
  return renderToStaticMarkup(
    createElement(QueryProvider, null, createElement(App, { model })),
  );
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
