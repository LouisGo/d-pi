import { expect, it } from "vitest";
import type { FrozenSubmission } from "../../contracts/public";
import { sameSubmissionTarget } from "./target";

type SubmissionTarget = FrozenSubmission["target"];

const target: SubmissionTarget = {
  processInstanceId: "process-a",
  connectionGeneration: "connection-a",
  configContextId: "config-a",
  nativeSessionRef: "/sessions/session-a.jsonl",
};

it("accepts two identical submission targets", () => {
  expect(sameSubmissionTarget(target, { ...target })).toBe(true);
});

it.each([
  ["processInstanceId", { processInstanceId: "process-b" }],
  ["connectionGeneration", { connectionGeneration: "connection-b" }],
  ["configContextId", { configContextId: "config-b" }],
  ["nativeSessionRef", { nativeSessionRef: "/sessions/session-b.jsonl" }],
] as const)("rejects a target with a different %s", (_field, change) => {
  expect(sameSubmissionTarget(target, { ...target, ...change })).toBe(false);
});
