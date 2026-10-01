import { afterEach, expect, it, vi } from "vitest";
import { createI18n } from "../../../shared/i18n/create-i18n";
import { buildApplicationMenu } from "./menu";

const electron = vi.hoisted(() => ({
  app: { isPackaged: false },
  buildFromTemplate: vi.fn((template) => template),
  setApplicationMenu: vi.fn(),
}));
vi.mock("electron", () => ({
  app: electron.app,
  Menu: electron,
}));
afterEach(() => {
  vi.unstubAllGlobals();
  electron.app.isPackaged = false;
});

it("offers a keyboard-accessible DevTools toggle in the development menu", () => {
  vi.stubGlobal("__D_PI_DEV__", true);
  buildApplicationMenu(createI18n("zh-CN").t);
  const template = electron.buildFromTemplate.mock.lastCall?.[0];
  expect(template).toContainEqual({
    label: "开发",
    submenu: [
      {
        role: "toggleDevTools",
        label: "切换开发者工具",
        accelerator: "Alt+CommandOrControl+I",
      },
    ],
  });
});

it.each([false, true])(
  "keeps DevTools out of a packaged application (dev flag %s)",
  (development) => {
    vi.stubGlobal("__D_PI_DEV__", development);
    electron.app.isPackaged = true;
    buildApplicationMenu(createI18n("en-US").t);
    expect(
      JSON.stringify(electron.buildFromTemplate.mock.lastCall?.[0]),
    ).not.toContain("toggleDevTools");
  },
);

it("keeps DevTools out of the production preview", () => {
  vi.stubGlobal("__D_PI_DEV__", false);
  buildApplicationMenu(createI18n("en-US").t);
  expect(
    JSON.stringify(electron.buildFromTemplate.mock.lastCall?.[0]),
  ).not.toContain("toggleDevTools");
});
