import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, realpath, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { createTestEnvironment } from "../../scripts/testing/test-environment.mjs";

// Real Host, tool execution, native JSONL, and cold first request; localhost fixtures only.
const sandbox = createTestEnvironment({
  prefix: "d-pi-sdk-responses-session-",
});
const sdk = resolve(process.env.SDK_ROOT ?? "resources/sdk");
const children = new Set();
const sockets = new Set();
const requests = [];
let phase = "tool";
let ordinal = 0;
let compacted = false;
let fixtureError;
const encrypted = "fixture-opaque-encrypted-reasoning";
const summary = "FIXTURE_COMPACTION_SUMMARY blue heron 7";
const server = createServer(async (request, response) => {
  try {
    let body = "";
    for await (const bytes of request) body += bytes;
    const input = JSON.parse(body);
    requests.push({ phase, input });
    assert.ok(request.url.endsWith("/responses"));
    assert.ok(
      requests.length <= 8,
      "bounded fixture must not enter a compaction loop",
    );
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    const emit = (event) =>
      response.write(`data: ${JSON.stringify(event)}\n\n`);
    const id = `resp_fixture_${++ordinal}`;
    emit({ type: "response.created", response: { id } });
    const output = [];
    if (phase === "tool") {
      const item = {
        type: "function_call",
        id: "fc_fixture",
        call_id: "call_fixture",
        name: "read",
        arguments: "",
      };
      emit({ type: "response.output_item.added", output_index: 0, item });
      const argumentsText = JSON.stringify({
        path: join(sandbox.cwd, "fixture.txt"),
      });
      emit({
        type: "response.function_call_arguments.delta",
        output_index: 0,
        item_id: item.id,
        delta: argumentsText.slice(0, 8),
      });
      emit({
        type: "response.function_call_arguments.delta",
        output_index: 0,
        item_id: item.id,
        delta: argumentsText.slice(8),
      });
      emit({
        type: "response.function_call_arguments.done",
        output_index: 0,
        item_id: item.id,
        arguments: "",
      });
      emit({ type: "response.output_item.done", output_index: 0, item });
      output.push(item);
      phase = "reasoning";
    } else {
      const text =
        phase === "compact" ? summary : "FIXTURE_RESPONSE blue heron 7";
      if (phase === "reasoning") {
        const item = {
          type: "reasoning",
          id: "rs_fixture",
          summary: [{ type: "summary_text", text: "fixture thinking" }],
          encrypted_content: encrypted,
        };
        emit({
          type: "response.output_item.added",
          output_index: 0,
          item: { ...item, summary: [] },
        });
        emit({ type: "response.output_item.done", output_index: 0, item });
        output.push(item);
      }
      const item = {
        type: "message",
        id: `msg_${ordinal}`,
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text, annotations: [] }],
      };
      emit({
        type: "response.output_item.added",
        output_index: output.length,
        item: { ...item, content: [] },
      });
      emit({
        type: "response.output_text.delta",
        output_index: output.length,
        item_id: item.id,
        content_index: 0,
        delta: text,
      });
      emit({
        type: "response.output_item.done",
        output_index: output.length,
        item,
      });
      output.push(item);
    }
    const inputTokens = phase === "cold" ? 16000 : 100;
    emit({
      type: "response.completed",
      response: {
        id,
        status: "completed",
        output,
        usage: {
          input_tokens: inputTokens,
          output_tokens: 10,
          total_tokens: inputTokens + 10,
        },
      },
    });
    response.end();
    if (phase === "cold") phase = "compact";
    else if (phase === "compact") {
      phase = "continue";
      compacted = true;
    }
  } catch (error) {
    fixtureError = error;
    response.destroy();
  }
});
server.on("connection", (socket) => {
  sockets.add(socket);
  socket.on("close", () => sockets.delete(socket));
});
await new Promise((accept) => server.listen(0, "127.0.0.1", accept));
const configure = async (enabled) =>
  writeFile(
    join(sandbox.config, "config.yml"),
    JSON.stringify({
      autolearn: { enabled: false },
      compaction: {
        enabled,
        thresholdTokens: 12000,
        keepRecentTokens: 16,
        methodOrder: ["handoff"],
        asyncEnabled: false,
        midTurnEnabled: false,
        autoContinue: false,
      },
      modelRoles: { default: "fixture/fixture", smol: "fixture/fixture" },
    }),
  );
