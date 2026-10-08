import { afterEach, expect, it, vi } from "vitest";
import { DraftSchema } from "../../../modules/input/contracts/public";
import type { Preferences } from "../../../modules/preferences/contracts/public";
import { modelKey } from "../../../modules/preferences/core/public";
import {
  type Command,
  type DesktopBridge,
  parseDesktopReply,
  type Reply,
} from "../../contracts/desktop-bridge";
import { failure } from "../../contracts/failure";
import { AppModel } from "./model";

const draft = DraftSchema.parse({
  schemaVersion: 1,
  threadId: crypto.randomUUID(),
  workingDirectoryId: crypto.randomUUID(),
  directory: "/fixture",
  revision: 0,
  text: "retained input",
});
function deferred() {
  let resolve: (reply: Reply) => void = () => {
    throw Error("Uninitialized reply");
  };
  const promise = new Promise<Reply>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}
type PreferenceCommand = Extract<Command, { kind: "preferences" }>;
async function setup(save: (command: PreferenceCommand) => Promise<Reply>) {
  vi.stubGlobal("document", { documentElement: { dataset: {} } });
  const bridge: DesktopBridge = {
    request: async (command) => {
      if (command.kind === "preferences")
        return parseDesktopReply(command, await save(command));
      if (command.kind === "restore")
        return parseDesktopReply(command, {
          kind: "ready",
          draft,
          directoryAvailable: true,
          preferences: { theme: "light", density: "normal", locale: "system" },
        });
      if (command.kind === "list-threads")
        return parseDesktopReply(command, { kind: "threads", threads: [] });
      throw Error(`Unexpected ${command.kind}`);
    },
    onCloseRequest: () => () => {},
    onCloseCancelled: () => () => {},
    completeClose: () => {},
  };
  const model = new AppModel(bridge);
  await model.start();
  return model;
}
function preferences(model: AppModel): Preferences {
  const state = model.getSnapshot();
  if (state.kind !== "ready") throw Error("Preferences unavailable");
  return state.preferences;
}
afterEach(() => {
  vi.unstubAllGlobals();
});

it("serializes picker and appearance operations using the last confirmed readback without replacing Thread resources", async () => {
  const first = deferred();
  const commands: PreferenceCommand[] = [];
  const model = await setup(async (command) => {
    commands.push(command);
    if (commands.length === 1) return first.promise;
    return { kind: "preferences-saved", value: command.value };
  });
  try {
    const before = model.getSnapshot();
    if (before.kind !== "ready") throw Error("Missing ready Thread");
    const controller = model.controller;
    const editors = model.draftEditors;
    const selected: unknown[] = [];
    model.subscribeTo(
      (state) => (state.kind === "ready" ? state.threadSelection : null),
      () => {
        selected.push(model.getSnapshot());
      },
    );
    const a = modelKey("provider", "a"),
      b = modelKey("provider", "b");
    const operations = [
      model.modelPreference({ kind: "favorite", key: a, value: true }),
      model.preference("theme", "dark"),
      model.modelPreference({ kind: "favorite", key: b, value: true }),
      model.modelPreference({ kind: "visibility", key: a, value: false }),
      model.preference("sendKey", "enter-newline"),
      model.modelPreference({ kind: "move", key: b, before: null }),
      model.modelPreference({ kind: "move", key: a, before: b }),
      model.modelPreference({ kind: "order", keys: ["other-provider", b, a] }),
    ];
    expect(commands).toHaveLength(1);
    expect(preferences(model).modelPicker).toBeUndefined();
    const initial = commands[0];
    if (!initial) throw Error("Initial preference command not sent");
    first.resolve({
      kind: "preferences-saved",
      value: { ...initial.value, locale: "zh-CN" },
    });
    await Promise.all(operations);
    expect(commands).toHaveLength(8);
    expect(preferences(model)).toEqual({
      theme: "dark",
      density: "normal",
      locale: "zh-CN",
      sendKey: "enter-newline",
      modelPicker: {
        favorites: [a, b],
        hidden: [a],
        order: ["other-provider", b, a],
      },
    });
    expect(
      commands.slice(1).every((command) => command.value.locale === "zh-CN"),
    ).toBe(true);
    expect(model.getSnapshot()).toMatchObject({ busy: false });
    expect(selected).toEqual([]);
    expect(model.controller).toBe(controller);
    expect(model.draftEditors).toBe(editors);
    expect(model.controller?.getTextSnapshot()).toBe("retained input");
  } finally {
    model.dispose();
  }
});

it("keeps confirmed preferences after a failed save and continues queued work from the last accepted state", async () => {
  const first = deferred(),
    second = deferred();
  const commands: PreferenceCommand[] = [];
  const model = await setup(async (command) => {
    commands.push(command);
    return commands.length === 1 ? first.promise : second.promise;
  });
  try {
    const failed = model.modelPreference({
      kind: "favorite",
      key: "failed",
      value: true,
    });
    const queued = model.modelPreference({
      kind: "favorite",
      key: "accepted",
      value: true,
    });
    const command = commands[0];
    if (!command) throw Error("Missing first command");
    first.resolve(
      failure(
        command.traceId,
        "storage-unavailable",
        "draft.storageUnavailable",
      ),
    );
    await failed;
    expect(preferences(model).modelPicker).toBeUndefined();
    expect(model.getSnapshot()).toMatchObject({
      notice: { code: "storage-unavailable" },
    });
    expect(commands).toHaveLength(2);
    const pending = commands[1];
    if (!pending) throw Error("Missing queued command");
    expect(pending.value.modelPicker?.favorites).toEqual(["accepted"]);
    second.resolve({ kind: "preferences-saved", value: pending.value });
    await queued;
    expect(preferences(model).modelPicker?.favorites).toEqual(["accepted"]);
    expect(model.getSnapshot()).toMatchObject({ notice: null });
  } finally {
    model.dispose();
  }
});

it("ignores a late preference reply after disposal and never dispatches queued operations to a disposed model", async () => {
  const receipt = deferred();
  const commands: PreferenceCommand[] = [];
  const model = await setup(async (command) => {
    commands.push(command);
    return receipt.promise;
  });
  const first = model.modelPreference({
    kind: "favorite",
    key: "first",
    value: true,
  });
  const queued = model.modelPreference({
    kind: "visibility",
    key: "second",
    value: false,
  });
  model.dispose();
  const command = commands[0];
  if (!command) throw Error("Missing first command");
  receipt.resolve({ kind: "preferences-saved", value: command.value });
  await Promise.all([first, queued]);
  expect(model.getSnapshot()).toEqual({ kind: "disposed" });
  expect(commands).toHaveLength(1);
  await model.modelPreference({ kind: "favorite", key: "later", value: true });
  expect(commands).toHaveLength(1);
});
