import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, it, vi } from "vitest";
import { type Command, ReplySchema } from "../contracts/desktop-bridge";
import { AppStorage } from "./wiring/app-storage";

// Exercise the production IPC handler with real SQLite; only Electron's shell
// is replaced so this test never opens a window or touches user data.
const shell = vi.hoisted(() => ({
  directory: "",
  windowOptions: {} as Record<string, unknown>,
  handlers: new Map<string, (event: unknown, raw: unknown) => unknown>(),
  listeners: new Map<string, (event: unknown, raw: unknown) => void>(),
  windowEvents: new Map<string, (event: unknown) => void>(),
  close: vi.fn(),
  events: new Map<string, (event: unknown) => void>(),
  contents: {
    mainFrame: {},
    send: vi.fn<(channel: string, ...args: unknown[]) => void>(),
    setWindowOpenHandler: vi.fn(),
    on: vi.fn(),
    session: {
      setPermissionRequestHandler: vi.fn(),
      setPermissionCheckHandler: vi.fn(),
    },
  },
  quit: vi.fn(),
  systemLocale: "en-US",
  preferredSystemLanguages: ["en-US"],
}));
vi.mock("electron", () => ({
  app: {
    setPath: vi.fn(),
    setName: vi.fn(),
    requestSingleInstanceLock: () => true,
    whenReady: () => Promise.resolve(),
    getPath: () => shell.directory,
    getLocale: () => shell.systemLocale,
    getPreferredSystemLanguages: () => shell.preferredSystemLanguages,
    on: (name: string, listener: (event: unknown) => void) =>
      shell.events.set(name, listener),
    quit: shell.quit,
  },
  BrowserWindow: class {
    constructor(options: Record<string, unknown>) {
      shell.windowOptions = options;
    }
    webContents = shell.contents;
    once = vi.fn();
    on = (name: string, listener: (event: unknown) => void) =>
      shell.windowEvents.set(name, listener);
    close = shell.close;
    loadURL = vi.fn();
    loadFile = vi.fn();
  },
  ipcMain: {
    handle: (
      name: string,
      listener: (event: unknown, raw: unknown) => unknown,
    ) => shell.handlers.set(name, listener),
    on: (name: string, listener: (event: unknown, raw: unknown) => void) =>
      shell.listeners.set(name, listener),
  },
  dialog: { showMessageBox: vi.fn(), showOpenDialog: vi.fn() },
  Menu: {
    buildFromTemplate: vi.fn((template) => template),
    setApplicationMenu: vi.fn(),
  },
}));

it("uses the first preferred system language rather than the Chromium app locale", async () => {
  vi.resetModules();
  shell.handlers.clear();
  shell.events.clear();
  shell.quit.mockClear();
  shell.directory = mkdtempSync(join(tmpdir(), "d-pi-system-language-"));
  shell.systemLocale = "en-US";
  shell.preferredSystemLanguages = ["zh-Hans-CN", "en-US"];
  const { Menu } = await import("electron");
  vi.mocked(Menu.buildFromTemplate).mockClear();
  try {
    await import("./index");
    if (process.platform === "darwin")
      expect(shell.windowOptions.titleBarStyle).toBe("hiddenInset");
    const snapshot = shell.handlers.get("locale:snapshot");
    const set = shell.handlers.get("locale:set-preference");
    if (!snapshot || !set) throw Error("Missing locale IPC handlers");
    const event = {
      sender: shell.contents,
      senderFrame: shell.contents.mainFrame,
    };
    expect(await snapshot(event, undefined)).toEqual({
      preference: "system",
      resolvedLocale: "zh-CN",
    });
    expect(
      JSON.stringify(vi.mocked(Menu.buildFromTemplate).mock.lastCall?.[0]),
    ).toContain("编辑");
    expect(await set(event, "en-US")).toMatchObject({
      preference: "en-US",
      resolvedLocale: "en-US",
    });
  } finally {
    shell.preferredSystemLanguages = ["en-US"];
    shell.events.get("will-quit")?.({ preventDefault: vi.fn() });
    await vi.waitFor(() => expect(shell.quit).toHaveBeenCalled());
    rmSync(shell.directory, { recursive: true, force: true });
  }
});

