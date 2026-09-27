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
  events: new Map<string, (event: unknown) => void>(),
  contents: {
    mainFrame: {},
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
    on = vi.fn();
    loadURL = vi.fn();
    loadFile = vi.fn();
  },
  ipcMain: {
    handle: (
      name: string,
      listener: (event: unknown, raw: unknown) => unknown,
    ) => shell.handlers.set(name, listener),
    on: vi.fn(),
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
