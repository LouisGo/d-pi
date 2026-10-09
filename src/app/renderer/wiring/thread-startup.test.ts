import { afterEach, expect, it, vi } from "vitest";
import {
  type RuntimeView,
  RuntimeViewSchema,
} from "../../../modules/execution/contracts/public";
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
async function fixture(
  trusted: boolean,
  coldAllowed = false,
  options: {
    failStart?: boolean;
    origin?: "cli";
    nativeIndex?: "ready" | "indexing" | "partial" | "unavailable";
    indexPages?: ("indexing" | "ready")[];
  } = {},
) {
  vi.stubGlobal("document", { documentElement: { dataset: {} } });
  const first = DraftSchema.parse({
    schemaVersion: 1,
    threadId: crypto.randomUUID(),
    workingDirectoryId: crypto.randomUUID(),
    directory: "/fixture",
    revision: 0,
    text: "",
    ...(options.origin
      ? { origin: options.origin, title: "Native CLI chat" }
      : {}),
  });
  let selected = first;
  const drafts = new Map([[first.threadId, first]]);
  const requests: { kind: string; threadId: string }[] = [];
  const runtimeListeners = new Set<(view: RuntimeView) => void>();
  const runtimeRevisions = new Map<string, number>();
  let release = () => {};
  const gate = new Promise<void>((done) => {
    release = done;
  });
  const bridge: DesktopBridge = {
    request: async (command) => {
      if (command.kind === "select-thread")
        selected = drafts.get(command.threadId) ?? first;
      if (command.kind === "new-thread") {
        selected = DraftSchema.parse({
          ...first,
          threadId: crypto.randomUUID(),
        });
        drafts.set(selected.threadId, selected);
      }
      if (
        command.kind === "restore" ||
        command.kind === "new-thread" ||
        command.kind === "select-thread"
      )
        return parseDesktopReply(command, {
          kind: "ready",
          draft: selected,
          directoryAvailable: true,
          preferences: { theme: "light", density: "normal", locale: "system" },
        });
      if (command.kind === "list-threads")
        return parseDesktopReply(command, {
          kind: "threads",
          ...(options.indexPages
            ? { nativeIndex: options.indexPages.shift() ?? "ready" }
            : options.nativeIndex
              ? { nativeIndex: options.nativeIndex }
              : {}),
          threads: Array.from(drafts.values()).map(
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
      subscribe: (listener) => {
        runtimeListeners.add(listener);
        return () => runtimeListeners.delete(listener);
      },
      request: async (command) => {
        requests.push(command);
        if (command.kind === "inspect" && command.threadId !== first.threadId)
          await gate;
        const revision = (runtimeRevisions.get(command.threadId) ?? -1) + 1;
        runtimeRevisions.set(command.threadId, revision);
        return {
          kind: "view",
          view: RuntimeViewSchema.parse({
            threadId: command.threadId,
            traceId: command.traceId,
            revision,
            configuration: { code: "runtime.configDefault" },
            phase:
              options.failStart && command.kind === "start"
                ? "failed"
                : command.threadId === first.threadId
                  ? command.kind === "start"
                    ? "ready"
                    : coldAllowed
                      ? command.kind === "start"
                        ? "ready"
                        : trusted
                          ? "allowed"
                          : "browse"
                      : "interrupted"
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
  return {
    model,
    requests,
    release,
    first,
    publish: (view: RuntimeView) => {
      runtimeRevisions.set(view.threadId, view.revision);
      for (const listener of runtimeListeners) listener(view);
    },
    grant: () => {
      trusted = true;
    },
  };
}
it("automatically prepares an idle interrupted App Thread and starts a newly created Thread after inspection", async () => {
  const f = await fixture(true);
  await new Promise((done) => setTimeout(done, 0));
  expect(f.requests.map((r) => r.kind)).toEqual(["inspect", "start"]);
  const result = await f.model.newThread();
  expect(result.kind).toBe("applied");
  expect(f.requests.filter((r) => r.kind === "start")).toHaveLength(1);
  f.release();
  await new Promise((done) => setTimeout(done, 0));
  expect(f.requests.filter((r) => r.kind === "start").slice(1)).toEqual([
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

it("automatically prepares a trusted restored session while retaining its draft and original Thread identity", async () => {
  const f = await fixture(true, true);
  await new Promise((done) => setTimeout(done, 0));
  expect(f.requests.map((r) => r.kind)).toEqual(["inspect", "start"]);
  expect(f.model.runtime?.getSnapshot()?.phase).toBe("ready");
  expect(f.model.controller?.getSnapshot()).toMatchObject({ kind: "saved" });
  expect(f.model.runtime?.stateStore.getState().thread).toBe(f.first.threadId);
});
it("does not launch a newly detached Thread after its inspection finishes, but prepares it once on return", async () => {
  const f = await fixture(true, false, { origin: "cli" });
  await f.model.newThread();
  const second = f.model.runtime?.stateStore.getState().thread;
  if (!second) throw Error("missing second Thread");
  await f.model.selectThread(f.first.threadId);
  f.release();
  await new Promise((done) => setTimeout(done, 0));
  expect(f.requests.filter((r) => r.kind === "start")).toEqual([]);
  await f.model.selectThread(second);
  await new Promise((done) => setTimeout(done, 0));
  expect(f.requests.filter((r) => r.kind === "start")).toMatchObject([
    { threadId: second },
  ]);
  await f.model.selectThread(f.first.threadId);
  await f.model.selectThread(second);
  await new Promise((done) => setTimeout(done, 0));
  expect(f.requests.filter((r) => r.kind === "start")).toHaveLength(1);
});
it("does not launch after disposal while startup inspection is still pending", async () => {
  const f = await fixture(true, false, { origin: "cli" });
  await f.model.newThread();
  f.model.dispose();
  f.release();
  await new Promise((done) => setTimeout(done, 0));
  expect(f.requests.filter((r) => r.kind === "start")).toEqual([]);
});

it("does not retry a failed automatic startup when returning to the same Thread", async () => {
  const f = await fixture(true, true, { failStart: true });
  await new Promise((done) => setTimeout(done, 0));
  const original = f.model.runtime;
  expect(original?.getSnapshot()?.phase).toBe("failed");
  await f.model.newThread();
  f.release();
  await new Promise((done) => setTimeout(done, 0));
  await f.model.selectThread(f.first.threadId);
  await new Promise((done) => setTimeout(done, 0));
  expect(f.model.runtime).toBe(original);
  expect(
    f.requests.filter(
      (r) => r.kind === "start" && r.threadId === f.first.threadId,
    ),
  ).toHaveLength(1);
  await original?.act("start");
  expect(
    f.requests.filter(
      (r) => r.kind === "start" && r.threadId === f.first.threadId,
    ),
  ).toHaveLength(2);
});
it("automatically resumes an indexed CLI session in a trusted project without creating another Thread", async () => {
  const f = await fixture(true, true, { origin: "cli" });
  await new Promise((done) => setTimeout(done, 0));
  expect(f.requests.map((r) => r.kind)).toEqual(["inspect", "start"]);
  expect(f.model.runtime?.getSnapshot()?.phase).toBe("ready");
  const state = f.model.getSnapshot();
  if (state.kind !== "ready" || state.threadSelection.kind !== "thread")
    throw Error("missing Thread");
  expect(state.threadSelection.thread.context).toMatchObject({
    origin: "cli",
    title: "Native CLI chat",
  });
});

it("rechecks an untrusted cached Thread when its actual directory was granted by another Thread", async () => {
  const f = await fixture(false, true);
  await new Promise((done) => setTimeout(done, 0));
  const original = f.model.runtime;
  expect(original?.getSnapshot()?.phase).toBe("browse");
  await f.model.newThread();
  f.grant();
  await f.model.selectThread(f.first.threadId);
  await new Promise((done) => setTimeout(done, 0));
  expect(f.model.runtime).toBe(original);
  expect(original?.getSnapshot()?.phase).toBe("ready");
  expect(f.requests.filter((r) => r.kind === "start")).toMatchObject([
    { threadId: f.first.threadId },
  ]);
});
it("retains native discovery's partial state beside the actual sidebar Thread list", async () => {
  const f = await fixture(false, false, { nativeIndex: "partial" });
  await new Promise((done) => setTimeout(done, 0));
  expect(f.model.threadListStore.getState()).toMatchObject({
    nativeIndex: "partial",
    failed: false,
  });
  expect(f.model.threadListStore.getState().threads[0]?.threadId).toBe(
    f.first.threadId,
  );
});

it("automatically finishes bounded native catalog pages without another user refresh", async () => {
  const f = await fixture(false, false, {
    indexPages: ["indexing", "indexing", "ready"],
  });
  await vi.waitFor(() =>
    expect(f.model.threadListStore.getState().nativeIndex).toBe("ready"),
  );
  expect(f.model.threadListStore.getState().pending).toBe(false);
});

it("suspends new automatic preparation through the close handshake and resumes after cancellation", async () => {
  const f = await fixture(true, true);
  await vi.waitFor(() =>
    expect(f.model.runtime?.getSnapshot()?.phase).toBe("ready"),
  );
  expect(await f.model.prepareClose()).toBe(true);
  const current = f.model.runtime?.getSnapshot();
  if (!current) throw Error("missing runtime");
  f.publish({ ...current, revision: current.revision + 1, phase: "allowed" });
  await new Promise((done) => setTimeout(done, 0));
  expect(f.requests.filter((r) => r.kind === "start")).toHaveLength(1);
  f.model.cancelClose();
  await vi.waitFor(() =>
    expect(f.requests.filter((r) => r.kind === "start")).toHaveLength(2),
  );
});

it("does not start a pending inspection while closing, even when inspection completes successfully", async () => {
  const f = await fixture(true, false, { origin: "cli" });
  await f.model.newThread();
  expect(await f.model.prepareClose()).toBe(true);
  f.release();
  await new Promise((done) => setTimeout(done, 0));
  expect(f.requests.filter((r) => r.kind === "start")).toHaveLength(0);
  f.model.cancelClose();
  await vi.waitFor(() =>
    expect(f.requests.filter((r) => r.kind === "start")).toHaveLength(1),
  );
});

it("prepares only once when an active Thread receives an explicit execution grant", async () => {
  const f = await fixture(false, true);
  f.grant();
  await f.model.runtime?.act("allow");
  await new Promise((done) => setTimeout(done, 0));
  expect(f.requests.map((r) => r.kind)).toEqual(["inspect", "allow", "start"]);
});

it("automatically recovers once per selection and stops repeated native crash loops", async () => {
  const f = await fixture(true, true);
  await vi.waitFor(() =>
    expect(f.model.runtime?.getSnapshot()?.phase).toBe("ready"),
  );
  const exit = () => {
    const view = f.model.runtime?.getSnapshot();
    if (!view) throw Error("missing runtime");
    f.publish({ ...view, revision: view.revision + 1, phase: "interrupted" });
  };
  exit();
  await vi.waitFor(() =>
    expect(f.requests.filter((r) => r.kind === "start")).toHaveLength(2),
  );
  await vi.waitFor(() =>
    expect(f.model.runtime?.getSnapshot()?.phase).toBe("ready"),
  );
  exit();
  await new Promise((done) => setTimeout(done, 0));
  expect(f.requests.filter((r) => r.kind === "start")).toHaveLength(2);
  await f.model.runtime?.act("start");
  expect(f.requests.filter((r) => r.kind === "start")).toHaveLength(3);
});