const launch = async (binding) => {
  const child = spawn(join(sdk, "bun"), [join(sdk, "host.mjs")], {
    cwd: sandbox.cwd,
    env: {
      ...sandbox.env,
      ...(binding ? { D_PI_RESUME_SESSION: JSON.stringify(binding) } : {}),
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  children.add(child);
  const frames = [];
  let stderr = "";
  child.stderr.on("data", (bytes) => {
    stderr = (stderr + bytes).slice(-4096);
  });
  createInterface({ input: child.stdout }).on("line", (line) =>
    frames.push(JSON.parse(line)),
  );
  const wait = async (predicate) => {
    const deadline = Date.now() + 30000;
    while (!predicate()) {
      if (fixtureError) throw fixtureError;
      if (Date.now() >= deadline || child.exitCode !== null)
        throw Error(
          `Responses session timeout: ${stderr}; frames=${JSON.stringify(frames.slice(-6).map(({ type, id, status }) => ({ type, id, status })))}`,
        );
      await new Promise((accept) => setTimeout(accept, 20));
    }
  };
  const request = async (type, fields = {}) => {
    const id = crypto.randomUUID();
    child.stdin.write(`${JSON.stringify({ type, id, ...fields })}\n`);
    await wait(() =>
      frames.some((frame) => frame.type === "response" && frame.id === id),
    );
    const response = frames.find(
      (frame) => frame.type === "response" && frame.id === id,
    );
    assert.equal(response.success, true, JSON.stringify(response));
    return { id, response };
  };
  const prompt = async (message) => {
    const start = frames.length;
    const { id } = await request("prompt", { message });
    await wait(() =>
      frames.some((frame) => frame.type === "prompt_result" && frame.id === id),
    );
    assert.equal(
      frames.find((frame) => frame.type === "prompt_result" && frame.id === id)
        .status,
      "completed",
    );
    await wait(() =>
      frames.slice(start).some((frame) => frame.type === "session_settled"),
    );
  };
  const close = async () => {
    const exited = new Promise((accept) => child.once("exit", accept));
    child.stdin.end();
    let timeout;
    const code = await Promise.race([
      exited,
      new Promise((_, reject) => {
        timeout = setTimeout(
          () => reject(Error("SDK clean exit timeout")),
          10000,
        );
      }),
    ]).finally(() => clearTimeout(timeout));
    assert.equal(code, 0, stderr);
    children.delete(child);
  };
  await wait(() => frames.some((frame) => frame.type === "ready"));
  return { frames, request, prompt, close };
};
try {
  assert.equal(
    JSON.parse(await readFile(join(sdk, "manifest.json"), "utf8")).sdkVersion,
    "18.8.9",
  );
  await writeFile(join(sandbox.cwd, "fixture.txt"), "blue heron 7\n");
  await writeFile(
    join(sandbox.config, "models.yml"),
    JSON.stringify({
      providers: {
        fixture: {
          baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
          apiKey: "fixture",
          api: "openai-responses",
          models: [
            {
              id: "fixture",
              name: "fixture",
              reasoning: true,
              input: ["text"],
              contextWindow: 128000,
              maxTokens: 1024,
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            },
          ],
        },
      },
    }),
  );
  await configure(false);
  const warm = await launch();
  const state = (await warm.request("get_state")).response.data;
  const binding = {
    sessionFile: await realpath(state.sessionFile),
    sessionId: state.sessionId,
  };
  await warm.prompt("Read fixture.txt with the read tool.");
  const journal = await readFile(binding.sessionFile, "utf8");
  const entries = journal
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  const tool = entries.find((entry) => entry.message?.role === "toolResult");
  assert.ok(tool && !tool.message.isError, JSON.stringify(tool));
  assert.match(JSON.stringify(tool.message), /blue heron 7/);
  assert.match(journal, new RegExp(encrypted));
  await warm.close();
  await configure(true);
  phase = "cold";
  const cold = await launch(binding);
  const restored = (await cold.request("get_state")).response.data;
  assert.equal(restored.sessionId, binding.sessionId);
  assert.equal(await realpath(restored.sessionFile), binding.sessionFile);
  assert.equal(
    requests.length,
    2,
    "opening a native file must not submit a request",
  );
  await cold.prompt("Continue from the saved answer.");
  const firstCold = requests.find((request) => request.phase === "cold").input;
  assert.ok(
    firstCold.input.some(
      (item) =>
        item.type === "reasoning" && item.encrypted_content === encrypted,
    ),
    "first restored Responses request must retain opaque native reasoning",
  );
  assert.ok(
    !firstCold.previous_response_id,
    "fresh transport must replay the history",
  );
  assert.ok(
    compacted,
    "crossing the configured threshold must invoke handoff compaction",
  );
  const after = await readFile(binding.sessionFile, "utf8");
  assert.ok(
    after
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))
      .some(
        (entry) =>
          entry.type === "compaction" && entry.summary.includes(summary),
      ),
    "native JSONL must persist the compaction summary",
  );
  await cold.prompt("Continue after compaction.");
  assert.match(JSON.stringify(requests.at(-1).input), new RegExp(summary));
  assert.equal(requests.at(-1).phase, "continue");
  assert.equal(
    (await cold.request("get_state")).response.data.sessionId,
    binding.sessionId,
  );
  await cold.close();
  console.log(
    JSON.stringify(
      {
        sdkVersion: "18.8.9",
        emptyTerminalToolExecuted: true,
        sameNativeFileAndId: true,
        coldEncryptedReasoningReplayed: true,
        thresholdTokens: 12000,
        automaticHandoffPersisted: true,
        continuedWithSummary: true,
        localhostCalls: requests.length,
        realSupplierRequests: 0,
      },
      null,
      2,
    ),
  );
} finally {
  await Promise.all(
    [...children].map(async (child) => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      const exited = new Promise((accept) => child.once("exit", accept));
      child.kill("SIGKILL");
      await exited;
    }),
  );
  for (const socket of sockets) socket.destroy();
  await new Promise((accept) => server.close(accept));
  sandbox.cleanup();
}
