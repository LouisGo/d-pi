import { expect, it } from "vitest";
import { DraftSchema } from "../draft/contracts";
import { DraftController } from "../draft/controller";
import { SubmissionReceiptSchema, type SubmissionReply } from "./contracts";
import { SubmissionModel } from "./model";

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
