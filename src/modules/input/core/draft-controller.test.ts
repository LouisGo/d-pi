import { describe, expect, it, vi } from "vitest";
import { DraftSchema, type Failure, type SaveReply } from "../contracts/draft";
import { DraftController } from "./draft-controller";

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
  message: { code: "draft.storageUnavailable" },
};
describe("draft save coordination", () => {
  it("does not begin another write when a disposed Thread's pending save finishes", async () => {
    let finish: (reply: SaveReply) => void = () => {};
    const save = vi.fn((revision: number) =>
      save.mock.calls.length === 1
        ? new Promise<SaveReply>((resolve) => {
            finish = resolve;
          })
        : Promise.resolve({
            kind: "saved" as const,
            threadId: draft.threadId,
            revision: revision + 1,
          }),
    );
    const controller = new DraftController(draft, save, () => error);
    controller.edit("first write");
    const saving = controller.flush();
    controller.edit("queued second write");
    controller.dispose();
    finish({ kind: "saved", threadId: draft.threadId, revision: 1 });
    await saving;
    expect(save).toHaveBeenCalledTimes(1);
  });
  it("a failed or foreign reconciliation never releases the write guard; edits during checking survive", async () => {
    let available = false;
    const sent: string[] = [];
    const controller = new DraftController(
      draft,
      async (revision, text) => {
        if (!available) throw Error("write never reached Main");
        sent.push(text);
        return {
          kind: "saved",
          threadId: draft.threadId,
          revision: revision + 1,
        };
      },
      () => ({ ...error, recovery: "reconcile_first" }),
    );
    try {
      controller.edit("initial");
      await controller.flush();
      await controller.reconcile(async () => ({ kind: "failed", error }));
      expect(await controller.retry()).toBe(false);
      await controller.reconcile(async () => ({
        kind: "snapshot",
        draft: { ...draft, directory: "/different" },
      }));
      expect(await controller.flush()).toBe(false);
      available = true;
      let resolve: (value: { kind: "snapshot"; draft: typeof draft }) => void =
        () => {};
      const checking = controller.reconcile(
        () =>
          new Promise((accept) => {
            resolve = accept;
          }),
      );
      controller.edit("changed while checking");
      expect(await controller.flush()).toBe(false);
      resolve({ kind: "snapshot", draft });
      await checking;
      expect(sent).toEqual(["changed while checking"]);
      expect(await controller.flush()).toBe(true);
    } finally {
      controller.dispose();
    }
  });
  it("confirmed lost receipt without newer input does not issue another write", async () => {
    const save = vi.fn(async () => {
      throw Error("lost reply");
    });
    const controller = new DraftController(draft, save, () => ({
      ...error,
      recovery: "reconcile_first",
    }));
    try {
      controller.edit("committed text");
      await controller.flush();
      await controller.reconcile(async () => ({
        kind: "snapshot",
        draft: { ...draft, revision: 1, text: "committed text" },
      }));
      expect(save).toHaveBeenCalledTimes(1);
      expect(await controller.flush()).toBe(true);
    } finally {
      controller.dispose();
    }
  });
  it("shows divergent disk and local drafts, then uses CAS for an explicit local choice", async () => {
    let stored = { ...draft, revision: 3, text: "other stored draft" };
    const sent: string[] = [];
    const controller = new DraftController(
      draft,
      async (revision, text) => {
        sent.push(text);
        if (revision !== stored.revision)
          return {
            kind: "failed",
            error: { ...error, recovery: "reconcile_first" },
          };
        stored = { ...stored, revision: revision + 1, text };
        return {
          kind: "saved",
          threadId: draft.threadId,
          revision: stored.revision,
        };
      },
      () => error,
    );
    try {
      controller.edit("local draft");
      await controller.flush();
      await controller.reconcile(async () => ({
        kind: "snapshot",
        draft: stored,
      }));
      expect(controller.getSnapshot()).toMatchObject({
        kind: "conflict",
        localText: "local draft",
        stored: { revision: 3, text: "other stored draft" },
      });
      controller.edit("latest local draft");
      expect(await controller.flush()).toBe(false);
      expect(sent).toEqual(["local draft"]);
      // A writer changes the record after the displayed snapshot. Choice must not overwrite it.
      stored = { ...stored, revision: 4, text: "concurrent change" };
      expect(await controller.keepLocal()).toBe(false);
      expect(stored.text).toBe("concurrent change");
      await controller.reconcile(async () => ({
        kind: "snapshot",
        draft: stored,
      }));
      expect(await controller.keepLocal()).toBe(true);
      expect(stored).toMatchObject({ revision: 5, text: "latest local draft" });
    } finally {
      controller.dispose();
    }
  });
  it("loading the stored choice updates editor and save baseline together, respecting IME refusal", async () => {
    const stored = { ...draft, revision: 2, text: "disk choice" };
    let fail = true;
    const save = vi.fn(async (revision: number) =>
      fail
        ? {
            kind: "failed" as const,
            error: { ...error, recovery: "reconcile_first" as const },
          }
        : {
            kind: "saved" as const,
            threadId: draft.threadId,
            revision: revision + 1,
          },
    );
    const controller = new DraftController(draft, save, () => error);
    try {
      controller.edit("local choice");
      await controller.flush();
      await controller.reconcile(async () => ({
        kind: "snapshot",
        draft: stored,
      }));
      expect(controller.useStored(() => false)).toBe(false);
      expect(controller.getSnapshot().kind).toBe("conflict");
      const replace = vi.fn(() => true);
      expect(controller.useStored(replace)).toBe(true);
      expect(replace).toHaveBeenCalledWith("disk choice");
      expect(await controller.flush()).toBe(true);
      fail = false;
      controller.edit("edited disk choice");
      await controller.flush();
      expect(save).toHaveBeenLastCalledWith(2, "edited disk choice");
    } finally {
      controller.dispose();
    }
  });
  it("reconciles a committed save with a lost receipt and saves newer input before close", async () => {
    let stored = draft;
    let loseReply = true;
    const controller = new DraftController(
      draft,
      async (revision, text) => {
        expect(revision).toBe(stored.revision);
        stored = { ...stored, revision: revision + 1, text };
        if (loseReply) throw new Error("receipt lost");
        return {
          kind: "saved",
          threadId: draft.threadId,
          revision: stored.revision,
        };
      },
      () => ({ ...error, recovery: "reconcile_first" }),
    );
    try {
      controller.edit("first persisted");
      expect(await controller.flush()).toBe(false);
      controller.edit("newer local input");
      expect(await controller.retry()).toBe(false);
      loseReply = false;
      await controller.reconcile(async () => ({
        kind: "snapshot",
        draft: stored,
      }));
      expect(await controller.flush()).toBe(true);
      expect(stored).toMatchObject({ revision: 2, text: "newer local input" });
    } finally {
      controller.dispose();
    }
  });
  it("retains oversized input without sending it and resumes automatic saving after reduction", async () => {
    vi.useFakeTimers();
    const save = vi.fn(async (revision: number) => ({
      kind: "saved" as const,
      threadId: draft.threadId,
      revision: revision + 1,
    }));
    const controller = new DraftController(draft, save, () => error);
    try {
      controller.edit("中".repeat(1_500_000));
      expect(controller.getSnapshot()).toMatchObject({
        kind: "failed",
        error: { code: "content-too-large" },
      });
      await vi.advanceTimersByTimeAsync(400);
      expect(save).not.toHaveBeenCalled();
      controller.edit("缩减后的正文");
      await vi.advanceTimersByTimeAsync(300);
      expect(save).toHaveBeenCalledWith(0, "缩减后的正文");
      expect(controller.getSnapshot().kind).toBe("saved");
    } finally {
      controller.dispose();
      vi.useRealTimers();
    }
  });
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
