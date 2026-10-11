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

afterEach(() => vi.unstubAllGlobals());
async function fixture() {
  vi.stubGlobal("document", { documentElement: { dataset: {} } });
  const drafts = Array.from({ length: 4 }, (_, index) =>
    DraftSchema.parse({
      schemaVersion: 1,
      threadId: crypto.randomUUID(),
      workingDirectoryId: crypto.randomUUID(),
      directory: "/fixture",
      text: `draft ${index}`,
      revision: 0,
    }),
  );
  let current = drafts[0];
  const views = new Map<string, RuntimeView>();
  const listeners = new Set<(view: RuntimeView) => void>();
  const inspected: string[] = [];
  const reading = new Map<string, number>();
  const bridge: DesktopBridge = {
    conversation: {
      connect: (threadId) => {
        reading.set(threadId, (reading.get(threadId) ?? 0) + 1);
        return () => reading.set(threadId, (reading.get(threadId) ?? 0) - 1);
      },
    },
    request: async (command) => {
      if (command.kind === "list-threads")
        return parseDesktopReply(command, { kind: "threads", threads: drafts });
      if (command.kind === "select-thread")
        current = drafts.find((draft) => draft.threadId === command.threadId);
      if (!current) throw Error("missing draft");
      return parseDesktopReply(command, {
        kind: "ready",
        draft: current,
        directoryAvailable: true,
        preferences: { theme: "light", density: "normal", locale: "system" },
      });
    },
    runtime: {
      subscribe: (listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      request: async (command) => {
        inspected.push(command.threadId);
        const view =
          views.get(command.threadId) ??
          RuntimeViewSchema.parse({
            threadId: command.threadId,
            traceId: command.traceId,
            revision: 0,
            phase: "ready",
            trusted: true,
            busy: false,
            model: "fixture/model",
            configuration: { code: "runtime.configDefault" },
            message: { code: "runtime.readyToSend" },
          });
        views.set(command.threadId, view);
        return { kind: "view", view };
      },
    },
    onCloseRequest: () => () => {},
    onCloseCancelled: () => () => {},
    completeClose: () => {},
  };
  const model = new AppModel(bridge, 2);
  await model.start();
  const select = async (index: number) => {
    const draft = drafts[index];
    if (!draft) throw Error("missing fixture");
    await model.selectThread(draft.threadId);
    await Promise.resolve();
    return model.runtime;
  };
  return {
    model,
    drafts,
    inspected,
    reading,
    select,
    busy: (index: number, busy: boolean) => {
      const draft = drafts[index];
      const previous = draft && views.get(draft.threadId);
      if (!previous) throw Error("missing view");
      const view = { ...previous, revision: previous.revision + 1, busy };
      views.set(view.threadId, view);
      for (const listener of listeners) listener(view);
    },
  };
}
it("releases background transcript demand while runtime facts continue, and reacquires on selection", async () => {
  const f = await fixture();
  try {
    const a = f.drafts[0];
    if (!a) throw Error("missing first draft");
    const state = f.model.getSnapshot();
    if (state.kind !== "ready" || state.threadSelection.kind !== "thread")
      throw Error("missing selected thread");
    const release = state.threadSelection.thread.retainReading();
    const runtime = f.model.runtime;
    expect(f.reading.get(a.threadId)).toBe(1);
    f.busy(0, true);
    await f.select(1);
    expect(f.reading.get(a.threadId)).toBe(0);
    expect(runtime?.getSnapshot()?.busy).toBe(true);
    f.busy(0, false);
    expect(runtime?.getSnapshot()?.busy).toBe(false);
    await f.select(0);
    expect(f.reading.get(a.threadId)).toBe(1);
    release();
  } finally {
    f.model.dispose();
  }
});
it("shares a selected transcript lease and keeps runtime facts after the last reader closes", async () => {
  const f = await fixture();
  try {
    const a = f.drafts[0];
    if (!a) throw Error("missing thread");
    const state = f.model.getSnapshot();
    if (state.kind !== "ready" || state.threadSelection.kind !== "thread")
      throw Error("missing selected thread");
    const thread = state.threadSelection.thread;
    expect(f.reading.get(a.threadId) ?? 0).toBe(0);
    const releaseFirst = thread.retainReading();
    const releaseSecond = thread.retainReading();
    expect(f.reading.get(a.threadId)).toBe(1);
    releaseFirst();
    expect(f.reading.get(a.threadId)).toBe(1);
    releaseSecond();
    releaseSecond();
    expect(f.reading.get(a.threadId)).toBe(0);
    f.busy(0, true);
    expect(f.model.runtime?.getSnapshot()?.busy).toBe(true);
    expect(f.reading.get(a.threadId)).toBe(0);
    const releaseAgain = thread.retainReading();
    expect(f.reading.get(a.threadId)).toBe(1);
    releaseAgain();
  } finally {
    f.model.dispose();
  }
});
it("rechecks the idle cache budget when a background reading lease is released", async () => {
  const f = await fixture();
  try {
    const state = f.model.getSnapshot();
    if (state.kind !== "ready" || state.threadSelection.kind !== "thread")
      throw Error("missing selected thread");
    const owner = state.threadSelection.thread;
    const release = owner.retainReading();
    await f.select(1);
    await f.select(2);
    expect(owner.runtime?.stateStore.getState().disposed).toBe(false);
    release();
    await Promise.resolve();
    expect(owner.runtime?.stateStore.getState().disposed).toBe(true);
  } finally {
    f.model.dispose();
  }
});
it("reuses complete Thread resources, touches visits, and evicts the least recent idle owner at capacity", async () => {
  const f = await fixture();
  try {
    const a = f.model.runtime;
    const b = await f.select(1);
    expect(await f.select(0)).toBe(a);
    await f.select(2);
    expect(a?.stateStore.getState().disposed).toBe(false);
    expect(b?.stateStore.getState().disposed).toBe(true);
    const reopened = await f.select(1);
    expect(reopened).not.toBe(b);
    expect(f.model.controller?.getTextSnapshot()).toBe("draft 1");
    expect(
      f.inspected.filter((id) => id === f.drafts[1]?.threadId),
    ).toHaveLength(2);
  } finally {
    f.model.dispose();
  }
});
it("pins background work, then retires its old projection after it becomes idle without a stop command", async () => {
  const f = await fixture();
  try {
    const b = await f.select(1);
    f.busy(1, true);
    await f.select(2);
    await f.select(3);
    expect(b?.stateStore.getState().disposed).toBe(false);
    f.busy(1, false);
    await Promise.resolve();
    expect(b?.stateStore.getState().disposed).toBe(true);
  } finally {
    f.model.dispose();
  }
});
