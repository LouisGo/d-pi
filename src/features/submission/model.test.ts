import { expect, it } from "vitest";
import { ThreadIdSchema } from "../../shared/identity";
import { DraftSchema } from "../draft/contracts";
import { DraftController } from "../draft/controller";
import { SubmissionReceiptSchema, type SubmissionReply } from "./contracts";
import { mergeReceipt, SubmissionModel } from "./model";

it("merges receipts monotonically: wall-clock never reorders causal facts (A3 lock)", () => {
  const base = {
    submissionId: crypto.randomUUID(),
    threadId: crypto.randomUUID(),
    traceId: crypto.randomUUID(),
    revision: 1,
    text: "A",
    requestId: crypto.randomUUID(),
    target: {
      processInstanceId: crypto.randomUUID(),
      connectionGeneration: crypto.randomUUID(),
      configContextId: "cfg",
      nativeSessionRef: "s",
    },
    createdAt: "2026-09-29T00:00:00.000Z",
    updatedAt: "2026-09-29T00:00:00.000Z",
    acknowledgedAt: null,
  } as const;
  const receipt = (state: string, outcome = "unobserved", updatedAt?: string) =>
    SubmissionReceiptSchema.parse({
      ...base,
      state,
      outcome,
      ...(updatedAt ? { updatedAt } : {}),
    });
  // rejected and acknowledged are terminal: late replies cannot revive them.
  expect(mergeReceipt(receipt("rejected"), receipt("acknowledged")).state).toBe(
    "rejected",
  );
  expect(mergeReceipt(receipt("acknowledged"), receipt("prepared")).state).toBe(
    "acknowledged",
  );
  // unknown never regresses to prepared/dispatching.
  expect(mergeReceipt(receipt("unknown"), receipt("prepared")).state).toBe(
    "unknown",
  );
  expect(mergeReceipt(receipt("unknown"), receipt("dispatching")).state).toBe(
    "unknown",
  );
  // dispatching never regresses to prepared.
  expect(mergeReceipt(receipt("dispatching"), receipt("prepared")).state).toBe(
    "dispatching",
  );
  // failed outcome sticks even when state advances to acknowledged.
  expect(
    mergeReceipt(receipt("dispatching"), receipt("acknowledged", "failed")),
  ).toMatchObject({ state: "acknowledged", outcome: "failed" });
  // updatedAt is display metadata (max), not causal ordering.
  expect(
    mergeReceipt(
      receipt("acknowledged", "unobserved", "2026-09-29T00:00:02.000Z"),
      receipt("acknowledged", "unobserved", "2026-09-29T00:00:01.000Z"),
    ).updatedAt,
  ).toBe("2026-09-29T00:00:02.000Z");
});

it("freezes A before dispatch, consumes only its unchanged edit sequence, and deduplicates ACK", async () => {
  const draft = DraftSchema.parse({
    schemaVersion: 1,
    threadId: crypto.randomUUID(),
    workspaceId: crypto.randomUUID(),
    directory: "/p",
    revision: 1,
    text: "A",
  });
  const c = new DraftController(
    draft,
    async (revision) => ({
      kind: "saved",
      threadId: draft.threadId,
      revision: revision + 1,
    }),
    () => {
      throw Error("save failed");
    },
  );
  let receive: (r: SubmissionReply) => void = () => {};
  let receipt: ReturnType<typeof SubmissionReceiptSchema.parse>;
  const m = new SubmissionModel(
    {
      subscribe(cb) {
        receive = cb;
        return () => {};
      },
      async request(command) {
        if (command.kind === "list") return { kind: "list", receipts: [] };
        if (command.kind === "prepare") {
          const { kind: _kind, ...value } = command;
          receipt = SubmissionReceiptSchema.parse({
            ...value,
            target: {
              processInstanceId: crypto.randomUUID(),
              connectionGeneration: crypto.randomUUID(),
              configContextId: "cfg",
              nativeSessionRef: "s",
            },
            requestId: crypto.randomUUID(),
            state: "prepared",
            acknowledgedAt: null,
            outcome: "unobserved",
            createdAt: "now",
            updatedAt: "now",
          });
        }
        return { kind: "receipt", receipt };
      },
    },
    draft.threadId,
    c,
  );
  let clears = 0;
  m.replace = () => {
    clears++;
    return true;
  };
  await m.send();
  c.edit("B");
  receive({
    kind: "receipt",
    receipt: { ...receipt!, state: "acknowledged", acknowledgedAt: "now" },
  });
  expect(clears).toBe(0);
  expect(m.getSnapshot().receipts[0]?.text).toBe("A");
  m.dispose();
  c.dispose();
});