it("starts with system locale, rebuilds the native menu on interaction, and keeps a failed locale save visible", async () => {
  vi.resetModules();
  shell.handlers.clear();
  shell.events.clear();
  shell.listeners.clear();
  shell.windowEvents.clear();
  shell.contents.send.mockClear();
  shell.directory = mkdtempSync(join(tmpdir(), "d-pi-locale-"));
  shell.systemLocale = "en-US";
  const { Menu, dialog } = await import("electron");
  vi.mocked(Menu.buildFromTemplate).mockClear();
  vi.mocked(dialog.showMessageBox).mockClear();
  try {
    await import("./index");
    const snapshot = shell.handlers.get("locale:snapshot");
    const set = shell.handlers.get("locale:set-preference");
    if (!snapshot || !set) throw Error("Missing locale IPC handlers");
    const event = {
      sender: shell.contents,
      senderFrame: shell.contents.mainFrame,
    };
    expect(await snapshot(event, undefined)).toEqual({
      preference: "system",
      resolvedLocale: "en-US",
    });
    expect(
      JSON.stringify(vi.mocked(Menu.buildFromTemplate).mock.lastCall?.[0]),
    ).toContain("Edit");
    expect(await set(event, "zh-CN")).toEqual({
      preference: "zh-CN",
      resolvedLocale: "zh-CN",
      persisted: true,
    });
    expect(
      JSON.stringify(vi.mocked(Menu.buildFromTemplate).mock.lastCall?.[0]),
    ).toContain("编辑");
    expect(shell.contents.send).toHaveBeenCalledWith("locale:changed", {
      preference: "zh-CN",
      resolvedLocale: "zh-CN",
    });
    const db = new DatabaseSync(join(shell.directory, "drafts.sqlite"));
    expect(
      db.prepare("SELECT locale FROM desktop WHERE id=1").get()?.locale,
    ).toBe("zh-CN");
    db.exec("BEGIN IMMEDIATE");
    expect(await set(event, "en-US")).toEqual({
      preference: "en-US",
      resolvedLocale: "en-US",
      persisted: false,
    });
    expect(await snapshot(event, undefined)).toEqual({
      preference: "en-US",
      resolvedLocale: "en-US",
    });
    expect(
      JSON.stringify(vi.mocked(Menu.buildFromTemplate).mock.lastCall?.[0]),
    ).toContain("Edit");
    db.exec("ROLLBACK");
    db.close();
    const close = shell.windowEvents.get("close");
    const closeResult = shell.listeners.get("draft:close-result");
    if (!close || !closeResult) throw Error("Missing close protocol");
    close({ preventDefault: vi.fn() });
    const closeToken = shell.contents.send.mock.calls.findLast(
      ([channel]) => channel === "draft:close-request",
    )?.[1];
    closeResult(event, { token: closeToken, saved: false });
    expect(
      JSON.stringify(vi.mocked(dialog.showMessageBox).mock.lastCall),
    ).toContain("The draft has not been saved; the window remains open");
    await expect(
      set({ sender: {}, senderFrame: {} }, "zh-CN"),
    ).rejects.toThrow();
  } finally {
    shell.events.get("will-quit")?.({ preventDefault: vi.fn() });
    await vi.waitFor(() => expect(shell.quit).toHaveBeenCalled());
    const events = readFileSync(
      join(shell.directory, "logs/main.jsonl"),
      "utf8",
    )
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(events).toContainEqual(
      expect.objectContaining({
        operation: "locale:set-preference",
        stage: "failed",
        code: "locale-save-failed",
      }),
    );
    rmSync(shell.directory, { recursive: true, force: true });
  }
});

it("restores the saved language before building the native menu", async () => {
  vi.resetModules();
  shell.handlers.clear();
  shell.events.clear();
  shell.quit.mockClear();
  shell.directory = mkdtempSync(join(tmpdir(), "d-pi-locale-restart-"));
  shell.systemLocale = "en-US";
  const path = join(shell.directory, "drafts.sqlite");
  const prior = AppStorage.open(path);
  prior.preferences.saveLocale("zh-CN");
  prior.close();
  const { Menu } = await import("electron");
  vi.mocked(Menu.buildFromTemplate).mockClear();
  try {
    await import("./index");
    const snapshot = shell.handlers.get("locale:snapshot");
    if (!snapshot) throw Error("Missing locale snapshot handler");
    expect(
      await snapshot(
        { sender: shell.contents, senderFrame: shell.contents.mainFrame },
        undefined,
      ),
    ).toEqual({ preference: "zh-CN", resolvedLocale: "zh-CN" });
    expect(
      JSON.stringify(vi.mocked(Menu.buildFromTemplate).mock.lastCall?.[0]),
    ).toContain("编辑");
  } finally {
    shell.events.get("will-quit")?.({ preventDefault: vi.fn() });
    await vi.waitFor(() => expect(shell.quit).toHaveBeenCalled());
    rmSync(shell.directory, { recursive: true, force: true });
  }
});

