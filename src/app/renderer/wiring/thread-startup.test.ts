import { afterEach, expect, it, vi } from "vitest";
import { RuntimeViewSchema } from "../../../modules/execution/contracts/public";
import { DraftSchema } from "../../../modules/input/contracts/public";
import {
  type DesktopBridge,
  parseDesktopReply,
} from "../../contracts/desktop-bridge";
import { AppModel } from "./model";

const models: AppModel[] = [];
afterEach(() => {
  for (const model of models.splice(0)) model.dispose();
  vi.unstubAllGlobals();
});
async function fixture(trusted: boolean) {
  vi.stubGlobal("document", { documentElement: { dataset: {} } });
  const first = DraftSchema.parse({
    schemaVersion: 1,
    threadId: crypto.randomUUID(),
    workingDirectoryId: crypto.randomUUID(),
    directory: "/fixture",
    revision: 0,
    text: "",
  });
  let selected = first;
  const requests: { kind: string; threadId: string }[] = [];
  let release = () => {};
  const gate = new Promise<void>((done) => {
    release = done;
  });
  const bridge: DesktopBridge = {
    request: async (command) => {
      if (command.kind === "new-thread")
        selected = DraftSchema.parse({
          ...first,
          threadId: crypto.randomUUID(),
        });
      if (command.kind === "restore" || command.kind === "new-thread")
        return parseDesktopReply(command, {
          kind: "ready",
          draft: selected,
          directoryAvailable: true,
          preferences: { theme: "light", density: "normal", locale: "system" },
        });
      if (command.kind === "list-threads")
        return parseDesktopReply(command, {
          kind: "threads",
          threads: [first, selected].map(
            ({ threadId, workingDirectoryId, directory }) => ({
              threadId,
              workingDirectoryId,
              directory,
            }),
          ),
        });
      throw Error("Unexpected command");
    },
    runtime: {
      subscribe: () => () => {},
      request: async (command) => {
        requests.push(command);
        if (command.kind === "inspect" && command.threadId !== first.threadId)
          await gate;
        return {
          kind: "view",
          view: RuntimeViewSchema.parse({
            threadId: command.threadId,
            traceId: command.traceId,
            revision: command.kind === "start" ? 1 : 0,
            configuration: { code: "runtime.configDefault" },
            phase:
              command.threadId === first.threadId
                ? "interrupted"
                : command.kind === "start"
                  ? "ready"
                  : trusted
                    ? "allowed"
                    : "browse",
            trusted,
            busy: false,
            model: command.kind === "start" ? "fixture/model" : null,
            message: { code: "runtime.readyToSend" },
          }),
        };
      },
    },
    onCloseRequest: () => () => {},
    onCloseCancelled: () => () => {},
    completeClose: () => {},
  };
  const model = new AppModel(bridge);
  models.push(model);
  await model.start();
  return { model, requests, release, first };
}
it("starts a newly created Thread once after its existing project grant is confirmed, without restarting cold history", async () => {
  const f = await fixture(true);
  expect(f.requests.map((r) => r.kind)).toEqual(["inspect"]);
  const result = await f.model.newThread();
  expect(result.kind).toBe("applied");
  expect(f.requests.filter((r) => r.kind === "start")).toEqual([]);
  f.release();
  await new Promise((done) => setTimeout(done, 0));
  expect(f.requests.filter((r) => r.kind === "start")).toEqual([
    {
      kind: "start",
      threadId: f.model.runtime?.stateStore.getState().thread,
      traceId: expect.any(String),
    },
  ]);
  expect(f.model.runtime?.getSnapshot()?.phase).toBe("ready");
});
it("does not create an execution grant or start an untrusted project as a side effect of creating a Thread", async () => {
  const f = await fixture(false);
  await f.model.newThread();
  f.release();
  await new Promise((done) => setTimeout(done, 0));
  expect(f.requests.map((r) => r.kind)).toEqual(["inspect", "inspect"]);
  expect(f.model.runtime?.getSnapshot()?.phase).toBe("browse");
});