it("sends follow-up text without capturing or consuming the draft", async () => {
  const draft = DraftSchema.parse({
    schemaVersion: 1,
    threadId: crypto.randomUUID(),
    workspaceId: crypto.randomUUID(),
    directory: "/p",
    revision: 1,
    text: "B",
  });
  const c = new DraftController(
    draft,
    async (revision) => ({
      kind: "saved",
      threadId: draft.threadId,
      revision: revision + 1,
    }),
    () => {
      throw Error("save failed");
    },
  );
  const requests: unknown[] = [];
  let prepared: ReturnType<typeof SubmissionReceiptSchema.parse> | null = null;
  const m = new SubmissionModel(
    {
      subscribe() {
        return () => {};
      },
      async request(command) {
        requests.push(command);
        if (command.kind === "list") return { kind: "list", receipts: [] };
        if (command.kind === "prepare") {
          const { kind: _kind, ...value } = command;
          prepared = SubmissionReceiptSchema.parse({
            ...value,
            target: {
              processInstanceId: crypto.randomUUID(),
              connectionGeneration: crypto.randomUUID(),
              configContextId: "cfg",
              nativeSessionRef: "s",
            },
            requestId: crypto.randomUUID(),
            state: "prepared",
            acknowledgedAt: null,
            outcome: "unobserved",
            createdAt: "now",
            updatedAt: "now",
          });
          return { kind: "receipt", receipt: prepared };
        }
        return {
          kind: "receipt",
          receipt: { ...prepared!, state: "dispatching" },
        };
      },
    },
    draft.threadId,
    c,
  );
  let clears = 0;
  m.replace = () => {
    clears++;
    return true;
  };
  await m.sendText("late answer", "followUp");
  expect(requests).toContainEqual(
    expect.objectContaining({
      kind: "prepare",
      text: "late answer",
      delivery: "followUp",
      origin: "free",
    }),
  );
  expect(requests).toContainEqual(
    expect.objectContaining({ kind: "dispatch" }),
  );
  expect(m.getSnapshot().receipts[0]?.text).toBe("late answer");
  expect(clears).toBe(0);
  await m.sendText("   ");
  expect(requests).toHaveLength(3);
  m.dispose();
  c.dispose();
});

it("reports follow-up honesty: success only after dispatch, failure message otherwise", async () => {
  const threadId = ThreadIdSchema.parse(crypto.randomUUID());
  const replies: unknown[] = [];
  const controller = new DraftController(
    DraftSchema.parse({
      schemaVersion: 1,
      threadId,
      workspaceId: crypto.randomUUID(),
      directory: "/p",
      revision: 1,
      text: "B",
    }),
    async (revision) => ({
      kind: "saved",
      threadId,
      revision: revision + 1,
    }),
    () => {
      throw Error("save failed");
    },
  );
  const m = new SubmissionModel(
    {
      subscribe() {
        return () => {};
      },
      async request(command) {
        if (command.kind === "list") return { kind: "list", receipts: [] };
        if (command.kind === "prepare") {
          if (command.text === "overflow")
            return {
              kind: "failed",
              code: "queue-full",
              error: {
                errorId: crypto.randomUUID(),
                traceId: command.traceId,
                code: "queue-full",
                observedAt: "main",
                reportedBy: "app",
                attribution: "unknown",
                handlingOwner: "submission",
                recovery: "user_action",
                safeMessage: "排队已满。",
              },
            };
          const { kind: _kind, ...value } = command;
          const prepared = SubmissionReceiptSchema.parse({
            ...value,
            target: {
              processInstanceId: crypto.randomUUID(),
              connectionGeneration: crypto.randomUUID(),
              configContextId: "cfg",
              nativeSessionRef: "s",
            },
            requestId: crypto.randomUUID(),
            state: "prepared",
            acknowledgedAt: null,
            outcome: "unobserved",
            createdAt: "now",
            updatedAt: "now",
          });
          replies.push(prepared);
          return { kind: "receipt", receipt: prepared };
        }
        const prepared = replies.at(-1) as ReturnType<
          typeof SubmissionReceiptSchema.parse
        >;
        return {
          kind: "receipt",
          receipt: { ...prepared, state: "dispatching" },
        };
      },
    },
    threadId,
    controller,
  );
  const sent = await m.sendText("late answer", "steer");
  expect(sent.ok).toBe(true);
  expect(sent.message).toBeNull();
  expect(sent.submissionId).toEqual(expect.any(String));
  expect(m.getSnapshot().receipts[0]?.submissionId).toBe(sent.submissionId);
  const refused = await m.sendText("overflow", "steer");
  expect(refused.ok).toBe(false);
  expect(refused.message).toContain("排队已满");
  expect(refused.submissionId).toBeNull();
  expect(await m.sendText("   ", "steer")).toEqual({
    ok: false,
    message: null,
    submissionId: null,
  });
  m.dispose();
  controller.dispose();
});

