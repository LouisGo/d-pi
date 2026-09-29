import { describe, expect, it } from "vitest";
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
const failure: Failure = {
  errorId: crypto.randomUUID(),
  traceId: crypto.randomUUID(),
  code: "transport-unavailable",
  category: "transport",
  observedAt: "renderer",
  reportedBy: "unknown",
  attribution: "unknown",
  handlingOwner: "draft",
  recovery: "reconcile_first",
  message: { code: "runtime.connectionUnknown" },
};
function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
}
describe("capture and consume a draft", () => {
  it("freezes A while its save is in flight; preparing A cannot accidentally capture B or clear B", async () => {
    const saving = deferred<SaveReply>();
    const writes: string[] = [];
    const c = new DraftController(
      draft,
      async (revision, text) => {
        writes.push(text);
        return writes.length === 1
          ? saving.promise
          : { kind: "saved", threadId: draft.threadId, revision: revision + 1 };
      },
      () => failure,
    );
    const prepared: string[] = [];
    try {
      c.edit("A");
      const flushing = c.flush();
      const capture = c.captureSubmission(
        crypto.randomUUID(),
        async (value) => {
          prepared.push(value.text);
          return true;
        },
      );
      c.edit("B");
      saving.resolve({ kind: "saved", threadId: draft.threadId, revision: 1 });
      const a = await capture;
      await flushing;
      expect(a).toMatchObject({ text: "A", revision: 1 });
      expect(prepared).toEqual(["A"]);
      expect(writes).toEqual(["A", "B"]);
      let cleared = false;
      expect(
        a &&
          c.consumeSubmission(a, () => {
            cleared = true;
            return true;
          }),
      ).toBe(false);
      expect(cleared).toBe(false);
    } finally {
      c.dispose();
    }
  });
});

it("lost ACK notification and a failed B save reconcile the consumed baseline without losing B", async () => {
  let available = true;
  const writes: string[] = [];
  const c = new DraftController(
    { ...draft, text: "A", revision: 1 },
    async (revision, text) => {
      if (!available) throw Error("not written");
      writes.push(text);
      return {
        kind: "saved",
        threadId: draft.threadId,
        revision: revision + 1,
      };
    },
    () => failure,
  );
  try {
    const id = crypto.randomUUID();
    await c.captureSubmission(id, async () => true);
    await c.flush();
    available = false;
    c.edit("B");
    await c.flush();
    available = true;
    await c.reconcile(async () => ({
      kind: "snapshot",
      draft: { ...draft, revision: 1, text: "", consumedBy: id },
    }));
    expect(c.getSnapshot()).toEqual({ kind: "saved" });
    expect(writes).toEqual(["B"]);
  } finally {
    c.dispose();
  }
});

it("IME can defer consumption, and undo/new edits of identical text cannot be cleared by A", async () => {
  const writes: string[] = [];
  const c = new DraftController(
    { ...draft, text: "A", revision: 1 },
    async (revision, text) => {
      writes.push(text);
      return {
        kind: "saved",
        threadId: draft.threadId,
        revision: revision + 1,
      };
    },
    () => failure,
  );
  try {
    const a = await c.captureSubmission(crypto.randomUUID(), async () => true);
    if (!a) throw Error("missing frozen A");
    expect(c.consumeSubmission(a, () => false)).toBe(false);
    c.edit("A");
    expect(c.consumeSubmission(a, () => true)).toBe(false);
    await c.flush();
    expect(writes).toEqual(["A"]);
  } finally {
    c.dispose();
  }
});

it("consumption clears once through the existing save lane, preserving new B during that write", async () => {
  const saving = deferred<SaveReply>();
  const writes: string[] = [];
  const c = new DraftController(
    { ...draft, text: "A", revision: 1 },
    async (revision, text) => {
      writes.push(text);
      return writes.length === 1
        ? saving.promise
        : { kind: "saved", threadId: draft.threadId, revision: revision + 1 };
    },
    () => failure,
  );
  try {
    const a = await c.captureSubmission(crypto.randomUUID(), async () => true);
    if (!a) throw Error("missing A");
    await c.flush();
    expect(c.consumeSubmission(a, () => true)).toBe(true);
    const flushing = c.flush();
    expect(c.consumeSubmission(a, () => true)).toBe(false);
    c.edit("B");
    saving.resolve({ kind: "saved", threadId: draft.threadId, revision: 2 });
    await flushing;
    expect(writes).toEqual(["", "B"]);
  } finally {
    c.dispose();
  }
});

it("restores only the matching saved draft capture and protects edits made after recovery", () => {
  const c = new DraftController(
    { ...draft, text: "A", revision: 1 },
    async (revision) => ({
      kind: "saved",
      threadId: draft.threadId,
      revision: revision + 1,
    }),
    () => failure,
  );
  const value = { submissionId: crypto.randomUUID(), revision: 1, text: "A" };
  try {
    expect(c.restorePreparedSubmission({ ...value, revision: 2 })).toBeNull();
    expect(c.restorePreparedSubmission({ ...value, text: "B" })).toBeNull();
    const captured = c.restorePreparedSubmission(value);
    expect(captured).toMatchObject({ ...value, sequence: 0 });
    c.edit("B");
    expect(c.restorePreparedSubmission(value)).toBeNull();
    let cleared = false;
    expect(
      captured &&
        c.consumeSubmission(captured, () => {
          cleared = true;
          return true;
        }),
    ).toBe(false);
    expect(cleared).toBe(false);
  } finally {
    c.dispose();
  }
});
