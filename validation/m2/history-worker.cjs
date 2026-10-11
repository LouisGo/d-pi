const { Worker } = require("node:worker_threads");
const {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  appendFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { randomUUID } = require("node:crypto");
const assert = require("node:assert/strict");
// Run after pnpm build: node/pnpm exec electron validation/m2/history-worker.cjs
const entry = join(__dirname, "../../out/main/history-worker.js");
async function run() {
  const root = mkdtempSync(join(tmpdir(), "d-pi-built-history-worker-"));
  const threadId = randomUUID();
  mkdirSync(join(root, threadId));
  const sessionFile = join(root, threadId, "session.jsonl");
  const binding = {
    threadId,
    configContextId: "smoke",
    sessionId: "session",
    sessionFile,
  };
  const rows = Array.from({ length: 400 }, (_, i) => ({
    type: "message",
    id: `record-${i}`,
    parentId: null,
    message: { role: "assistant", content: `${i}:` + "界".repeat(3000) },
  }));
  writeFileSync(
    sessionFile,
    [
      JSON.stringify({ type: "session", version: 3, id: "session" }),
      ...rows.map(JSON.stringify),
    ].join("\n") + "\n",
  );
  let active = 0;
  let exits = 0;
  async function read(cursor, range) {
    const worker = new Worker(entry, {
      workerData: {
        root,
        binding,
        cursor,
        ...(range ? { range } : {}),
        operationId: randomUUID(),
        traceId: randomUUID(),
      },
      execArgv: [],
      trackUnmanagedFds: true,
    });
    active++;
    let reply;
    worker.on("message", (value) => {
      reply = value;
    });
    return new Promise((resolve, reject) => {
      worker.on("error", reject);
      worker.on("exit", (code) => {
        active--;
        exits++;
        if (code !== 0) reject(Error(`worker exit ${code}`));
        else resolve(reply);
      });
    });
  }
  let timer;
  try {
    let beats = 0;
    timer = setInterval(() => beats++, 1);
    const tail = await read(null, "tail");
    clearInterval(timer);
    assert.equal(tail.kind, "page");
    assert.equal(tail.entries.at(-1).id, "record-399");
    assert(tail.entries.length < 130);
    assert(tail.previous.backward);
    appendFileSync(
      sessionFile,
      JSON.stringify({
        type: "message",
        id: "new",
        parentId: null,
        message: { role: "user", content: "new" },
      }) + "\n",
    );
    const previous = await read(tail.previous);
    assert.equal(previous.source, tail.source);
    assert(
      !previous.entries.some((entry) =>
        tail.entries.some((later) => later.id === entry.id),
      ),
    );
    const appended = await read({ ...tail.continuation, append: true });
    assert.deepEqual(
      appended.entries.map((entry) => entry.id),
      ["new"],
    );
    assert.equal(active, 0);
    assert.equal(exits, 3);
    console.log(
      JSON.stringify({
        runtime: {
          node: process.versions.node,
          electron: process.versions.electron,
        },
        tailRecords: tail.entries.length,
        previousRecords: previous.entries.length,
        appendRecords: appended.entries.length,
        heartbeatTicks: beats,
        active,
        exits,
      }),
    );
  } finally {
    clearInterval(timer);
    rmSync(root, { recursive: true, force: true });
  }
}
if (process.versions.electron) {
  const { app } = require("electron");
  app
    .whenReady()
    .then(run)
    .then(
      () => app.quit(),
      (error) => {
        console.error(error);
        app.exit(1);
      },
    );
} else
  run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