it("binds dispatch-stage failures to the formal receipt and keeps draft/text channels independent", async () => {
  const threadId = ThreadIdSchema.parse(crypto.randomUUID());
  const controller = new DraftController(
    DraftSchema.parse({
      schemaVersion: 1,
      threadId,
      workspaceId: crypto.randomUUID(),
      directory: "/p",
      revision: 1,
      text: "B",
    }),
    async (revision) => ({
      kind: "saved",
      threadId,
      revision: revision + 1,
    }),
    () => {
      throw Error("save failed");
    },
  );
  let dispatchState: "rejected" | "dispatching" = "rejected";
  const m = new SubmissionModel(
    {
      subscribe() {
        return () => {};
      },
      async request(command) {
        if (command.kind === "list") return { kind: "list", receipts: [] };
        if (command.kind === "prepare") {
          const { kind: _kind, ...value } = command;
          return {
            kind: "receipt",
            receipt: SubmissionReceiptSchema.parse({
              ...value,
              target: {
                processInstanceId: crypto.randomUUID(),
                connectionGeneration: crypto.randomUUID(),
                configContextId: "cfg",
                nativeSessionRef: "s",
              },
              requestId: crypto.randomUUID(),
              state: "prepared",
              acknowledgedAt: null,
              outcome: "unobserved",
              createdAt: "now",
              updatedAt: "now",
            }),
          };
        }
        const prepared = m
          .getSnapshot()
          .receipts.find((r) => r.submissionId === command.submissionId);
        return {
          kind: "receipt",
          receipt: { ...prepared!, state: dispatchState },
        };
      },
    },
    threadId,
    controller,
  );
  // Dispatch-stage rejected still binds the formal receipt identity.
  const rejected = await m.sendText("blocked", "steer");
  expect(rejected.ok).toBe(false);
  expect(rejected.submissionId).toEqual(expect.any(String));
  expect(
    m
      .getSnapshot()
      .receipts.find((r) => r.submissionId === rejected.submissionId)?.state,
  ).toBe("rejected");
  // Draft and free-text channels do not head-block each other.
  dispatchState = "dispatching";
  const a = m.sendText("concurrent-text", "steer");
  // Simulate a draft send in flight by directly publishing sending (unit-level:
  // send() and sendText() use independent flags).
  expect(m.getSnapshot().sendingText).toBe(true);
  expect(m.getSnapshot().sending).toBe(false);
  const done = await a;
  expect(done.ok).toBe(true);
  m.dispose();
  controller.dispose();
});

