import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, it, vi } from "vitest";
import { type Command, ReplySchema } from "../shared/contracts";
import { DraftStorage } from "./storage";

// Exercise the production IPC handler with real SQLite; only Electron's shell
// is replaced so this test never opens a window or touches user data.
const shell = vi.hoisted(() => ({
  directory: "",
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
    session: { setPermissionRequestHandler: vi.fn() },
  },
  quit: vi.fn(),
}));
vi.mock("electron", () => ({
  app: {
    setPath: vi.fn(),
    setName: vi.fn(),
    requestSingleInstanceLock: () => true,
    whenReady: () => Promise.resolve(),
    getPath: () => shell.directory,
    on: (name: string, listener: (event: unknown) => void) =>
      shell.events.set(name, listener),
    quit: shell.quit,
  },
  BrowserWindow: class {
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
  Menu: { buildFromTemplate: vi.fn(), setApplicationMenu: vi.fn() },
}));

it("retries a failed initial restore after the lock clears, preserving the same draft", async () => {
  shell.directory = mkdtempSync(join(tmpdir(), "d-pi-startup-"));
  const path = join(shell.directory, "drafts.sqlite");
  const original = new DraftStorage(path);
  const draft = original.create(shell.directory);
  original.save(draft.threadId, 0, "keep this\n\n原文");
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