it("retries a failed initial restore after the lock clears, preserving the same draft", async () => {
  vi.resetModules();
  shell.handlers.clear();
  shell.events.clear();
  shell.quit.mockClear();
  shell.directory = mkdtempSync(join(tmpdir(), "d-pi-startup-"));
  const path = join(shell.directory, "drafts.sqlite");
  const original = AppStorage.open(path);
  const draft = original.drafts.create(shell.directory);
  original.drafts.save(draft.threadId, 0, "keep this\n\n原文");
  original.close();
  const locker = new DatabaseSync(path);
  locker.exec("PRAGMA journal_mode=DELETE; BEGIN EXCLUSIVE");
  let locked = true;
  try {
    await import("./index");
    const handler = shell.handlers.get("draft:request");
    if (!handler) throw new Error("Missing draft IPC handler");
    const request = async (command: Command) =>
      ReplySchema.parse(
        await handler(
          { sender: shell.contents, senderFrame: shell.contents.mainFrame },
          {
            schemaVersion: 1,
            connectionId: crypto.randomUUID(),
            requestId: crypto.randomUUID(),
            command,
          },
        ),
      );
    const restore = () =>
      request({ kind: "restore", traceId: crypto.randomUUID() });
    expect(await restore()).toMatchObject({
      kind: "failed",
      error: { code: "storage-unavailable" },
    });
    locker.exec("ROLLBACK");
    locked = false;
    // A save is not permission to reopen storage or replay an uncertain write.
    expect(
      await request({
        kind: "save",
        traceId: crypto.randomUUID(),
        threadId: draft.threadId,
        expectedRevision: 1,
        text: "must not be written",
      }),
    ).toMatchObject({ kind: "failed" });
    const ready = {
      kind: "ready",
      draft: { ...draft, revision: 1, text: "keep this\n\n原文" },
    };
    expect(await restore()).toMatchObject(ready);
    expect(await restore()).toMatchObject(ready);
    const oversizedTrace = crypto.randomUUID();
    expect(
      await request({
        kind: "save",
        traceId: oversizedTrace,
        threadId: draft.threadId,
        expectedRevision: 1,
        text: "中".repeat(1_500_000),
      }),
    ).toMatchObject({
      kind: "failed",
      error: {
        traceId: oversizedTrace,
        code: "content-too-large",
        recovery: "user_action",
      },
    });
    expect(await restore()).toMatchObject(ready);
  } finally {
    if (locked) locker.exec("ROLLBACK");
    locker.close();
    shell.events.get("will-quit")?.({ preventDefault: vi.fn() });
    await vi.waitFor(() => expect(shell.quit).toHaveBeenCalled());
    rmSync(shell.directory, { recursive: true, force: true });
  }
});

it("a timed-out close receipt cannot close a later attempt, and failed saves retain the window", async () => {
  vi.resetModules();
  shell.handlers.clear();
  shell.events.clear();
  shell.windowEvents.clear();
  shell.listeners.clear();
  shell.contents.send.mockClear();
  shell.close.mockClear();
  shell.quit.mockClear();
  shell.directory = mkdtempSync(join(tmpdir(), "d-pi-close-"));
  vi.useFakeTimers();
  try {
    await import("./index");
    const result = shell.listeners.get("draft:close-result");
    const close = shell.windowEvents.get("close");
    if (!result || !close) throw new Error("Missing close protocol");
    const event = {
      sender: shell.contents,
      senderFrame: shell.contents.mainFrame,
    };
    const requestClose = () => {
      const preventDefault = vi.fn();
      close({ preventDefault });
      expect(preventDefault).toHaveBeenCalled();
      const message = shell.contents.send.mock.calls.findLast(
        ([channel]) => channel === "draft:close-request",
      );
      const token = message?.[1];
      if (typeof token !== "string") throw new Error("Missing close token");
      return token;
    };
    const expired = requestClose();
    await vi.advanceTimersByTimeAsync(5000);
    expect(shell.contents.send).toHaveBeenCalledWith("draft:close-cancelled");
    expect(shell.close).not.toHaveBeenCalled();
    const current = requestClose();
    expect(current).not.toBe(expired);
    result(event, { token: expired, saved: true });
    expect(shell.close).not.toHaveBeenCalled();
    result(event, { token: current, saved: false });
    expect(shell.close).not.toHaveBeenCalled();
    const final = requestClose();
    result(event, { token: final, saved: true });
    expect(shell.close).toHaveBeenCalledTimes(1);
    expect(shell.quit).not.toHaveBeenCalled();
  } finally {
    shell.events.get("will-quit")?.({ preventDefault: vi.fn() });
    await vi.runAllTimersAsync();
    vi.useRealTimers();
    rmSync(shell.directory, { recursive: true, force: true });
  }
});

