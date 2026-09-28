import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";

const root = await mkdtemp(join(tmpdir(), "d-pi-s3-sdk-"));
const config = join(root, "config"),
  project = join(root, "project");
await mkdir(config);
await mkdir(project);
let calls = 0;
const inputs = [];
const sockets = new Set();
const server = createServer(async (req, res) => {
  let body = "";
  for await (const bytes of req) body += bytes;
  inputs.push(body);
  calls++;
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  const frame = (delta, finish) => ({
    id: "fixture",
    object: "chat.completion.chunk",
    created: 1,
    model: "fixture",
    choices: [{ index: 0, delta, finish_reason: finish }],
  });
  res.write(
    `data: ${JSON.stringify(frame({ role: "assistant", content: "RESPONSE" }, null))}\n\n`,
  );
  if (calls > 1) {
    res.write(`data: ${JSON.stringify(frame({}, "stop"))}\n\n`);
    res.end("data: [DONE]\n\n");
  }
});
server.on("connection", (socket) => {
  sockets.add(socket);
  socket.on("close", () => sockets.delete(socket));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
await writeFile(
  join(config, "models.yml"),
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
  join(config, "config.yml"),
  JSON.stringify({
    autolearn: { enabled: false },
    modelRoles: { default: "fixture/fixture", smol: "fixture/fixture" },
  }),
);
const invalidProfile = spawnSync(
  resolve(process.env.SDK_ROOT ?? "resources/sdk", "bun"),
  [resolve(process.env.SDK_ROOT ?? "resources/sdk", "host.mjs")],
  {
    cwd: project,
    env: {
      PATH: "/usr/bin:/bin",
      HOME: root,
      OMP_PROFILE: "..",
      PI_CODING_AGENT_DIR: config,
    },
    input: "",
    encoding: "utf8",
    timeout: 10000,
  },
);
assert.ok(
  invalidProfile.status !== 0 && invalidProfile.status !== null,
  "invalid profile must fail rather than silently select default config",
);
const child = spawn(
  resolve(process.env.SDK_ROOT ?? "resources/sdk", "bun"),
  [resolve(process.env.SDK_ROOT ?? "resources/sdk", "host.mjs")],
  {
    cwd: project,
    env: {
      PATH: "/usr/bin:/bin",
      HOME: root,
      TMPDIR: tmpdir(),
      PI_CODING_AGENT_DIR: config,
      PI_CODING_AGENT_SESSION_DIR: join(root, "sessions"),
      PI_CONFIG_DIR: ".fixture",
      OPENAI_API_KEY: "fixture",
    },
    stdio: ["pipe", "pipe", "pipe"],
  },
);
let stderr = "";
child.stderr.on("data", (b) => {
  stderr += b;
});
const frames = [];
createInterface({ input: child.stdout }).on("line", (line) => {
  try {
    frames.push(JSON.parse(line));
  } catch {
    throw Error(`Non-JSON output: ${line}`);
  }
});
const wait = async (predicate) => {
  const start = Date.now();
  while (!predicate()) {
    if (child.exitCode !== null || Date.now() - start > 30000)
      throw Error(`SDK timeout/exit ${child.exitCode}: ${stderr.slice(-4000)}`);
    await new Promise((r) => setTimeout(r, 25));
  }
};
const request = async (type, fields = {}) => {
  const id = crypto.randomUUID();
  child.stdin.write(`${JSON.stringify({ type, id, ...fields })}\n`);
  await wait(() => frames.some((f) => f.type === "response" && f.id === id));
  const reply = frames.find((f) => f.type === "response" && f.id === id);
  assert.equal(reply.success, true, JSON.stringify(reply));
  return reply;
};
try {
  await wait(() => frames.some((f) => f.type === "ready"));
  const initial = (await request("get_state")).data;
  assert.ok(
    initial.sessionFile.startsWith(join(root, "sessions")),
    "SDK session must live in managed directory",
  );
  await request("prompt", { message: "FIRST" });
  await wait(() => calls === 1);
  await request("follow_up", { message: "SECOND" });
  assert.equal((await request("d_pi_state")).data.queued, 1);
  const stopped = await request("d_pi_stop");
  assert.equal(stopped.data.paused, true);
  assert.equal(stopped.data.queued, 1);
  await new Promise((r) => setTimeout(r, 350));
  assert.equal(calls, 1, "stop must prevent consuming native follow-up");
  await request("d_pi_stop");
  assert.equal((await request("d_pi_state")).data.queued, 1);
  child.stdin.write(
    `${JSON.stringify({ type: "d_pi_continue", id: "superseded" })}\n${JSON.stringify({ type: "d_pi_stop", id: "last-stop" })}\n`,
  );
  await wait(() =>
    frames.some((f) => f.type === "response" && f.id === "last-stop"),
  );
  assert.equal(
    frames.find((f) => f.type === "response" && f.id === "superseded").success,
    false,
  );
  assert.equal((await request("d_pi_state")).data.paused, true);
  assert.equal(calls, 1, "a newer stop supersedes an unprocessed continue");
  await request("d_pi_continue");
  await wait(() => calls === 2);
  await wait(() => frames.filter((f) => f.type === "agent_end").length >= 2);
  assert.equal((await request("get_state")).data.sessionId, initial.sessionId);
  const finalState = (await request("d_pi_state")).data;
  console.log("Native idle observation", finalState);
  assert.equal(finalState.queued, 0);
  assert.match(inputs[1], /SECOND/);
  console.log(
    "PASS: official SDK stop retains native queue; explicit continue consumes the same session exactly once",
  );
} finally {
  child.stdin.end();
  const kill = setTimeout(() => child.kill("SIGKILL"), 3000);
  await new Promise((r) =>
    child.exitCode !== null ? r() : child.once("exit", r),
  );
  clearTimeout(kill);
  for (const socket of sockets) socket.destroy();
  server.close();
  await rm(root, { recursive: true, force: true });
}
