// @vitest-environment happy-dom
import { afterEach, expect, it } from "vitest";
import { DraftSchema } from "../../../modules/input/contracts/public";
import {
  type DesktopBridge,
  parseDesktopReply,
} from "../../contracts/desktop-bridge";
import { AppModel } from "../model";
import { createAppRouting } from "./router";
import { readingSearch } from "./search";

const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const dispose of cleanup.splice(0)) dispose();
});

async function fixture() {
  const first = DraftSchema.parse({
    schemaVersion: 1,
    threadId: crypto.randomUUID(),
    workingDirectoryId: crypto.randomUUID(),
    directory: "/first",
    revision: 0,
    text: "first",
  });
  const second = DraftSchema.parse({
    ...first,
    threadId: crypto.randomUUID(),
    directory: "/second",
    text: "second",
  });
  const drafts = new Map([
    [first.threadId, first],
    [second.threadId, second],
  ]);
  let active = first;
  const commands: string[] = [];
  let composing = false;
  let selectionGate: Promise<void> | undefined;
  const bridge: DesktopBridge = {
    request: async (command) => {
      commands.push(command.kind);
      if (command.kind === "list-threads")
        return parseDesktopReply(command, {
          kind: "threads",
          threads: [...drafts.values()],
        });
      if (command.kind === "select-thread") {
        await selectionGate;
        const target = drafts.get(command.threadId);
        if (!target) throw Error("missing Thread");
        active = target;
      }
      if (command.kind === "new-thread") active = second;
      if (
        command.kind === "restore" ||
        command.kind === "select-thread" ||
        command.kind === "new-thread"
      )
        return parseDesktopReply(command, {
          kind: "ready",
          draft: active,
          directoryAvailable: true,
          preferences: { theme: "light", density: "normal", locale: "system" },
        });
      throw Error("unexpected command");
    },
    onCloseRequest: () => () => {},
    onCloseCancelled: () => () => {},
    completeClose: () => {},
  };
  const model = new AppModel(bridge);
  await model.start();
  const routing = createAppRouting(model);
  const unsubscribe = routing.router.history.subscribe(() => {
    void routing.router.load();
  });
  const disconnect = routing.connect();
  cleanup.push(() => {
    disconnect();
    unsubscribe();
    routing.dispose();
    model.dispose();
  });
  await expect
    .poll(() => routing.router.state.location.pathname)
    .toBe(`/threads/${first.threadId}`);
  await routing.router.load();
  const original = model.controller;
  if (!original) throw Error("missing controller");
  model.attachEditorBoundary(original, {
    freeze: () => !composing,
    release: () => {},
  });
  return {
    holdSelection: () => {
      let release = () => {};
      selectionGate = new Promise<void>((resolve) => {
        release = resolve;
      });
      return release;
    },
    model,
    router: routing.router,
    first,
    second,
    commands,
    compose: (value: boolean) => {
      composing = value;
      const controller = model.controller;
      if (controller)
        model.attachEditorBoundary(controller, {
          freeze: () => !composing,
          release: () => {},
        });
    },
  };
}

it("keeps both location and Thread on failed admission, then selects before committing and checks back/forward", async () => {
  const input = await fixture();
  input.compose(true);
  await input.router.navigate({
    to: "/threads/$threadId",
    params: { threadId: input.second.threadId },
    search: { view: "history" },
  });
  expect(input.router.state.location.pathname).toBe(
    `/threads/${input.first.threadId}`,
  );
  expect(input.commands.filter((value) => value === "select-thread")).toEqual(
    [],
  );
  input.compose(false);
  await input.router.navigate({
    to: "/threads/$threadId",
    params: { threadId: input.second.threadId },
    search: { view: "history" },
  });
  expect(input.router.state.location.pathname).toBe(
    `/threads/${input.second.threadId}`,
  );
  input.compose(true);
  input.router.history.back();
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(input.router.state.location.pathname).toBe(
    `/threads/${input.second.threadId}`,
  );
  expect(input.router.history.length).toBe(2);
  input.compose(false);
  input.router.history.back();
  await expect
    .poll(() => input.router.state.location.pathname)
    .toBe(`/threads/${input.first.threadId}`);
  input.router.history.forward();
  await expect
    .poll(() => input.router.state.location.pathname)
    .toBe(`/threads/${input.second.threadId}`);
  expect(
    input.commands.filter((value) => value === "select-thread"),
  ).toHaveLength(3);
});

it("does not execute commands or replace Thread resources for same-Thread reading navigation and speculative preloading", async () => {
  const input = await fixture();
  const controller = input.model.controller;
  const initial = input.commands.slice();
  await input.router.preloadRoute({
    to: "/threads/$threadId",
    params: { threadId: input.second.threadId },
    search: { view: "files" },
  });
  expect(input.commands).toEqual(initial);
  await input.router.navigate({
    to: "/threads/$threadId",
    params: { threadId: input.first.threadId },
    search: { view: "files" },
    replace: true,
  });
  expect(input.router.state.location.search).toEqual({ view: "files" });
  expect(input.commands).toEqual(initial);
  expect(input.model.controller).toBe(controller);
  expect(input.router.history.length).toBe(1);
});

it.each(["files", "conversation"])(
  "does not settle an in-flight admission when another %s intent is refused",
  async (view) => {
    const input = await fixture();
    const release = input.holdSelection();
    let settled = false;
    const selecting = input.router
      .navigate({
        to: "/threads/$threadId",
        params: { threadId: input.second.threadId },
        search: { view: "history" },
      })
      .then(() => {
        settled = true;
      });
    await expect
      .poll(() => input.model.getSnapshot())
      .toMatchObject({ threadTransition: "pending" });
    const concurrent = input.router.navigate({
      to: "/threads/$threadId",
      params: { threadId: input.first.threadId },
      search: readingSearch.parse({ view }),
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(settled).toBe(false);
    release();
    await Promise.all([selecting, concurrent]);
    expect(input.router.state.location.pathname).toBe(
      `/threads/${input.second.threadId}`,
    );
    expect(
      input.commands.filter((command) => command === "select-thread"),
    ).toHaveLength(1);
  },
);

it("repairs navigation when a command selects a new Thread while a reading navigation is finishing", async () => {
  const input = await fixture();
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const load = input.router.load;
  input.router.load = async (...args) => {
    await gate;
    return load(...args);
  };
  const reading = input.router.navigate({
    to: "/threads/$threadId",
    params: { threadId: input.first.threadId },
    search: { view: "files" },
    replace: true,
  });
  await expect
    .poll(() => input.router.history.location.search)
    .toContain("files");
  expect((await input.model.newThread()).kind).toBe("applied");
  release();
  await reading;
  await expect
    .poll(() => input.router.state.location.pathname)
    .toBe(`/threads/${input.second.threadId}`);
  expect(
    input.commands.filter((command) => command === "new-thread"),
  ).toHaveLength(1);
});
