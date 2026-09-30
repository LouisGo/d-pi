import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

// The actual Main entry owns the window and IPC source checks. Replace only
// Electron's system boundary; storage remains real and isolated.
const desktop = vi.hoisted(() => ({
  directory: "",
  packaged: true,
  events: new Map<string, (event: unknown) => void>(),
  windowEvents: new Map<string, (event: unknown) => void>(),
  construct: vi.fn<(options: unknown) => void>(),
  loadURL: vi.fn<(url: string) => Promise<void>>(() => Promise.resolve()),
  loadFile: vi.fn<(path: string) => Promise<void>>(() => Promise.resolve()),
  quit: vi.fn(),
  contents: {
    mainFrame: {},
    send: vi.fn(),
    setWindowOpenHandler: vi.fn(),
    on: vi.fn(),
    session: { setPermissionRequestHandler: vi.fn() },
  },
}));

vi.mock("electron", () => ({
  app: {
    get isPackaged() {
      return desktop.packaged;
    },
    setPath: vi.fn(),
    setName: vi.fn(),
    requestSingleInstanceLock: () => true,
    whenReady: () => Promise.resolve(),
    getPath: () => desktop.directory,
    getLocale: () => "en-US",
    getPreferredSystemLanguages: () => ["en-US"],
    on: (name: string, listener: (event: unknown) => void) =>
      desktop.events.set(name, listener),
    quit: desktop.quit,
  },
  BrowserWindow: class {
    constructor(options: unknown) {
      desktop.construct(options);
    }
    webContents = desktop.contents;
    once = vi.fn();
    on = (name: string, listener: (event: unknown) => void) =>
      desktop.windowEvents.set(name, listener);
    loadURL = desktop.loadURL;
    loadFile = desktop.loadFile;
  },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  dialog: { showMessageBox: vi.fn(), showOpenDialog: vi.fn() },
  Menu: {
    buildFromTemplate: vi.fn((template) => template),
    setApplicationMenu: vi.fn(),
  },
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  desktop.events.clear();
  desktop.windowEvents.clear();
  desktop.packaged = true;
  desktop.loadURL.mockReset().mockResolvedValue(undefined);
  desktop.loadFile.mockReset().mockResolvedValue(undefined);
  desktop.directory = mkdtempSync(join(tmpdir(), "d-pi-window-security-"));
});

afterEach(async () => {
  desktop.events.get("will-quit")?.({ preventDefault: vi.fn() });
  await vi.waitFor(() => expect(desktop.quit).toHaveBeenCalled());
  vi.unstubAllEnvs();
  rmSync(desktop.directory, { recursive: true, force: true });
});

it("keeps the packaged privileged window local even when a development URL is inherited", async () => {
  vi.stubEnv("ELECTRON_RENDERER_URL", "https://external.example.test/");
  await import("../../src/app/main/index");
  await vi.waitFor(() => expect(desktop.construct).toHaveBeenCalled());
  expect(desktop.loadURL).not.toHaveBeenCalled();
  expect(desktop.loadFile).toHaveBeenCalledWith(
    expect.stringContaining("/renderer/index.html"),
  );
});

it("does not give an external development page the application preload", async () => {
  desktop.packaged = false;
  vi.stubEnv("ELECTRON_RENDERER_URL", "https://external.example.test/");
  await import("../../src/app/main/index");
  await vi.waitFor(() => expect(desktop.construct).toHaveBeenCalled());
  expect(desktop.loadURL).not.toHaveBeenCalled();
  expect(desktop.loadFile).toHaveBeenCalled();
});

it.each([
  "http://localhost.external.example.test/",
  "http://user:password@localhost:5173/",
  "data:text/html,<script>window.dPi.locale.snapshot()</script>",
  "file:///tmp/external.html",
  "not a URL",
])("keeps an untrusted development target local: %s", async (url) => {
  desktop.packaged = false;
  vi.stubEnv("ELECTRON_RENDERER_URL", url);
  await import("../../src/app/main/index");
  await vi.waitFor(() => expect(desktop.construct).toHaveBeenCalled());
  expect(desktop.loadURL).not.toHaveBeenCalled();
  expect(desktop.loadFile).toHaveBeenCalled();
});

it.each([
  "http://localhost:5173/",
  "http://127.0.0.1:5173/",
  "http://[::1]:5173/",
])("retains local development loading: %s", async (url) => {
  desktop.packaged = false;
  vi.stubEnv("ELECTRON_RENDERER_URL", url);
  await import("../../src/app/main/index");
  await vi.waitFor(() => expect(desktop.loadURL).toHaveBeenCalledWith(url));
  expect(desktop.loadFile).not.toHaveBeenCalled();
});

it("blocks an external HTTP redirect before loading the development page and falls back after cancellation", async () => {
  desktop.packaged = false;
  vi.stubEnv("ELECTRON_RENDERER_URL", "http://127.0.0.1:5173/");
  const redirect = {
    url: "https://external.example.test/",
    preventDefault: vi.fn(),
  };
  desktop.loadURL.mockImplementationOnce(async () => {
    const handle = desktop.contents.on.mock.calls.find(
      ([event]) => event === "will-redirect",
    )?.[1];
    handle?.(redirect);
    if (redirect.preventDefault.mock.calls.length) {
      throw Error("ERR_ABORTED: redirected navigation cancelled");
    }
  });
  await import("../../src/app/main/index");
  await vi.waitFor(() => expect(desktop.loadURL).toHaveBeenCalled());
  expect(redirect.preventDefault).toHaveBeenCalledOnce();
  await vi.waitFor(() =>
    expect(desktop.loadFile).toHaveBeenCalledWith(
      expect.stringContaining("/renderer/index.html"),
    ),
  );
});

it.each([
  "http://localhost.external.example.test/",
  "http://user:password@localhost:5173/",
  "data:text/html,<script>window.desktop.locale.snapshot()</script>",
  "file:///tmp/external.html",
  "not a URL",
])(
  "rejects an untrusted redirect with the development URL boundary: %s",
  async (url) => {
    desktop.packaged = false;
    vi.stubEnv("ELECTRON_RENDERER_URL", "http://127.0.0.1:5173/");
    const preventDefault = vi.fn();
    desktop.loadURL.mockImplementationOnce(async () => {
      const handle = desktop.contents.on.mock.calls.find(
        ([event]) => event === "will-redirect",
      )?.[1];
      handle?.({ url, preventDefault });
    });
    await import("../../src/app/main/index");
    await vi.waitFor(() => expect(desktop.loadURL).toHaveBeenCalled());
    expect(preventDefault).toHaveBeenCalledOnce();
  },
);

it.each([
  "http://localhost:5173/renderer/index.html",
  "https://127.0.0.1:5173/index.html",
  "http://[::1]:5173/index.html",
])("retains a local development redirect: %s", async (url) => {
  desktop.packaged = false;
  vi.stubEnv("ELECTRON_RENDERER_URL", "http://127.0.0.1:5173/");
  const preventDefault = vi.fn();
  desktop.loadURL.mockImplementationOnce(async () => {
    const handle = desktop.contents.on.mock.calls.find(
      ([event]) => event === "will-redirect",
    )?.[1];
    handle?.({ url, preventDefault });
  });
  await import("../../src/app/main/index");
  await vi.waitFor(() => expect(desktop.loadURL).toHaveBeenCalled());
  expect(preventDefault).not.toHaveBeenCalled();
  expect(desktop.loadFile).not.toHaveBeenCalled();
});

it("does not reload a closed window after a development navigation rejects", async () => {
  desktop.packaged = false;
  vi.stubEnv("ELECTRON_RENDERER_URL", "http://127.0.0.1:5173/");
  desktop.loadURL.mockImplementationOnce(async () => {
    desktop.windowEvents.get("closed")?.({});
    throw Error("window closed during loading");
  });
  await import("../../src/app/main/index");
  await vi.waitFor(() => expect(desktop.loadURL).toHaveBeenCalled());
  expect(desktop.loadFile).not.toHaveBeenCalled();
});

it("handles a failed built-in fallback after a development load rejects", async () => {
  desktop.packaged = false;
  vi.stubEnv("ELECTRON_RENDERER_URL", "http://127.0.0.1:5173/");
  desktop.loadURL.mockRejectedValueOnce(Error("ERR_ABORTED"));
  desktop.loadFile.mockRejectedValueOnce(Error("ERR_FILE_NOT_FOUND"));
  await import("../../src/app/main/index");
  await vi.waitFor(() => expect(desktop.loadFile).toHaveBeenCalledOnce());
});

it("retains sandboxed isolation and refuses page-created windows, navigation and webviews", async () => {
  vi.stubEnv("ELECTRON_RENDERER_URL", "");
  await import("../../src/app/main/index");
  await vi.waitFor(() => expect(desktop.construct).toHaveBeenCalled());
  expect(desktop.construct).toHaveBeenCalledWith(
    expect.objectContaining({
      webPreferences: expect.objectContaining({
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      }),
    }),
  );
  const denyWindow = desktop.contents.setWindowOpenHandler.mock.calls[0]?.[0];
  expect(denyWindow?.({ url: "https://external.example.test" })).toEqual({
    action: "deny",
  });
  for (const name of ["will-navigate", "will-attach-webview"]) {
    const preventDefault = vi.fn();
    const handle = desktop.contents.on.mock.calls.find(
      ([event]) => event === name,
    )?.[1];
    handle?.({ preventDefault });
    expect(preventDefault).toHaveBeenCalled();
  }
  const preventRedirect = vi.fn();
  desktop.contents.on.mock.calls.find(
    ([event]) => event === "will-redirect",
  )?.[1]({
    url: "http://127.0.0.1:5173/",
    preventDefault: preventRedirect,
  });
  expect(preventRedirect).toHaveBeenCalledOnce();
  const denyPermission =
    desktop.contents.session.setPermissionRequestHandler.mock.calls[0]?.[0];
  const reply = vi.fn();
  denyPermission?.({}, "geolocation", reply);
  expect(reply).toHaveBeenCalledWith(false);
});
