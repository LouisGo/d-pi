import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { createTestEnvironment } from "../../scripts/testing/test-environment.mjs";

// Real fixed SDK/RPC against localhost only; no inherited account or project.
const sandbox = createTestEnvironment({ prefix: "d-pi-sdk-outcomes-" });
const inputs = [];
const sockets = new Set();
let holdNext = true;
let held;
const server = createServer(async (request, response) => {
  let body = "";
  for await (const bytes of request) body += bytes;
  inputs.push(body);
  response.writeHead(200, { "Content-Type": "text/event-stream" });
  const frame = (delta, finish) => ({
    id: "fixture",
    object: "chat.completion.chunk",
    created: 1,
    model: "fixture",
    choices: [{ index: 0, delta, finish_reason: finish }],
  });
  response.write(
    `data: ${JSON.stringify(frame({ role: "assistant", content: "FIXTURE_RESPONSE" }, null))}\n\n`,
  );
  const finish = () => {
    if (response.destroyed || response.writableEnded) return;
    response.write(`data: ${JSON.stringify(frame({}, "stop"))}\n\n`);
    response.end("data: [DONE]\n\n");
  };
  if (holdNext) {
    holdNext = false;
    held = finish;
  } else finish();
});
server.on("connection", (socket) => {
  sockets.add(socket);
  socket.on("close", () => sockets.delete(socket));
});
await new Promise((accept) => server.listen(0, "127.0.0.1", accept));
await writeFile(
  join(sandbox.config, "models.yml"),
  JSON.stringify({
    providers: {
      fixture: {
        baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
        apiKey: "fixture",
        api: "openai-completions",
        models: [
          {
            id: "fixture",
            name: "fixture",
            reasoning: false,
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
await writeFile(
  join(sandbox.config, "config.yml"),
  JSON.stringify({
    autolearn: { enabled: false },
    compaction: { methodOrder: ["soft"], keepRecentTokens: 16, enabled: false },
    modelRoles: { default: "fixture/fixture", smol: "fixture/fixture" },
  }),
);
await mkdir(join(sandbox.config, "extensions"));
await writeFile(
  join(sandbox.config, "extensions", "fixture.ts"),
  `export default function(pi) { pi.registerCommand("fixture-local", { description: "Isolated no-op", handler: async () => {} }); }\n`,
);
const sdk = resolve(process.env.SDK_ROOT ?? "resources/sdk");
const child = spawn(join(sdk, "bun"), [join(sdk, "host.mjs")], {
  cwd: sandbox.cwd,
  env: sandbox.env,
  stdio: ["pipe", "pipe", "pipe"],
});
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
    if (Date.now() >= deadline || child.exitCode !== null)
      throw Error(`SDK outcomes timeout: ${stderr}`);
    await new Promise((accept) => setTimeout(accept, 20));
  }
};
const send = (type, fields = {}) => {
  const id = crypto.randomUUID();
  child.stdin.write(`${JSON.stringify({ type, id, ...fields })}\n`);
  return id;
};
const responseFor = (id) =>
  frames.find((frame) => frame.type === "response" && frame.id === id);
const resultFor = (id) =>
  frames.find((frame) => frame.type === "prompt_result" && frame.id === id);
const request = async (type, fields = {}) => {
  const id = send(type, fields);
  await wait(() => responseFor(id));
  const response = responseFor(id);
  assert.equal(response.success, true, JSON.stringify(response));
  return response;
};
const terminal = async (id, status = "completed") => {
  await wait(() => resultFor(id));
  assert.equal(resultFor(id).status, status);
  assert.equal(
    frames.filter((frame) => frame.type === "prompt_result" && frame.id === id)
      .length,
    1,
  );
  return resultFor(id);
};
const cases = {};
try {
  await wait(() => frames.some((frame) => frame.type === "ready"));
  const initial = (await request("get_state")).data;
  assert.ok(initial.sessionId);
  assert.ok(initial.sessionFile.startsWith(sandbox.sessions));
  // Bad wire input must report failure without losing the live native session.
  child.stdin.write("{not-valid-json}\n");
  await wait(() =>
    frames.some(
      (frame) =>
        frame.type === "response" &&
        frame.command === "parse" &&
        frame.success === false,
    ),
  );
  const unknown = send("fixture_unknown_command");
  await wait(() => responseFor(unknown));
  assert.equal(responseFor(unknown).success, false);
  assert.equal(responseFor(unknown).command, "fixture_unknown_command");
  const invalidMode = send("set_cache_warming", { mode: "fixture_invalid" });
  await wait(() => responseFor(invalidMode));
  assert.equal(responseFor(invalidMode).success, false);
  assert.equal(responseFor(invalidMode).command, "set_cache_warming");
  assert.equal((await request("get_state")).data.sessionId, initial.sessionId);
  assert.equal(
    inputs.length,
    0,
    "rejected RPC input must not invoke a provider",
  );
  cases.rpcRejected = {
    malformedJson: true,
    unknownCommand: unknown,
    invalidMode,
    sessionPreserved: true,
    providerCalls: inputs.length,
  };
  const selected = await request("d_pi_model", {
    provider: "fixture",
    modelId: "fixture",
    thinking: { kind: "default" },
  });
  assert.equal(selected.data.model.provider, "fixture");
  assert.equal(selected.data.model.id, "fixture");
  assert.equal((await request("get_state")).data.sessionId, initial.sessionId);
  const unavailableId = send("d_pi_model", {
    provider: "fixture",
    modelId: "not-configured",
    thinking: { kind: "default" },
  });
  await wait(() => responseFor(unavailableId));
  assert.equal(responseFor(unavailableId).success, false);
  assert.equal(responseFor(unavailableId).command, "d_pi_model");
  assert.equal((await request("get_state")).data.model.id, "fixture");
  await request("negotiate_protocol", { protocolVersion: 2 });
  const local = await request("prompt", { message: "/fixture-local" });
  assert.equal((await terminal(local.id)).agentInvoked, false);
  cases.local = local.id;
  const builtinLocal = await request("prompt", { message: "/jobs" });
  assert.equal(builtinLocal.data.agentInvoked, false);
  cases.builtinLocal = builtinLocal.id;
  for (const behavior of ["steer", "followUp"]) {
    await request(
      behavior === "steer" ? "set_steering_mode" : "set_follow_up_mode",
      { mode: "one-at-a-time" },
    );
    const callsBefore = inputs.length;
    holdNext = true;
    const main = await request("prompt", { message: `${behavior}_MAIN` });
    const busyModel = send("d_pi_model", {
      provider: "fixture",
      modelId: "fixture",
      thinking: { kind: "default" },
    });
    await wait(() => responseFor(busyModel));
    assert.equal(responseFor(busyModel).success, false);
    assert.equal(responseFor(busyModel).command, "d_pi_model");
    await wait(() => inputs.length === callsBefore + 1 && held);
    const first = await request("prompt", {
      message: `${behavior}_FIRST`,
      streamingBehavior: behavior,
    });
    const second = await request("prompt", {
      message: `${behavior}_SECOND`,
      streamingBehavior: behavior,
    });
    const queued = (await request("get_state")).data.queuedMessages;
    assert.deepEqual(queued[behavior === "steer" ? "steering" : "followUp"], [
      `${behavior}_FIRST`,
      `${behavior}_SECOND`,
    ]);
    held();
    held = undefined;
    await terminal(main.id);
    await terminal(first.id);
    await terminal(second.id);
    assert.ok(
      inputs
        .slice(callsBefore + 1)
        .some((input) => input.includes(`${behavior}_FIRST`)),
    );
    assert.ok(
      inputs
        .slice(callsBefore + 1)
        .some((input) => input.includes(`${behavior}_SECOND`)),
    );
    await wait(() => frames.some((frame) => frame.type === "session_settled"));
    const final = (await request("get_state")).data;
    assert.equal(final.isSettled, true);
    assert.equal(final.queuedMessageCount, 0);
    cases[behavior] = [main.id, first.id, second.id];
  }
  holdNext = true;
  const beforeAbort = inputs.length;
  const aborted = await request("prompt", { message: "ABORT_INPUT" });
  await wait(() => inputs.length > beforeAbort && held);
  await request("d_pi_stop");
  await terminal(aborted.id, "aborted");
  await request("d_pi_continue");
  cases.aborted = aborted.id;
  // Real manual compaction overlaps a new prompt. OMP owns its race/consumption.
  holdNext = true;
  held = undefined;
  const beforeCompact = inputs.length;
  const compact = send("compact");
  await wait(
    () => (inputs.length > beforeCompact && held) || responseFor(compact),
  );
  assert.ok(
    held,
    `Compaction did not enter provider: ${JSON.stringify(responseFor(compact))}`,
  );
  const overlappingId = send("prompt", { message: "DURING_COMPACTION" });
  // Native prompt admission waits for the manual compaction cleanup; release
  // its provider after delivering input, then independently observe its ACK.
  await new Promise((accept) => setTimeout(accept, 100));
  held?.();
  held = undefined;
  await wait(() => responseFor(overlappingId));
  const overlapping = responseFor(overlappingId);
  assert.equal(overlapping.success, true);
  await wait(() => responseFor(compact));
  await terminal(overlapping.id);
  assert.ok(
    inputs
      .slice(beforeCompact)
      .some((input) => input.includes("DURING_COMPACTION")),
  );
  cases.compaction = {
    id: compact,
    success: responseFor(compact).success,
    input: overlapping.id,
  };
  assert.ok(
    frames.some(
      (frame) =>
        frame.type === "message_end" &&
        frame.message?.role === "assistant" &&
        frame.message.content?.some(
          (part) =>
            part.type === "text" && part.text.includes("FIXTURE_RESPONSE"),
        ),
    ),
    "the real SDK delivers an assistant message, not just prompt acknowledgments",
  );
  assert.ok(
    frames.some(
      (frame) =>
        frame.type === "message_end" &&
        frame.message?.role === "user" &&
        JSON.stringify(frame.message.content).includes("steer_MAIN"),
    ),
    "accepted user input reaches the native message stream",
  );
  assert.equal(
    resultFor(builtinLocal.id),
    undefined,
    "builtin completion is carried by the synchronous response, not prompt_result",
  );
  const version = JSON.parse(
    await readFile(
      join(sdk, "node_modules/@oh-my-pi/pi-coding-agent/package.json"),
      "utf8",
    ),
  ).version;
  if (process.env.D_PI_NATIVE_EVIDENCE) {
    const path = resolve(process.env.D_PI_NATIVE_EVIDENCE);
    await mkdir(dirname(path), { recursive: true });
    const original =
      frames.map((frame) => JSON.stringify(frame)).join("\n") + "\n";
    // Strip disposable directory roots from fixtures without changing identities/order.
    await writeFile(
      path,
      original.split(sandbox.root).join("/isolated-native"),
    );
    await writeFile(
      `${path}.metadata.json`,
      JSON.stringify(
        {
          sdk: version,
          bun: "1.3.14",
          transport: "official RPC/full",
          provider: "isolated localhost SSE",
          cases,
          providerCalls: inputs.length,
        },
        null,
        2,
      ) + "\n",
    );
  }
  console.log(
    `PASS SDK ${version}: local completed, two ${"steer/followUp"} prompt results, abort, session_settled, native queue and manual compaction/input race; localhost calls ${inputs.length}`,
  );
} finally {
  child.stdin.end();
  const kill = setTimeout(() => child.kill("SIGKILL"), 3000);
  await new Promise((accept) =>
    child.exitCode !== null ? accept() : child.once("exit", accept),
  );
  clearTimeout(kill);
  for (const socket of sockets) socket.destroy();
  await new Promise((accept) => server.close(accept));
  sandbox.cleanup();
}
