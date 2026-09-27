import { describe, expect, it, vi } from "vitest";
import {
  DraftSchema,
  type Failure,
  type SaveReply,
} from "../../shared/contracts";
import { DraftController } from "./controller";

const draft = DraftSchema.parse({
  schemaVersion: 1,
  threadId: crypto.randomUUID(),
  workspaceId: crypto.randomUUID(),
  directory: "/fixture",
  revision: 0,
  text: "",
});
const error: Failure = {
  errorId: crypto.randomUUID(),
  traceId: crypto.randomUUID(),
  code: "storage-unavailable",
  category: "storage",
  observedAt: "main",
  reportedBy: "app",
  attribution: "unknown",
  handlingOwner: "draft",
  recovery: "user_action",
  safeMessage: "failed",
};
describe("draft save coordination", () => {
  it("automatically saves the latest edit after the idle interval without a manual flush", async () => {
    vi.useFakeTimers();
    const persisted: string[] = [];
    const controller = new DraftController(
      draft,
      async (revision, text) => {
        persisted.push(text);
        return {
          kind: "saved",
          threadId: draft.threadId,
          revision: revision + 1,
        };
      },
      () => error,
    );
    try {
      controller.edit("first");
      await vi.advanceTimersByTimeAsync(200);
      controller.edit("latest");
      await vi.advanceTimersByTimeAsync(299);
      expect(persisted).toEqual([]);
      expect(controller.getSnapshot().kind).toBe("dirty");
      await vi.advanceTimersByTimeAsync(1);
      expect(persisted).toEqual(["latest"]);
      expect(controller.getSnapshot().kind).toBe("saved");
    } finally {
      controller.dispose();
      vi.useRealTimers();
    }
  });

  it("late receipt cannot mark newer text saved; close waits for both versions", async () => {
    const waiting: Array<(reply: SaveReply) => void> = [];
    const sent: Array<{ revision: number; text: string }> = [];
    const controller = new DraftController(
      draft,
      (revision, text) => {
        sent.push({ revision, text });
        return new Promise((resolve) => waiting.push(resolve));
      },
      () => error,
    );
    controller.edit("first");
    const close = controller.flush();
    controller.edit("newer");
    waiting[0]?.({ kind: "saved", threadId: draft.threadId, revision: 1 });
    await Promise.resolve();
    expect(controller.getSnapshot().kind).not.toBe("saved");
    expect(sent[1]).toEqual({ revision: 1, text: "newer" });
    waiting[1]?.({ kind: "saved", threadId: draft.threadId, revision: 2 });
    expect(await close).toBe(true);
    expect(controller.getSnapshot()).toEqual({ kind: "saved" });
    controller.dispose();
  });
  it("failure preserves latest snapshot and requires explicit retry", async () => {
    let fail = true;
    const sent: string[] = [];
    const controller = new DraftController(
      draft,
      async (revision, text) => {
        sent.push(text);
        return fail
          ? { kind: "failed", error }
          : { kind: "saved", threadId: draft.threadId, revision: revision + 1 };
      },
      () => error,
    );
    controller.edit("old");
    expect(await controller.flush()).toBe(false);
    controller.edit("new");
    expect(await controller.flush()).toBe(false);
    expect(sent).toEqual(["old"]);
    fail = false;
    expect(await controller.retry()).toBe(true);
    expect(sent).toEqual(["old", "new"]);
    controller.dispose();
  });
  it("unknown transport outcome is not automatically retried", async () => {
    const unknown = { ...error, recovery: "reconcile_first" as const };
    let calls = 0;
    const controller = new DraftController(
      draft,
      async () => {
        calls++;
        throw Error("connection");
      },
      () => unknown,
    );
    controller.edit("keep");
    expect(await controller.flush()).toBe(false);
    expect(await controller.retry()).toBe(false);
    expect(calls).toBe(1);
    controller.dispose();
  });
});
