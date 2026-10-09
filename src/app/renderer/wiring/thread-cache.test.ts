import { afterEach, expect, it, vi } from "vitest";
import {
  type RuntimeView,
  RuntimeViewSchema,
} from "../../../modules/execution/contracts/public";
import { DraftSchema } from "../../../modules/input/contracts/public";
import type { DesktopBridge } from "../../contracts/desktop-bridge";
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
  const bridge: DesktopBridge = {
    request: async (command) => {
      if (command.kind === "list-threads")
        return { kind: "threads", threads: drafts };
      if (command.kind === "select-thread")
        current = drafts.find((draft) => draft.threadId === command.threadId);
      if (!current) throw Error("missing draft");
      return {
        kind: "ready",
        draft: current,
        directoryAvailable: true,
        preferences: { theme: "light", density: "normal", locale: "system" },
      };
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
