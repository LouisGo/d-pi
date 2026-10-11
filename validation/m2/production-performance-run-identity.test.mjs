import assert from "node:assert/strict";
import test from "node:test";
import { assertProbeRun } from "./production-performance-run-identity.mjs";

test("completed probe evidence cannot cross application runs or a reused PID", () => {
  const ready = { applicationPid: 9619, startAt: 1791728014907 };
  const old = {
    completed: true,
    applicationPid: 5722,
    sourceRunStartAt: 1791727400000,
  };
  assert.throws(() => assertProbeRun(old, ready), /different application run/);
  assert.throws(
    () =>
      assertProbeRun({ ...old, applicationPid: ready.applicationPid }, ready),
    /different source run/,
  );
  assert.throws(() => assertProbeRun({ completed: true }, ready));
  const current = {
    ...old,
    applicationPid: ready.applicationPid,
    sourceRunStartAt: ready.startAt,
  };
  assert.equal(assertProbeRun(current, ready), current);
});
