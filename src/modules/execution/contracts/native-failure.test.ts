import { expect, it } from "vitest";
import { HostMessageSchema } from "./host";
import {
  type NativeFailureSummary,
  NativeFailureSummarySchema,
  nativeFailureCode,
} from "./native-failure";

it.each([
  [{ kind: "spawn", operation: "startup" }, "native-spawn"],
  [{ kind: "protocol", operation: "get_state" }, "native-protocol"],
  [{ kind: "write", operation: "write" }, "native-write"],
  [
    { kind: "timeout", operation: "get_state", timeoutMs: 30000 },
    "native-timeout",
  ],
  [{ kind: "interrupted", operation: "get_state" }, "native-interrupted"],
  [{ kind: "unavailable", operation: "startup" }, "native-unavailable"],
  [
    { kind: "unavailable", operation: "get_state", budget: "request-limit" },
    "native-request-limit",
  ],
  [
    { kind: "write", operation: "write", budget: "input-budget" },
    "native-input-budget",
  ],
] satisfies [NativeFailureSummary, string][])(
  "maps %j to the fixed diagnostic code %s",
  (failure, code) => {
    expect(nativeFailureCode(NativeFailureSummarySchema.parse(failure))).toBe(
      code,
    );
  },
);

it("rejects raw causes, arbitrary operation strings and invalid request identity at the trusted Host boundary", () => {
  for (const failure of [
    { kind: "protocol", operation: "get_state", cause: "API_KEY=secret" },
    { kind: "write", operation: "API_KEY=secret" },
    { kind: "write", operation: "write", requestId: "business-content" },
    { kind: "timeout", operation: "get_state", timeoutMs: -1 },
  ])
    expect(
      HostMessageSchema.safeParse({
        kind: "failed",
        code: "runtime-unavailable",
        nativeFailure: failure,
      }).success,
    ).toBe(false);
});
