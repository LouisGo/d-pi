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
  const workers = new Set();
  let active = 0;
  let exits = 0;
  const read = (cursor, range) =>
    task({ kind: "page", root, binding, cursor, ...(range ? { range } : {}) });
  async function task(input) {
    const worker = new Worker(entry, {
      workerData: {
        ...input,
        operationId: randomUUID(),
        traceId: randomUUID(),
      },
      execArgv: [],
      trackUnmanagedFds: true,
    });
    workers.add(worker);
    active++;
    let reply;
    worker.on("message", (value) => {
      reply = value;
    });
    return new Promise((resolve, reject) => {
      worker.on("error", reject);
      worker.on("exit", (code) => {
        workers.delete(worker);
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
    const artifactText = "0123456789".repeat(1024 * 1024);
    const artifacts = sessionFile.slice(0, -6);
    mkdirSync(artifacts);
    writeFileSync(join(artifacts, "0.bash.log"), artifactText);
    const nativeRows = [
      {
        type: "message",
        id: "call",
        parentId: null,
        message: {
          role: "assistant",
          content: [
            {
              type: "toolCall",
              id: "tool-1",
              name: "bash",
              arguments: { command: "printf output" },
            },
          ],
        },
      },
      {
        type: "message",
        id: "result",
        parentId: "call",
        message: {
          role: "toolResult",
          toolCallId: "tool-1",
          toolName: "bash",
          isError: false,
          details: {
            meta: {
              truncation: { artifactId: "0", totalBytes: artifactText.length },
            },
          },
          content: [{ type: "text", text: "raw output" }],
        },
      },
      {
        type: "message",
        id: "image",
        parentId: "result",
        message: {
          role: "user",
          content: [
            {
              type: "image",
              mimeType: "image/png",
              data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a8icAAAAASUVORK5CYII=",
            },
          ],
        },
      },
    ];
    appendFileSync(
      sessionFile,
      nativeRows.map(JSON.stringify).join("\n") + "\n",
    );
    const mediaPage = await read({ ...appended.continuation, append: true });
    const toolRecord = mediaPage.entries.find((entry) => entry.id === "result");
    const imageRecord = mediaPage.entries.find((entry) => entry.id === "image");
    const tool = await task({
      kind: "tool",
      root,
      binding,
      source: {
        kind: "native-record",
        threadId,
        nativeSessionKey: "session",
        recordId: "result",
        revision: mediaPage.source,
      },
      cursor: toolRecord.toolCursor,
      recordId: "result",
      readerId: randomUUID(),
    });
    assert.equal(tool.kind, "tool-detail");
    assert.equal(tool.detail.text, "raw output");
    assert.equal(
      JSON.parse(tool.detail.argumentsText).command,
      "printf output",
    );
    const fullArtifact = await task({
      kind: "tool",
      root,
      binding,
      source: {
        kind: "native-record",
        threadId,
        nativeSessionKey: "session",
        recordId: "result",
        revision: mediaPage.source,
      },
      cursor: toolRecord.toolCursor,
      recordId: "result",
      readerId: randomUUID(),
      artifactKey: "0",
    });
    assert.equal(fullArtifact.kind, "tool-detail");
    assert.equal(fullArtifact.detail.source.kind, "native-artifact");
    assert.equal(fullArtifact.detail.text.length, 10 * 1024 * 1024);
    assert.equal(fullArtifact.detail.text, artifactText);
    assert.equal(fullArtifact.detail.coverage, "observed");
    const image = await task({
      kind: "image",
      root,
      binding,
      cursor: imageRecord.mediaCursor,
      recordId: "image",
      index: 0,
    });
    assert.equal(image.kind, "image");
    assert(image.dataUrl.startsWith("data:image/png;base64,"));
    const directory = join(root, "project");
    const sessions = join(root, "cli");
    mkdirSync(directory);
    mkdirSync(join(sessions, "bucket"), { recursive: true });
    writeFileSync(
      join(sessions, "bucket", "history.jsonl"),
      [
        { type: "session", version: 3, id: "cli-session", cwd: directory },
        {
          type: "message",
          id: "cli-record",
          parentId: null,
          message: { role: "user", content: "CLI history" },
        },
      ]
        .map(JSON.stringify)
        .join("\n") + "\n",
    );
    const catalog = await task({
      kind: "project-list",
      root: sessions,
      directory,
      threadId,
    });
    assert.equal(catalog.kind, "catalog");
    assert.equal(catalog.sessions.length, 1);
    const projectPage = await task({
      kind: "project-page",
      root: sessions,
      directory,
      threadId,
      key: catalog.sessions[0].key,
      cursor: null,
    });
    assert.equal(projectPage.kind, "page");
    assert.equal(projectPage.entries[0].text, "CLI history");
    assert.equal(active, 0);
    assert.equal(exits, 9);
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
        artifactBytes: fullArtifact.detail.text.length,
        active,
        exits,
      }),
    );
  } finally {
    clearInterval(timer);
    await Promise.allSettled([...workers].map((worker) => worker.terminate()));
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
