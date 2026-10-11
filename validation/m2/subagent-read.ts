import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  createNativeSubagentReader,
  type NativeSubagentReadTask,
} from "../../src/modules/execution/host/public";

async function run() {
  const root = await mkdtemp(join(tmpdir(), "d-pi-built-subagent-"));
  const reader = createNativeSubagentReader(
    process.env.D_PI_SUBAGENT_WORKER
      ? pathToFileURL(process.env.D_PI_SUBAGENT_WORKER)
      : new URL("./subagent-worker.js", import.meta.url),
  );
  let heartbeat = 0;
  const timer = setInterval(() => heartbeat++, 1);
  const parentSessionFile = join(root, "parent.jsonl");
  try {
    await mkdir(join(root, "parent"));
    await writeFile(
      parentSessionFile,
      JSON.stringify({ type: "session", id: "parent" }) + "\n",
    );
    const task: NativeSubagentReadTask = {
      operationId: randomUUID(),
      traceId: randomUUID(),
      parentSessionFile,
      parentSessionId: "parent",
      owner: {
        id: "child",
        parentToolCallId: "call",
        sessionFile: join(root, "parent", "child.jsonl"),
      },
    };
    await writeFile(
      task.owner.sessionFile,
      [
        {
          type: "session",
          id: "child-native-id",
          parentSession: parentSessionFile,
        },
        {
          type: "message",
          message: {
            role: "assistant",
            content: [
              { type: "text", text: "finished" },
              {
                type: "toolCall",
                name: "yield",
                arguments: { data: "界".repeat(30000), error: null },
              },
            ],
          },
        },
      ]
        .map((value) => JSON.stringify(value))
        .join("\n") + "\n",
    );
    const signal = new AbortController().signal;
    const result = await reader.read(task, signal);
    assert.equal(result.status, "available");
    if (result.status === "available") {
      assert.equal(result.childSessionId, "child-native-id");
      assert.equal(result.truncated, true);
      assert(Buffer.byteLength(result.text) <= 65536);
      assert(!result.text.includes("�"));
    }
    const invalid = await reader.read(
      { ...task, operationId: randomUUID(), parentSessionId: "foreign" },
      signal,
    );
    assert.equal(invalid.status, "unavailable");
    const controllers = [new AbortController(), new AbortController()];
    const pending = controllers.map((controller) =>
      reader.read({ ...task, operationId: randomUUID() }, controller.signal),
    );
    const settled = Promise.allSettled(pending);
    assert.equal(reader.snapshot().active, 2);
    await assert.rejects(
      reader.read({ ...task, operationId: randomUUID() }, signal),
      (error: unknown) =>
        error instanceof Error && error.message.includes("busy"),
    );
    for (const controller of controllers) controller.abort();
    // Logical cancellation has not released the physical permits synchronously.
    assert.equal(reader.snapshot().active, 2);
    assert((await settled).every((result) => result.status === "rejected"));
    assert.equal(reader.snapshot().active, 0);
    assert.equal(reader.snapshot().peakActive, 2);
    await reader.read({ ...task, operationId: randomUUID() }, signal);
    assert.equal(reader.snapshot().active, 0);
    assert(heartbeat > 0);
    console.log(
      JSON.stringify({
        runtime: {
          node: process.versions.node,
          electron: process.versions.electron,
        },
        heartbeat,
        budget: reader.snapshot(),
        checks: [
          "native-parent-identity",
          "utf8-budget",
          "physical-cancel-exit",
          "global-permit",
          "subsequent-read",
        ],
      }),
    );
  } finally {
    clearInterval(timer);
    await reader.close();
    await rm(root, { recursive: true, force: true });
  }
}
void run().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error(error);
    process.exit(1);
  },
);
