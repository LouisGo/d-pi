// Opt-in real SDK probe; no model request, credentials or project extensions.
// Run: resources/sdk/bun tests/tooling/probe-native-reading.mjs /abs/resources/sdk
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  copyFile,
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { createReadingSession } from "../../runtime/reading-session.mjs";
import { readNativeHistory } from "../../src/modules/conversation/main/native-history.ts";

const resources = resolve(process.argv[2]);
const scratch = await realpath(
  await mkdtemp(join(tmpdir(), "d-pi-reading-probe-")),
);
const cwd = join(scratch, "project");
const agentDir = join(scratch, "agent");
const sessions = join(scratch, "sessions");
const runtime = join(scratch, "runtime");
for (const directory of [cwd, agentDir, sessions, runtime])
  await mkdir(directory);
process.env.PI_CODING_AGENT_DIR = agentDir;
process.env.PI_CODING_AGENT_SESSION_DIR = sessions;
const sdk = join(resources, "node_modules/@oh-my-pi/pi-coding-agent/src");
const { SessionManager } = await import(
  join(sdk, "session/session-manager.ts")
);
const { createAgentSession } = await import(join(sdk, "sdk.ts"));
const { RpcFrameDecoder } = await import(join(sdk, "modes/rpc/rpc-frame.ts"));
let child;
let session;
try {
  const manager = SessionManager.create(cwd, sessions);
  const expected = [];
  // OMP itself truncates each unsigned string at 500K characters on disk.
  // Use one multi-block native message (>2MiB) with valid persisted blocks.
  const largeBlocks = Array.from({ length: 5 }, (_, index) => ({
    type: "text",
    text: `reading-probe-${index}:` + "x".repeat(450000),
  }));
  const big = largeBlocks.map((block) => block.text).join("");
  for (let index = 0; index < 1002; index++) {
    const message = {
      role: "user",
      content:
        index === 501
          ? largeBlocks
          : [{ type: "text", text: `record-${index}` }],
      timestamp: Date.now(),
    };
    expected.push(manager.appendMessage(message));
  }
  await manager.ensureOnDisk();
  await manager.flush();
  const binding = {
    sessionId: manager.getSessionId(),
    sessionFile: manager.getSessionFile(),
  };
  await manager.close();
  const appRoot = fileURLToPath(new URL("../../runtime/", import.meta.url));
  for (const name of [
    "host.mjs",
    "reading-session.mjs",
    "managed-session.mjs",
    "image-input.mjs",
    "image-compression.mjs",
    "model-selection.mjs",
    "native-queue.mjs",
    "native-subagent-configuration.mjs",
  ])
    await copyFile(join(appRoot, name), join(runtime, name));
  await copyFile(join(resources, "gate.js"), join(runtime, "gate.js"));
  await symlink(join(resources, "node_modules"), join(runtime, "node_modules"));
  child = spawn(join(resources, "bun"), [join(runtime, "host.mjs")], {
    cwd,
    env: { ...process.env, D_PI_RESUME_SESSION: JSON.stringify(binding) },
    stdio: ["pipe", "pipe", "pipe"],
  });
  const pending = new Map();
  const decoder = new RpcFrameDecoder();
  let largestPhysicalFrame = 0;
  let chunkCount = 0;
  let stderr = "";
  child.stderr.on("data", (value) => {
    stderr = (stderr + value).slice(-4000);
  });
  const lines = createInterface({ input: child.stdout });
  lines.on("line", (line) => {
    largestPhysicalFrame = Math.max(
      largestPhysicalFrame,
      Buffer.byteLength(line) + 1,
    );
    const physical = JSON.parse(line);
    if (physical.type === "rpc_chunk") chunkCount++;
    const frame = decoder.push(physical);
    if (frame?.type === "response") pending.get(frame.id)?.(frame);
  });
  let requestId = 0;
  async function request(type, fields = {}) {
    const id = `probe-${++requestId}`;
    return await new Promise((fulfill, reject) => {
      const timer = setTimeout(
        () => reject(Error(`RPC timeout ${type}: ${stderr}`)),
        30000,
      );
      pending.set(id, (frame) => {
        clearTimeout(timer);
        pending.delete(id);
        fulfill(frame);
      });
      child.stdin.write(`${JSON.stringify({ type, id, ...fields })}\n`);
    });
  }
  assert.equal(
    (await request("negotiate_protocol", { protocolVersion: 2 })).success,
    true,
  );
  assert.equal((await request("get_state")).success, true);
  const messages = [];
  let cursor;
  let pages = 0;
  do {
    const reply = await request("d_pi_reading_page", {
      limit: 100,
      ...(cursor ? { cursor } : {}),
    });
    assert.equal(reply.success, true, reply.error);
    assert.equal(reply.data.totalMessages, 1002);
    messages.push(...reply.data.messages);
    cursor = reply.data.nextCursor;
    pages++;
  } while (cursor);
  assert.equal(messages.length, 1002);
  assert.deepEqual(
    messages.map((message) => message.dPiRecordId),
    expected,
  );
  assert(messages.every((message) => message.dPiRestored === true));
  const delivered = messages[501].content.map((block) => block.text).join("");
  assert.equal(
    delivered.length,
    big.length,
    `body length ${delivered.length}; tail ${delivered.slice(-120)}`,
  );
  assert(delivered === big, "whole message body must match");
  assert(largestPhysicalFrame <= 1024 * 1024);
  assert(chunkCount > 1);
  const closed = await request("d_pi_reading_page");
  assert.equal(closed.success, false);
  assert.match(closed.error, /reading-phase-closed/);
  child.kill();

  // A real AgentSession listener exercises the official persistence promise tail.
  const liveManager = SessionManager.create(cwd, sessions);
  ({ session } = await createAgentSession({
    cwd,
    agentDir,
    sessionManager: liveManager,
    enableMCP: false,
    enableLsp: false,
    enableIrc: false,
    skipPythonPreflight: true,
    preloadedExtensionPaths: [],
    preloadedCustomToolPaths: [],
    skills: [],
    rules: [],
    contextFiles: [],
    promptTemplates: [],
    slashCommands: [],
    toolNames: [],
    restrictToolNames: true,
  }));
  const reading = createReadingSession(session);
  const events = [];
  reading.session.subscribe((event) => events.push(event));
  for (const role of ["user", "assistant"]) {
    const original = {
      role,
      content: [{ type: "text", text: `live-exact-${role}-probe` }],
      timestamp: Date.now(),
      ...(role === "assistant"
        ? {
            api: "openai-responses",
            provider: "openai",
            model: "gpt-4o-mini",
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
          }
        : {}),
    };
    session.agent.emitExternalEvent({ type: "message_end", message: original });
    await reading.flushEvents();
    const entry = liveManager
      .getBranch()
      .find((item) => item.type === "message" && item.message === original);
    assert(entry, `real ${role} persistence must retain the original object`);
    const end = events.find(
      (event) =>
        event.type === "message_end" && event.message.dPiRecordId === entry.id,
    );
    assert(end, `real ${role} end must receive its exact ID`);
    assert.equal(end.message.dPiIdentityUnknown, undefined);
    assert.equal(original.dPiRecordId, undefined);
  }
  const assistant = liveManager
    .getBranch()
    .findLast(
      (entry) => entry.type === "message" && entry.message.role === "assistant",
    ).message;
  const call = {
    ...assistant,
    content: [
      {
        type: "toolCall",
        id: "reading-tool-1887",
        name: "read",
        arguments: { path: "fixture.kt" },
      },
    ],
    stopReason: "toolUse",
  };
  const tool = {
    role: "toolResult",
    toolCallId: "reading-tool-1887",
    toolName: "read",
    isError: false,
    content: [{ type: "text", text: "tool body" }],
    details: { lines: 1 },
    timestamp: Date.now(),
  };
  for (const message of [call, tool]) {
    session.agent.emitExternalEvent({ type: "message_end", message });
    await reading.flushEvents();
  }
  await liveManager.flush();
  const liveBinding = {
    threadId: "reading-probe",
    configContextId: "reading-probe",
    sessionId: liveManager.getSessionId(),
    sessionFile: liveManager.getSessionFile(),
  };
  const history = await readNativeHistory(
    sessions,
    liveBinding,
    null,
    undefined,
    cwd,
  );
  assert.equal(history.kind, "page");
  const saved = history.entries.find(
    (entry) => entry.tool?.toolCallId === tool.toolCallId,
  );
  assert(saved, "real 18.8.7 JSONL tool result must retain native identity");
  assert.equal(saved.tool.coverage, "partial");
  assert.equal(saved.tool.arguments.value.path, "fixture.kt");
  assert.equal(saved.tool.result.value.details.lines, 1);
  const liveEnd = events.find(
    (event) =>
      event.type === "message_end" &&
      event.message.toolCallId === tool.toolCallId,
  );
  assert.equal(liveEnd.message.dPiRecordId, saved.id);
  const appended = liveManager.appendMessage({
    role: "user",
    content: "append-after-real-history",
    timestamp: Date.now(),
  });
  await liveManager.flush();
  const tail = await readNativeHistory(
    sessions,
    liveBinding,
    { ...history.continuation, append: true },
    undefined,
    cwd,
  );
  assert.equal(tail.kind, "page");
  assert.deepEqual(
    tail.entries.map((entry) => entry.id),
    [appended],
  );
  console.log(
    JSON.stringify({
      officialSdk: "18.8.7",
      records: messages.length,
      pages,
      bodyBytes: Buffer.byteLength(big),
      chunkCount,
      largestPhysicalFrame,
      closed: true,
      liveExactId: ["user", "assistant"],
      modelRequests: 0,
      savedLiveToolSameRecord: true,
      savedToolPartialCoverage: true,
      incrementalRealJsonl: true,
    }),
  );
} finally {
  child?.kill();
  await session?.dispose();
  await rm(scratch, { recursive: true, force: true });
}