it("releases only the rejected capture so unchanged text can be explicitly sent with a new identity", async () => {
  const draft = DraftSchema.parse({
    schemaVersion: 1,
    threadId: crypto.randomUUID(),
    workspaceId: crypto.randomUUID(),
    directory: "/fixture",
    revision: 1,
    text: "A",
  });
  const saves: string[] = [];
  const controller = new DraftController(
    draft,
    async (revision, text) => {
      saves.push(text);
      return {
        kind: "saved",
        threadId: draft.threadId,
        revision: revision + 1,
      };
    },
    () => {
      throw Error("unexpected save failure");
    },
  );
  const prepared: ReturnType<typeof SubmissionReceiptSchema.parse>[] = [];
  const dispatched: string[] = [];
  let receive: (reply: SubmissionReply) => void = () => {};
  const model = new SubmissionModel(
    {
      subscribe(cb) {
        receive = cb;
        return () => {};
      },
      async request(command) {
        if (command.kind === "list") return { kind: "list", receipts: [] };
        if (command.kind === "prepare") {
          const { kind: _kind, ...value } = command;
          const receipt = SubmissionReceiptSchema.parse({
            ...value,
            target: {
              processInstanceId: crypto.randomUUID(),
              connectionGeneration: crypto.randomUUID(),
              configContextId: "cfg",
              nativeSessionRef: "s",
            },
            requestId: crypto.randomUUID(),
            state: "prepared",
            acknowledgedAt: null,
            outcome: "unobserved",
            createdAt: "1",
            updatedAt: "1",
          });
          prepared.push(receipt);
          return { kind: "receipt", receipt };
        }
        const receipt = prepared.find(
          (r) => r.submissionId === command.submissionId,
        );
        if (!receipt) throw Error("missing receipt");
        dispatched.push(command.submissionId);
        return {
          kind: "receipt",
          receipt: {
            ...receipt,
            state: dispatched.length === 1 ? "rejected" : "dispatching",
            updatedAt: "2",
          },
        };
      },
    },
    draft.threadId,
    controller,
  );
  try {
    await model.send();
    await model.send();
    expect(prepared).toHaveLength(2);
    expect(prepared.map((r) => [r.text, r.revision])).toEqual([
      ["A", 1],
      ["A", 1],
    ]);
    expect(new Set(dispatched).size).toBe(2);
    const first = prepared[0];
    const second = prepared[1];
    if (!first || !second) throw Error("missing captures");
    // A delayed rejection of A must not unlock the subsequent in-flight attempt.
    receive({
      kind: "receipt",
      receipt: { ...first, state: "rejected", updatedAt: "3" },
    });
    await model.send();
    expect(dispatched).toHaveLength(2);
    receive({
      kind: "receipt",
      receipt: {
        ...second,
        state: "unknown",
        outcome: "unknown",
        updatedAt: "4",
      },
    });
    await model.send();
    expect(dispatched).toHaveLength(2);
    expect(saves).toEqual([]);
  } finally {
    model.dispose();
    controller.dispose();
  }
});

it.each(["rejected", "unknown", "failed-after-ack"] as const)(
  "does not overwrite observed %s with a same-millisecond stale reply",
  async (result) => {
    const draft = DraftSchema.parse({
      schemaVersion: 1,
      threadId: crypto.randomUUID(),
      workspaceId: crypto.randomUUID(),
      directory: "/fixture",
      revision: 1,
      text: "A",
    });
    const controller = new DraftController(
      draft,
      async (revision) => ({
        kind: "saved",
        threadId: draft.threadId,
        revision: revision + 1,
      }),
      () => {
        throw Error("unexpected failure");
      },
    );
    let receive: (reply: SubmissionReply) => void = () => {};
    let prepared: ReturnType<typeof SubmissionReceiptSchema.parse> | undefined;
    const model = new SubmissionModel(
      {
        subscribe(cb) {
          receive = cb;
          return () => {};
        },
        async request(command) {
          if (command.kind === "list") return { kind: "list", receipts: [] };
          if (command.kind === "prepare") {
            const { kind: _kind, ...value } = command;
            prepared = SubmissionReceiptSchema.parse({
              ...value,
              target: {
                processInstanceId: crypto.randomUUID(),
                connectionGeneration: crypto.randomUUID(),
                configContextId: "cfg",
                nativeSessionRef: "s",
              },
              requestId: crypto.randomUUID(),
              state: "prepared",
              acknowledgedAt: null,
              outcome: "unobserved",
              createdAt: "now",
              updatedAt: "now",
            });
            return { kind: "receipt", receipt: prepared };
          }
          if (!prepared) throw Error("missing prepare");
          const stale = {
            ...prepared,
            state:
              result === "failed-after-ack"
                ? ("acknowledged" as const)
                : ("dispatching" as const),
            acknowledgedAt: result === "failed-after-ack" ? "now" : null,
          };
          receive({
            kind: "receipt",
            receipt: {
              ...stale,
              state: result === "failed-after-ack" ? "acknowledged" : result,
              outcome:
                result === "failed-after-ack"
                  ? "failed"
                  : result === "unknown"
                    ? "unknown"
                    : "unobserved",
            },
          });
          return { kind: "receipt", receipt: stale };
        },
      },
      draft.threadId,
      controller,
    );
    try {
      await model.send();
      expect(model.getSnapshot().receipts[0]).toMatchObject(
        result === "failed-after-ack"
          ? { state: "acknowledged", outcome: "failed" }
          : { state: result },
      );
      if (result === "unknown" && prepared) {
        receive({
          kind: "receipt",
          receipt: {
            ...prepared,
            state: "acknowledged",
            acknowledgedAt: "later",
            updatedAt: "zz",
            outcome: "unknown",
          },
        });
        expect(model.getSnapshot().receipts[0]).toMatchObject({
          state: "acknowledged",
          outcome: "unknown",
        });
      }
    } finally {
      model.dispose();
      controller.dispose();
    }
  },
);
