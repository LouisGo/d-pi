import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { expect, it, vi } from "vitest";
import type { Reply } from "../../contracts/desktop-bridge";
import type { DesktopCommandService } from "../wiring/desktop-command-service";
import { registerDraftIpc } from "./draft";

it("arms close protection before publishing ready and ignores replies to a departed renderer", async () => {
  const handle = vi.fn<IpcMain["handle"]>();
  let current = true;
  let finish: ((reply: Reply) => void) | undefined;
  const service = {
    execute: () =>
      new Promise<Reply>((done) => {
        finish = done;
      }),
  } as unknown as DesktopCommandService;
  const ready = vi.fn();
  registerDraftIpc({
    ipcMain: { on: vi.fn(), handle } as unknown as IpcMain,
    sourceValid: () => current,
    getDiagnostics: () => undefined,
    initializeStorage: () => {},
    getService: () => service,
    getStartupCauseCode: () => undefined,
    onEditableReady: ready,
  });
  const handler = handle.mock.calls[0]?.[1];
  if (!handler) throw Error("missing handler");
  const event = {} as IpcMainInvokeEvent;
  const envelope = () => ({
    schemaVersion: 1,
    connectionId: crypto.randomUUID(),
    requestId: crypto.randomUUID(),
    command: { kind: "restore", traceId: crypto.randomUUID() },
  });
  const reply = {
    kind: "ready",
    draft: null,
    preferences: { theme: "system", locale: "system", density: "compact" },
    directoryAvailable: true,
  } as Reply;
  const first = handler(event, envelope());
  expect(ready).not.toHaveBeenCalled();
  finish?.(reply);
  await first;
  expect(ready).toHaveBeenCalledOnce();
  const stale = handler(event, envelope());
  current = false;
  finish?.(reply);
  await stale;
  expect(ready).toHaveBeenCalledOnce();
});
