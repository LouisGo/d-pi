import { Database } from "bun:sqlite";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.env.D_PI_PERFORMANCE_ROOT;
assert(root, "Missing owned fixture root");
const seed = JSON.parse(readFileSync(join(root, "seed-bindings.json"), "utf8"));
assert.equal(seed.allNativeCold, true);
const { SessionManager } = await import(
  pathToFileURL(
    join(
      root,
      "resources/sdk/node_modules/@oh-my-pi/pi-coding-agent/src/session/session-manager.ts",
    ),
  ).href
);
const records = [];
for (const [index, binding] of seed.bindings.entries()) {
  assert(
    realpathSync(binding.sessionFile).startsWith(`${realpathSync(root)}/`),
    "Native dataset escaped owned root",
  );
  // The seed report alone can become stale if this command is rerun. Hold the
  // actual App execution mutex for this file throughout the external SDK write.
  const lease = new Database(
    join(dirname(binding.sessionFile), ".d-pi-execution.sqlite"),
    { create: false, readwrite: true },
  );
  try {
    lease.exec("PRAGMA busy_timeout=0; BEGIN EXCLUSIVE");
    assert.equal(
      lease.query("SELECT COUNT(*) AS count FROM owner").get().count,
      0,
      "Native owner is still present",
    );
    const manager = await SessionManager.open(
      binding.sessionFile,
      undefined,
      undefined,
      { throwIfMissing: true, suppressBreadcrumb: true },
    );
    assert.equal(manager.getSessionId(), binding.sessionId);
    const existing = manager
      .getEntries()
      .filter((entry) => entry.type === "message").length;
    const target = index === 0 ? 3334 : 3333;
    assert(existing <= target);
    for (let count = existing; count < target; count++) {
      const text = `PERF_HISTORY_${index}_${count} 中文阅读 ${"bounded synthetic history ".repeat(4)}`;
      const timestamp = 1700000000000 + count;
      manager.appendMessage(
        count % 2 === 0
          ? { role: "user", content: text, timestamp }
          : {
              role: "assistant",
              content: [{ type: "text", text }],
              api: "openai-completions",
              provider: "fixture",
              model: "fixture",
              timestamp,
              stopReason: "stop",
              usage: {
                input: 0,
                output: 0,
                cacheRead: 0,
                cacheWrite: 0,
                totalTokens: 0,
                cost: {
                  input: 0,
                  output: 0,
                  cacheRead: 0,
                  cacheWrite: 0,
                  total: 0,
                },
              },
            },
      );
    }
    await manager.close();
    const source = readFileSync(binding.sessionFile);
    const actual = source
      .toString("utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .filter((entry) => entry.type === "message").length;
    assert.equal(actual, target);
    records.push({
      threadId: binding.threadId,
      sessionId: binding.sessionId,
      sessionFile: binding.sessionFile,
      messages: actual,
      bytes: source.length,
      sha256: createHash("sha256").update(source).digest("hex"),
    });
  } finally {
    if (lease.inTransaction) lease.exec("ROLLBACK");
    lease.close();
  }
}
assert.equal(
  records.reduce((sum, record) => sum + record.messages, 0),
  10000,
);
writeFileSync(
  join(root, "dataset.json"),
  JSON.stringify(
    {
      synthetic: true,
      writer:
        "fixed OMP 18.8.9 public SessionManager.appendMessage after physical native cooldown",
      records,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({
    messages: 10000,
    threads: 3,
    nativeOwnerActiveDuringWrite: false,
  }),
);