it("accepts only bounded bridge diagnostics from the active frame", async () => {
  vi.resetModules();
  shell.listeners.clear();
  shell.events.clear();
  shell.quit.mockClear();
  shell.directory = mkdtempSync(join(tmpdir(), "d-pi-bridge-logs-"));
  try {
    await import("./index");
    const receive = shell.listeners.get("draft:diagnostic");
    expect(receive).toBeTypeOf("function");
    const event = {
      sender: shell.contents,
      senderFrame: shell.contents.mainFrame,
    };
    const record = {
      traceId: crypto.randomUUID(),
      requestId: crypto.randomUUID(),
      connectionId: crypto.randomUUID(),
      operation: "save",
      stage: "acknowledgement-failed",
      code: "invalid-reply",
    };
    receive?.(event, { ...record, text: "PRIVATE BODY" });
    receive?.({ ...event, senderFrame: {} }, record);
    receive?.(event, record);
    shell.events.get("will-quit")?.({ preventDefault: vi.fn() });
    await vi.waitFor(() => expect(shell.quit).toHaveBeenCalled());
    const lines = readFileSync(join(shell.directory, "logs/main.jsonl"), "utf8")
      .trim()
      .split("\n");
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? "")).toMatchObject({
      ...record,
      observedAt: "preload",
    });
    expect(lines.join()).not.toContain("PRIVATE BODY");
  } finally {
    shell.events.get("will-quit")?.({ preventDefault: vi.fn() });
    rmSync(shell.directory, { recursive: true, force: true });
  }
});

it("runtime inspection is read-only, rejects foreign frames, and explicit allowance persists without starting OMP", async () => {
  vi.resetModules();
  shell.handlers.clear();
  shell.events.clear();
  shell.quit.mockClear();
  shell.directory = mkdtempSync(join(tmpdir(), "d-pi-runtime-ipc-"));
  const storage = AppStorage.open(join(shell.directory, "drafts.sqlite"));
  const draft = storage.drafts.create(realpathSync(shell.directory));
  storage.close();
  try {
    await import("./index");
    const handler = shell.handlers.get("runtime:request");
    expect(handler).toBeDefined();
    if (!handler) return;
    const event = {
      sender: shell.contents,
      senderFrame: shell.contents.mainFrame,
    };
    const request = {
      kind: "inspect",
      threadId: draft.threadId,
      traceId: crypto.randomUUID(),
    };
    await expect(
      handler({ sender: {}, senderFrame: {} }, request),
    ).rejects.toThrow();
    expect(await handler(event, request)).toMatchObject({
      kind: "view",
      view: {
        phase: "browse",
        trusted: false,
      },
    });
    expect(await handler(event, { ...request, kind: "allow" })).toMatchObject({
      kind: "view",
      view: { phase: "allowed", trusted: true },
    });
    expect(await handler(event, { ...request, kind: "revoke" })).toMatchObject({
      kind: "view",
      view: { phase: "browse", trusted: false },
    });
  } finally {
    shell.events.get("will-quit")?.({ preventDefault: vi.fn() });
    await vi.waitFor(() => expect(shell.quit).toHaveBeenCalled());
    rmSync(shell.directory, { recursive: true, force: true });
  }
});

it("starts attachment maintenance once and drains it before closing SQLite on Quit", async () => {
  vi.resetModules();
  shell.events.clear();
  shell.quit.mockClear();
  shell.directory = mkdtempSync(join(tmpdir(), "d-pi-attachment-quit-"));
  const attachmentModule = await import("./wiring/attachment-service");
  const factory = attachmentModule.createAttachmentService;
  const startMaintenance = vi.fn<(onFailure?: () => void) => void>();
  let release = () => {};
  const drained = new Promise<void>((resolve) => {
    release = resolve;
  });
  const close = vi.fn(() => drained);
  const factorySpy = vi
    .spyOn(attachmentModule, "createAttachmentService")
    .mockImplementation((...args) => ({
      ...factory(...args),
      startMaintenance,
      close,
    }));
  const storageModule = await import("./wiring/app-storage");
  const databaseClose = vi.spyOn(storageModule.AppStorage.prototype, "close");
  try {
    await import("./index");
    await vi.waitFor(() => expect(startMaintenance).toHaveBeenCalledTimes(1));
    startMaintenance.mock.calls[0]?.[0]?.();
    shell.events.get("will-quit")?.({ preventDefault: vi.fn() });
    await vi.waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    expect(databaseClose).not.toHaveBeenCalled();
    expect(shell.quit).not.toHaveBeenCalled();
    release();
    await vi.waitFor(() => expect(shell.quit).toHaveBeenCalledTimes(1));
    expect(databaseClose).toHaveBeenCalledTimes(1);
    const logs = readFileSync(join(shell.directory, "logs/main.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(logs).toContainEqual(
      expect.objectContaining({
        operation: "attachments:maintenance",
        stage: "failed",
        code: "storage-unavailable",
      }),
    );
  } finally {
    release();
    shell.events.get("will-quit")?.({ preventDefault: vi.fn() });
    await vi.waitFor(() => expect(shell.quit).toHaveBeenCalled());
    factorySpy.mockRestore();
    databaseClose.mockRestore();
    rmSync(shell.directory, { recursive: true, force: true });
  }
});
