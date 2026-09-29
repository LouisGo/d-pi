import { expect, it } from "vitest";
import { CommandSchema, EnvelopeSchema } from "./desktop-bridge";

it("bounds draft UTF-8 bytes rather than UTF-16 string length", () => {
  const command = {
    kind: "save",
    traceId: crypto.randomUUID(),
    threadId: crypto.randomUUID(),
    expectedRevision: 0,
  };
  const boundary = "中".repeat(Math.floor((4 * 1024 * 1024) / 3)) + "x";
  expect(CommandSchema.safeParse({ ...command, text: boundary }).success).toBe(
    true,
  );
  expect(
    CommandSchema.safeParse({ ...command, text: boundary + "x" }).success,
  ).toBe(false);
  expect(
    CommandSchema.safeParse({ ...command, text: "😀".repeat(1024 * 1024 + 1) })
      .success,
  ).toBe(false);
});

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
