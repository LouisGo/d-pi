import { afterEach, expect, it, vi } from "vitest";
import { DraftSchema } from "../../../modules/input/contracts/public";
import {
  type Command,
  type DesktopBridge,
  parseDesktopReply,
  type Reply,
} from "../../contracts/desktop-bridge";
import { AppModel } from "./model";

// The AppModel state container must keep the publication contract the hand
// written listener set had: one notification per published state, exact
// replacement of that state, a cached snapshot, stable store references for
// headless reads and the React binding, and no publication once disposed.
const ready = (
  theme: "light" | "dark" = "light",
): Extract<Reply, { kind: "ready" }> => ({
  kind: "ready",
  draft: null,
  directoryAvailable: true,
  preferences: { theme, density: "normal", locale: "system" },
});

function deferred(): {
  promise: Promise<Reply>;
  resolve: (reply: Reply) => void;
} {
  let resolve: (reply: Reply) => void = () => {
    throw new Error("Reply not initialized");
  };
  const promise = new Promise<Reply>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

function bridge(request: (command: Command) => Promise<Reply>): DesktopBridge {
  return {
    request: async (command) =>
      parseDesktopReply(command, await request(command)),
    onCloseRequest: () => () => {},
    onCloseCancelled: () => () => {},
    completeClose: () => {},
  };
}

function busy(model: AppModel): boolean | null {
  const view = model.getSnapshot();
  return view.kind === "ready" ? view.busy : null;
}

function theme(model: AppModel): string | null {
  const view = model.getSnapshot();
  return view.kind === "ready" ? view.preferences.theme : null;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

it("cycles through system appearance, follows OS changes without saving, and releases the observer", async () => {
  const dataset: Record<string, string> = {};
  vi.stubGlobal("document", { documentElement: { dataset } });
  let listener: (() => void) | undefined;
  const media = {
    matches: true,
    addEventListener: vi.fn((_event: string, callback: () => void) => {
      listener = callback;
    }),
    removeEventListener: vi.fn(),
  };
  vi.stubGlobal("window", { matchMedia: () => media });
  const saves: string[] = [];
  const model = new AppModel(
    bridge(async (command) => {
      if (command.kind === "preferences") {
        saves.push(command.value.theme);
        return { kind: "preferences-saved", value: command.value };
      }
      return ready();
    }),
  );
  await model.start();
  await model.preference("theme");
  await model.preference("theme");
  expect(saves).toEqual(["dark", "system"]);
  expect(theme(model)).toBe("system");
  expect(dataset.theme).toBe("dark");
  media.matches = false;
  listener?.();
  expect(dataset.theme).toBe("light");
  expect(saves).toHaveLength(2);
  await model.preference("theme");
  expect(saves).toEqual(["dark", "system", "light"]);
  media.matches = true;
  listener?.();
  expect(dataset.theme).toBe("light");
  model.dispose();
  expect(media.removeEventListener).toHaveBeenCalledWith("change", listener);
});

it("notifies a selected projection only when that projection changes", async () => {
  vi.stubGlobal("document", { documentElement: { dataset: {} } });
  const restore = deferred();
  const saved = deferred();
  const model = new AppModel(
    bridge((command) =>
      command.kind === "restore" ? restore.promise : saved.promise,
    ),
  );
  const busies: (boolean | null)[] = [];
  const themes: (string | null)[] = [];
  model.subscribeTo(
    (view) => (view.kind === "ready" ? view.busy : null),
    () => {
      busies.push(busy(model));
    },
  );
  model.subscribeTo(
    (view) => (view.kind === "ready" ? view.preferences.theme : null),
    () => {
      themes.push(theme(model));
    },
  );
  const started = model.start();
  restore.resolve(ready());
  await started;
  expect(busies).toEqual([false]);
  expect(themes).toEqual(["light"]);
  const toggled = model.preference("theme");
  // Desktop preference persistence must not publish a navigation busy state.
  expect(busies).toEqual([false]);
  expect(themes).toEqual(["light"]);
  saved.resolve({
    kind: "preferences-saved",
    value: { theme: "dark", density: "normal", locale: "system" },
  });
  await toggled;
  expect(busies).toEqual([false]);
  expect(themes).toEqual(["light", "dark"]);
  model.dispose();
});

it("keeps whole-state subscribers notified for every published state", async () => {
  vi.stubGlobal("document", { documentElement: { dataset: {} } });
  const model = new AppModel(
    bridge(async (command) =>
      command.kind === "restore"
        ? ready()
        : {
            kind: "preferences-saved",
            value: { theme: "dark", density: "normal", locale: "system" },
          },
    ),
  );
  let changes = 0;
  model.subscribe(() => {
    changes += 1;
  });
  await model.start();
  expect(changes).toBe(1);
  // Only the confirmed preference changes the visible App projection.
  await model.preference("theme");
  expect(changes).toBe(2);
  model.dispose();
});

it("does not publish a late reply after dispose", async () => {
  vi.stubGlobal("document", { documentElement: { dataset: {} } });
  const restore = deferred();
  const model = new AppModel(bridge(() => restore.promise));
  let changes = 0;
  model.subscribe(() => {
    changes += 1;
  });
  const started = model.start();
  model.dispose();
  restore.resolve(ready());
  await started;
  expect(model.getSnapshot()).toEqual({ kind: "disposed" });
  expect(changes).toBe(1);
});

it("releases submission state and ignores a restore that finishes after dispose", async () => {
  vi.stubGlobal("document", { documentElement: { dataset: {} } });
  const restore = deferred();
  const restoredDraft = DraftSchema.parse({
    schemaVersion: 1,
    threadId: crypto.randomUUID(),
    workingDirectoryId: crypto.randomUUID(),
    directory: "/fixture",
    revision: 0,
    text: "saved source",
  });
  let subscribed = 0;
  let released = 0;
  const bridge: DesktopBridge = {
    request: async (command) => {
      if (command.kind === "restore")
        return parseDesktopReply(command, await restore.promise);
      throw Error(`unexpected ${command.kind}`);
    },
    submission: {
      request: async () => ({ kind: "list", receipts: [] }),
      subscribe: () => {
        subscribed += 1;
        return () => {
          released += 1;
        };
      },
    },
    onCloseRequest: () => () => {},
    onCloseCancelled: () => () => {},
    completeClose: () => {},
  };
  const model = new AppModel(bridge);
  const started = model.start();
  model.dispose();
  restore.resolve({
    kind: "ready",
    draft: restoredDraft,
    directoryAvailable: true,
    preferences: { theme: "light", density: "normal", locale: "system" },
  });
  await started;
  expect(subscribed).toBe(0);
  expect(released).toBe(0);

  const active = new AppModel({
    ...bridge,
    request: async (command) => {
      if (command.kind === "restore")
        return parseDesktopReply(command, {
          kind: "ready" as const,
          draft: restoredDraft,
          directoryAvailable: true,
          preferences: {
            theme: "light" as const,
            density: "normal" as const,
            locale: "system" as const,
          },
        });
      throw Error(`unexpected ${command.kind}`);
    },
  });
  await active.start();
  expect(subscribed).toBe(1);
  active.dispose();
  expect(released).toBe(1);
  expect(active.getSnapshot().kind).toBe("disposed");
  expect(active.controller).toBeNull();
});

it("replaces the published state so a retry cannot keep failure fields", async () => {
  vi.stubGlobal("document", { documentElement: { dataset: {} } });
  let fail = true;
  const model = new AppModel(
    bridge(async (command) => {
      if (command.kind !== "restore") throw Error("Unexpected command");
      if (fail) throw Error("transport unavailable");
      return ready();
    }),
  );
  await model.start();
  expect(model.getSnapshot().kind).toBe("failed");
  fail = false;
  await model.start();
  expect(model.getSnapshot()).toEqual({
    kind: "ready",
    threadSelection: { kind: "empty" },
    preferences: { theme: "light", density: "normal", locale: "system" },
    busy: false,
    notice: null,
  });
  model.dispose();
});

it("returns a cached snapshot and keeps both store references stable", async () => {
  vi.stubGlobal("document", { documentElement: { dataset: {} } });
  const saved = deferred();
  const model = new AppModel(
    bridge((command) =>
      command.kind === "restore" ? Promise.resolve(ready()) : saved.promise,
    ),
  );
  await model.start();
  const subscribe = model.subscribe;
  const getSnapshot = model.getSnapshot;
  expect(model.subscribe).toBe(subscribe);
  expect(model.getSnapshot).toBe(getSnapshot);
  const before = model.getSnapshot();
  expect(model.getSnapshot()).toBe(before);
  const toggled = model.preference("theme");
  const during = model.getSnapshot();
  expect(during).toBe(before);
  expect(model.getSnapshot()).toBe(during);
  saved.resolve({
    kind: "preferences-saved",
    value: { theme: "dark", density: "normal", locale: "system" },
  });
  await toggled;
  expect(model.getSnapshot()).not.toBe(during);
  model.dispose();
});

it("ignores a restore overtaken by a later initialization request", async () => {
  vi.stubGlobal("document", { documentElement: { dataset: {} } });
  const first = deferred();
  const second = deferred();
  let count = 0;
  const model = new AppModel(
    bridge(() => (++count === 1 ? first.promise : second.promise)),
  );
  const older = model.start();
  const newer = model.start();
  second.resolve(ready("dark"));
  await newer;
  first.resolve(ready("light"));
  await older;
  expect(theme(model)).toBe("dark");
  model.dispose();
});

it("publishes a complete new Thread whose save lane cannot use the previous Thread", async () => {
  vi.stubGlobal("document", { documentElement: { dataset: {} } });
  const first = DraftSchema.parse({
    schemaVersion: 1,
    threadId: crypto.randomUUID(),
    workingDirectoryId: crypto.randomUUID(),
    directory: "/first",
    revision: 0,
    text: "first text",
  });
  const second = DraftSchema.parse({
    ...first,
    threadId: crypto.randomUUID(),
    directory: "/second",
    text: "second text",
  });
  let current = first;
  const savedThreads: string[] = [];
  const model = new AppModel(
    bridge(async (command) => {
      if (command.kind === "restore")
        return { ...ready(), kind: "ready", draft: current };
      if (command.kind === "save") {
        savedThreads.push(command.threadId);
        return {
          kind: "saved",
          threadId: command.threadId,
          revision: command.expectedRevision + 1,
        };
      }
      throw Error("unexpected command");
    }),
  );
  await model.start();
  const previous = model.controller;
  current = second;
  await model.start();
  const active = model.controller;
  if (!previous || !active) throw Error("missing controller");
  active.edit("new second edit");
  await active.flush();
  expect(savedThreads).toEqual([second.threadId]);
  expect(active).not.toBe(previous);
  previous.edit("late old edit");
  expect(savedThreads).toEqual([second.threadId]);
  model.dispose();
});

it("publishes disposed before exposing released Thread resources", async () => {
  vi.stubGlobal("document", { documentElement: { dataset: {} } });
  const restored = DraftSchema.parse({
    schemaVersion: 1,
    threadId: crypto.randomUUID(),
    workingDirectoryId: crypto.randomUUID(),
    directory: "/fixture",
    revision: 0,
    text: "source",
  });
  const model = new AppModel(
    bridge(async () => ({ ...ready(), kind: "ready", draft: restored })),
  );
  await model.start();
  model.dispose();
  expect(model.getSnapshot().kind).toBe("disposed");
  expect(model.controller).toBeNull();
  expect(model.submission).toBeNull();
  model.dispose();
});
