import assert from "node:assert/strict";

export function assertProbeRun(report, ready) {
  assert(
    Number.isSafeInteger(ready.applicationPid) && ready.applicationPid > 0,
  );
  assert(Number.isSafeInteger(ready.startAt) && ready.startAt > 0);
  assert.equal(
    report.applicationPid,
    ready.applicationPid,
    "Probe belongs to a different application run",
  );
  assert.equal(
    report.sourceRunStartAt,
    ready.startAt,
    "Probe belongs to a different source run",
  );
  return report;
}
