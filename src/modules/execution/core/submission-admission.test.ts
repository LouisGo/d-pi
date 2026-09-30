import { expect, it } from "vitest";
import { ThreadIdSchema, TraceIdSchema } from "../../../shared/identity";
import {
  SubmissionIdSchema,
  type SubmissionReceipt,
  SubmissionReceiptSchema,
} from "../contracts/public";
import { QUEUE_CAP, queueCapped, queueCount } from "./submission-admission";

function receipt(state: SubmissionReceipt["state"]): SubmissionReceipt {
  return SubmissionReceiptSchema.parse({
    submissionId: SubmissionIdSchema.parse(crypto.randomUUID()),
    threadId: ThreadIdSchema.parse(crypto.randomUUID()),
    traceId: TraceIdSchema.parse(crypto.randomUUID()),
    revision: 0,
    text: "queued",
    target: {
      processInstanceId: crypto.randomUUID(),
      connectionGeneration: crypto.randomUUID(),
      configContextId: "fixture",
      nativeSessionRef: "/sessions/session.jsonl",
    },
    requestId: crypto.randomUUID(),
    state,
    acknowledgedAt: state === "acknowledged" ? new Date(0).toISOString() : null,
    outcome: "unobserved",
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  });
}

it("counts only prepared and dispatching receipts plus the native queue", () => {
  expect(QUEUE_CAP).toBe(20);
  expect(queueCount([], 0)).toBe(0);
  expect(
    queueCount(
      [receipt("prepared"), receipt("dispatching"), receipt("acknowledged")],
      2,
    ),
  ).toBe(4);
  expect(
    queueCount(
      [receipt("unknown"), receipt("rejected"), receipt("acknowledged")],
      0,
    ),
  ).toBe(0);
});

it("caps the queue at twenty pending entries", () => {
  const full = Array.from({ length: 20 }, () => receipt("prepared"));
  expect(queueCapped(full, 0)).toBe(true);
  expect(
    queueCapped(
      Array.from({ length: 19 }, () => receipt("prepared")),
      0,
    ),
  ).toBe(false);
  expect(
    queueCapped(
      Array.from({ length: 19 }, () => receipt("prepared")),
      1,
    ),
  ).toBe(true);
});
