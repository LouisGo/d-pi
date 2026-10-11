import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createCdpClient } from "./cdp.mjs";
import { assertProbeRun } from "./production-performance-run-identity.mjs";

const root = process.env.D_PI_PERFORMANCE_ROOT;
assert(root, "Missing owned performance root");
const ready = JSON.parse(
  readFileSync(join(root, "production-probe-ready.json"), "utf8"),
);
const dataset = JSON.parse(readFileSync(join(root, "dataset.json"), "utf8"));
const path = join(root, "production-cleanup.json");
const mode = process.argv[2];
assert(
  ["stop", "finish", "finish-aborted-attempt", "verify-cold"].includes(mode),
);
if (mode !== "verify-cold") {
  const entries = execFileSync("ps", ["-axo", "pid=,ppid=,comm="], {
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .map((line) => {
      const match = line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/);
      assert(match);
      return {
        pid: Number(match[1]),
        ppid: Number(match[2]),
        executable: match[3],
      };
    });
  const owned = new Set([ready.applicationPid]);
  for (let changed = true; changed; ) {
    changed = false;
    for (const entry of entries)
      if (owned.has(entry.ppid) && !owned.has(entry.pid)) {
        owned.add(entry.pid);
        changed = true;
      }
  }
  const socket = new WebSocket(ready.target);
  await new Promise((resolve) =>
    socket.addEventListener("open", resolve, { once: true }),
  );
  const { call } = createCdpClient(socket);
  const evaluate = async (expression) => {
    const result = await call("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    assert(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  try {
    const results = [];
    if (mode === "finish" || mode === "finish-aborted-attempt") {
      assert(
        Number.isInteger(ready.supplierPid),
        "Missing owned supplier identity",
      );
      if (mode === "finish")
        assert.equal(
          JSON.parse(
            readFileSync(join(root, "production-background.json"), "utf8"),
          ).completed,
          true,
          "Do not finish the supplier during the background interval",
        );
      const args = execFileSync(
        "ps",
        ["-p", String(ready.supplierPid), "-o", "args="],
        { encoding: "utf8" },
      ).trim();
      assert(
        args.endsWith("node validation/m2/production-performance.mjs"),
        "Recorded supplier is no longer the owned fixture",
      );
      if (mode === "finish")
        assertProbeRun(
          JSON.parse(readFileSync(join(root, "production-background.json"))),
          ready,
        );
      process.kill(ready.supplierPid, "SIGUSR2");
    } else {
      for (const record of dataset.records)
        results.push(
          await evaluate(
            `(async()=>{const threadId=${JSON.stringify(record.threadId)};const view=window.__productionProbe.views[threadId];if(!view?.connectionGeneration)throw Error('Missing actual connection identity');return window.desktop.runtime.request({kind:'stop',threadId,traceId:crypto.randomUUID(),connectionGeneration:view.connectionGeneration});})()`,
          ),
        );
    }
    const deadline = Date.now() + 30000;
    let views;
    while (true) {
      views = await evaluate(
        "Object.values(window.__productionProbe.views).map(view=>({threadId:view.threadId,connectionGeneration:view.connectionGeneration,control:view.control}))",
      );
      if (
        views.length === 3 &&
        views.every((view) => !view.control.streaming && !view.control.stopping)
      )
        break;
      assert(Date.now() < deadline, "Actual native stop did not settle");
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    writeFileSync(
      path,
      JSON.stringify(
        {
          mode,
          stoppedAt: Date.now(),
          applicationPid: ready.applicationPid,
          sourceRunStartAt: ready.startAt,
          processFamily: entries.filter((entry) => owned.has(entry.pid)),
          results,
          settled: views,
          allNativeCold: false,
        },
        null,
        2,
      ),
    );
    console.log(
      "Actual three control states settled; invoke the owned application's normal Quit next",
    );
  } finally {
    socket.close();
  }
} else {
  const report = JSON.parse(readFileSync(path, "utf8"));
  assert.equal(
    report.applicationPid,
    ready.applicationPid,
    "Cleanup report belongs to a different application run",
  );
  assert.equal(
    report.sourceRunStartAt,
    ready.startAt,
    "Cleanup report belongs to a different source run",
  );
  const deadline = Date.now() + 60000;
  while (true) {
    const alive = report.processFamily.filter(({ pid }) => {
      try {
        process.kill(pid, 0);
        return true;
      } catch (error) {
        if (error.code !== "ESRCH") throw error;
        return false;
      }
    });
    if (!alive.length) break;
    assert(
      Date.now() < deadline,
      `Owned processes still alive: ${JSON.stringify(alive)}`,
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  report.processFamilyAbsent = true;
  report.leases = [];
  for (const leasePath of new Set(
    dataset.records.map((record) =>
      join(dirname(record.sessionFile), ".d-pi-execution.sqlite"),
    ),
  )) {
    const lease = new DatabaseSync(leasePath);
    try {
      lease.exec("PRAGMA busy_timeout=0; BEGIN EXCLUSIVE");
      const owners = lease
        .prepare("SELECT COUNT(*) AS count FROM owner")
        .get().count;
      lease.exec("ROLLBACK");
      report.leases.push({ leasePath, owners, exclusiveLockAcquired: true });
    } finally {
      lease.close();
    }
  }
  report.allNativeCold = report.leases.every((lease) => lease.owners === 0);
  report.verifiedAt = Date.now();
  writeFileSync(path, JSON.stringify(report, null, 2));
  assert(
    report.allNativeCold,
    "Native lease still has an owner after normal Quit",
  );
  console.log(
    "Owned Main/native family absent; every execution lease has zero owners and an exclusive lock was acquired",
  );
}
