import { expect, it, vi } from "vitest";
import { DraftSchema } from "../../../modules/input/contracts/public";
import {
  type DesktopBridge,
  parseDesktopReply,
} from "../../contracts/desktop-bridge";
import { AppModel } from "./model";

it("switches only after saving, retains detached resources and blocks switching on an unresolved save", async () => {
  vi.stubGlobal("document", { documentElement: { dataset: {} } });
  const a = DraftSchema.parse({
    schemaVersion: 1,
    threadId: crypto.randomUUID(),
    workingDirectoryId: crypto.randomUUID(),
    directory: "/a",
    revision: 0,
    text: "a",
  });
  const b = DraftSchema.parse({
    ...a,
    threadId: crypto.randomUUID(),
    text: "b",
  });
  let current = a;
  const stored = new Map([
    [a.threadId, a],
    [b.threadId, b],
  ]);
  const writes: string[] = [];
  const bridge: DesktopBridge = {
    request: async (command) => {
      if (command.kind === "save") {
        writes.push(command.text);
        const previous = stored.get(command.threadId);
        if (!previous) throw Error("missing draft");
        stored.set(command.threadId, {
          ...previous,
          text: command.text,
          revision: command.expectedRevision + 1,
        });
        return parseDesktopReply(command, {
          kind: "saved",
          threadId: command.threadId,
          revision: command.expectedRevision + 1,
        });
      }
      if (command.kind === "list-threads")
        return parseDesktopReply(command, {
          kind: "threads",
          threads: [a, b].map(
            ({ threadId, workingDirectoryId, directory }) => ({
              threadId,
              workingDirectoryId,
              directory,
            }),
          ),
        });
      if (command.kind === "select-thread")
        current = stored.get(command.threadId) ?? current;
      return parseDesktopReply(command, {
        kind: "ready",
        draft: current,
        directoryAvailable: true,
        preferences: { theme: "light", density: "normal", locale: "system" },
      });
    },
    onCloseRequest: () => () => {},
    onCloseCancelled: () => () => {},
    completeClose: () => {},
  };
  const app = new AppModel(bridge);
  try {
    await app.start();
    const first = app.controller;
    first?.edit("pending a");
    await app.selectThread(b.threadId);
    expect(writes).toContain("pending a");
    expect(app.controller).not.toBe(first);
    await app.selectThread(a.threadId);
    expect(app.controller).toBe(first);
    expect(first?.getTextSnapshot()).toBe("pending a");
    if (!first) throw Error("missing controller");
    app.attachEditorBoundary(first, { freeze: () => false, release: () => {} });
    await app.selectThread(b.threadId);
    expect(app.controller).toBe(first);
  } finally {
    app.dispose();
    vi.unstubAllGlobals();
  }
});
