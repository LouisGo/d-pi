import { expect, it } from "vitest";
import { CommandSchema, EnvelopeSchema } from "./contracts";

it("rejects unknown IPC operation/fields/versions and excessive draft content", () => {
  const traceId = crypto.randomUUID();
  expect(
    CommandSchema.safeParse({ kind: "exec", traceId, command: "run" }).success,
  ).toBe(false);
  expect(
    CommandSchema.safeParse({ kind: "restore", traceId, sql: "SELECT 1" })
      .success,
  ).toBe(false);
  expect(
    CommandSchema.safeParse({
      kind: "save",
      traceId,
      threadId: crypto.randomUUID(),
      expectedRevision: 0,
      text: "x".repeat(4 * 1024 * 1024 + 1),
    }).success,
  ).toBe(false);
  expect(
    EnvelopeSchema.safeParse({
      schemaVersion: 2,
      connectionId: crypto.randomUUID(),
      requestId: crypto.randomUUID(),
      command: { kind: "restore", traceId },
    }).success,
  ).toBe(false);
});
