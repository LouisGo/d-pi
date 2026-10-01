import { afterEach, expect, it, vi } from "vitest";
import { prepareDevelopmentTools } from "./development-tools";

const electron = vi.hoisted(() => ({ app: { isPackaged: false } }));
const installer = vi.hoisted(() => ({
  installExtension: vi.fn(async () => ({ name: "React Developer Tools" })),
  REACT_DEVELOPER_TOOLS: { id: "fmkadmapgofadopljbjfkapdkoienihi" },
}));
vi.mock("electron", () => electron);
vi.mock("electron-devtools-installer", () => installer);
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  installer.installExtension.mockClear();
  electron.app.isPackaged = false;
});

it("loads React DevTools before development startup can continue", async () => {
  vi.stubGlobal("__D_PI_DEV__", true);
  let finish = () => {};
  installer.installExtension.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = () => resolve({ name: "React Developer Tools" });
      }),
  );
  let ready = false;
  const startup = prepareDevelopmentTools().then(() => {
    ready = true;
  });
  await vi.waitFor(() => expect(installer.installExtension).toHaveBeenCalled());
  expect(ready).toBe(false);
  finish();
  await startup;
  expect(ready).toBe(true);
});

it.each([false, true])(
  "does not install extensions in a packaged application (dev flag %s)",
  async (development) => {
    vi.stubGlobal("__D_PI_DEV__", development);
    electron.app.isPackaged = true;
    await prepareDevelopmentTools();
    expect(installer.installExtension).not.toHaveBeenCalled();
  },
);

it("does not install extensions in the production preview", async () => {
  vi.stubGlobal("__D_PI_DEV__", false);
  await prepareDevelopmentTools();
  expect(installer.installExtension).not.toHaveBeenCalled();
});

it("still permits startup when the extension download fails", async () => {
  vi.stubGlobal("__D_PI_DEV__", true);
  const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
  installer.installExtension.mockRejectedValueOnce(
    Error("network unavailable"),
  );
  await expect(prepareDevelopmentTools()).resolves.toBeUndefined();
  expect(warning).toHaveBeenCalled();
});
