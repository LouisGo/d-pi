import { expect, it } from "vitest";
import {
  FrozenSubmissionSchema,
  SubmissionEventSchema,
  SubmissionReceiptSchema,
} from "./submission";

const frozen = FrozenSubmissionSchema.parse({
  submissionId: crypto.randomUUID(),
  threadId: crypto.randomUUID(),
  traceId: crypto.randomUUID(),
  requestId: crypto.randomUUID(),
  revision: 1,
  text: "frozen source",
  target: {
    processInstanceId: crypto.randomUUID(),
    connectionGeneration: crypto.randomUUID(),
    configContextId: "isolated",
    nativeSessionRef: "/fixture/session.jsonl",
  },
});
const prepared = {
  ...frozen,
  state: "prepared",
  acknowledgedAt: null,
  outcome: "unobserved",
  createdAt: "created",
  updatedAt: "updated",
};

it("rejects receipt combinations that invent ACK or carry refusal facts into another state", () => {
  const impossible = [
    { state: "prepared", acknowledgedAt: "ack" },
    { state: "dispatching", acknowledgedAt: "ack" },
    { state: "unknown", acknowledgedAt: "ack" },
    { state: "rejected", acknowledgedAt: "ack" },
    { state: "acknowledged", acknowledgedAt: null },
    { state: "prepared", outcome: "failed" },
    { state: "dispatching", outcome: "unknown" },
    { state: "rejected", outcome: "failed" },
    { state: "unknown", rejectionReason: "paused" },
    { state: "acknowledged", acknowledgedAt: "ack", rejectionReason: "paused" },
  ];
  for (const patch of impossible) {
    expect(
      SubmissionReceiptSchema.safeParse({ ...prepared, ...patch }).success,
      JSON.stringify(patch),
    ).toBe(false);
  }
});

it("retains legacy reasonless refusals and independent unknown or failed execution evidence", () => {
  expect(
    SubmissionReceiptSchema.parse({ ...prepared, state: "rejected" }),
  ).toMatchObject({
    state: "rejected",
    acknowledgedAt: null,
    outcome: "unobserved",
  });
  for (const outcome of ["unobserved", "unknown", "failed"] as const) {
    expect(
      SubmissionReceiptSchema.parse({ ...prepared, state: "unknown", outcome })
        .outcome,
    ).toBe(outcome);
    expect(
      SubmissionReceiptSchema.parse({
        ...prepared,
        state: "acknowledged",
        acknowledgedAt: "legacy ACK time",
        outcome,
      }).outcome,
    ).toBe(outcome);
  }
});

it("rejects refusal reasons on ACK, error and disconnect events", () => {
  const event = {
    submissionId: frozen.submissionId,
    requestId: frozen.requestId,
    target: frozen.target,
  };
  for (const kind of ["ack", "error", "disconnected"] as const) {
    expect(
      SubmissionEventSchema.safeParse({ ...event, kind, reason: "paused" })
        .success,
    ).toBe(false);
  }
  expect(SubmissionEventSchema.parse({ ...event, kind: "rejected" }).kind).toBe(
    "rejected",
  );
  expect(
    SubmissionEventSchema.parse({
      ...event,
      kind: "rejected",
      reason: "paused",
    }),
  ).toMatchObject({
    kind: "rejected",
    reason: "paused",
  });
});
