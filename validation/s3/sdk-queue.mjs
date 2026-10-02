import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";

const root = await mkdtemp(join(tmpdir(), "d-pi-m2-queue-"));
const config = join(root, "config"),
  project = join(root, "project");
await mkdir(config);
await mkdir(project);
let calls = 0;
let holdNext = true;
const inputs = [];
const serverResponses = new Set();
const sockets = new Set();
const server = createServer(async (req, res) => {
  let body = "";
  for await (const bytes of req) body += bytes;
  inputs.push(body);
  calls++;
  const holding = holdNext;
  holdNext = false;
  serverResponses.add(res);
  res.on("close", () => serverResponses.delete(res));
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
  if (!holding) {
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
  child.stdin.write(
    `${JSON.stringify({ type, id, ...(type === "d_pi_queue" ? { command: fields } : fields) })}\n`,
  );
  await wait(() => frames.some((f) => f.type === "response" && f.id === id));
  const reply = frames.find((f) => f.type === "response" && f.id === id);
  assert.equal(reply.success, true, JSON.stringify(reply));
  return reply;
};
const releaseProvider = () => {
  const outstanding = [...serverResponses][0];
  outstanding.write(
    `data: ${JSON.stringify({ id: "fixture", object: "chat.completion.chunk", created: 1, model: "fixture", choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\n`,
  );
  outstanding.end("data: [DONE]\n\n");
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
  await request("follow_up", { message: "A" });
  await request("follow_up", { message: "B" });
  await request("follow_up", { message: "DELETE" });
  let state = (await request("d_pi_state")).data.queueState;
  assert.ok(state, "application adapter exposes native queue management");
  const bId = state.items.find((entry) => entry.text === "B").id;
  const deleteId = state.items.find((entry) => entry.text === "DELETE").id;
  state = (
    await request("d_pi_queue", {
      action: "move",
      entryId: deleteId,
      revision: state.revision,
      toIndex: 0,
    })
  ).data;
  assert.deepEqual(
    state.items.map((entry) => entry.text),
    ["DELETE", "A", "B"],
  );
  state = (
    await request("d_pi_queue", {
      action: "delete",
      entryId: deleteId,
      revision: state.revision,
    })
  ).data;
  state = (
    await request("d_pi_queue", {
      action: "begin-edit",
      entryId: bId,
      revision: state.revision,
    })
  ).data;
  state = (
    await request("d_pi_queue", {
      action: "update-edit",
      entryId: bId,
      revision: state.revision,
      text: "UNSAVED",
    })
  ).data;
  assert.equal(state.editing.draftText, "UNSAVED");
  state = (
    await request("d_pi_queue", {
      action: "cancel-edit",
      entryId: bId,
      revision: state.revision,
    })
  ).data;
  assert.equal(state.items.find((entry) => entry.id === bId).text, "B");
  await request("follow_up", { message: "C" });
  state = (await request("d_pi_state")).data.queueState;
  state = (
    await request("d_pi_queue", {
      action: "begin-edit",
      entryId: bId,
      revision: state.revision,
    })
  ).data;
  state = (
    await request("d_pi_queue", {
      action: "update-edit",
      entryId: bId,
      revision: state.revision,
      text: "B_NEW",
    })
  ).data;
  releaseProvider();
  await wait(() => calls === 2);
  await new Promise((resolve) => setTimeout(resolve, 350));
  assert.equal(
    calls,
    2,
    "earlier native item executes but edited B and later C wait",
  );
  assert.match(inputs[1], /A/);
  assert.doesNotMatch(inputs[1], /B_NEW/);
  await request("d_pi_stop");
  state = (await request("d_pi_state")).data.queueState;
  state = (
    await request("d_pi_queue", {
      action: "save-edit",
      entryId: bId,
      revision: state.revision,
      text: "B_NEW",
    })
  ).data;
  assert.equal(state.editing, null);
  await new Promise((resolve) => setTimeout(resolve, 350));
  assert.equal(calls, 2, "save does not release independent user-stop pause");
  await request("d_pi_continue");
  await wait(() => calls === 4);
  await wait(() => {
    const actual = frames.findLast(
      (frame) => frame.type === "d_pi_control_state",
    )?.data;
    return actual?.queued === 0 && !actual.streaming;
  });
  assert.match(inputs[2], /B_NEW/);
  assert.match(inputs[3], /C/);
  assert.doesNotMatch(inputs[2], /UNSAVED|DELETE/);
  assert.equal((await request("get_state")).data.sessionId, initial.sessionId);
  assert.equal((await request("d_pi_state")).data.queueState.items.length, 0);
  await request("set_follow_up_mode", { mode: "all" });
  for (const action of ["cancel-edit", "save-edit"]) {
    holdNext = true;
    const before = calls;
    await request("prompt", { message: `ALL_START_${action}` });
    await wait(() => calls === before + 1);
    await request("prompt", {
      message: `ultrathink ALL_A_${action}`,
      streamingBehavior: "followUp",
    });
    await request("follow_up", { message: `ALL_B_${action}` });
    await request("follow_up", { message: `ALL_C_${action}` });
    state = (await request("d_pi_state")).data.queueState;
    const target = state.items.find(
      (entry) => entry.text === `ALL_B_${action}`,
    );
    assert.ok(target?.editable);
    state = (
      await request("d_pi_queue", {
        action: "begin-edit",
        entryId: target.id,
        revision: state.revision,
      })
    ).data;
    state = (
      await request("d_pi_queue", {
        action: "update-edit",
        entryId: target.id,
        revision: state.revision,
        text: `ALL_EDITED_${action}`,
      })
    ).data;
    releaseProvider();
    await new Promise((resolve) => setTimeout(resolve, 350));
    assert.equal(
      calls,
      before + 1,
      "native all batch containing edited entry cannot commit partially",
    );
    state = (await request("d_pi_state")).data.queueState;
    assert.equal(state.editing.draftText, `ALL_EDITED_${action}`);
    await request("d_pi_queue", {
      action,
      entryId: target.id,
      revision: state.revision,
      ...(action === "save-edit" ? { text: `ALL_EDITED_${action}` } : {}),
    });
    await wait(() => calls === before + 2);
    assert.match(inputs[before + 1], new RegExp(`ALL_A_${action}`));
    assert.match(inputs[before + 1], new RegExp(`ALL_C_${action}`));
    assert.match(
      inputs[before + 1],
      new RegExp(
        action === "cancel-edit" ? `ALL_B_${action}` : `ALL_EDITED_${action}`,
      ),
    );
    await wait(() => !serverResponses.size);
    await wait(() => {
      const actual = frames.findLast(
        (frame) => frame.type === "d_pi_control_state",
      )?.data;
      return actual?.queued === 0 && !actual.streaming;
    });
    const settled = (await request("d_pi_state")).data;
    assert.equal(settled.queueState.items.length, 0);
  }
  assert.equal(
    calls,
    8,
    "all mode preserves one original batch on both cancel and save",
  );
  assert.ok(
    frames.filter(
      (frame) =>
        frame.type === "message_end" &&
        frame.message?.customType === "ultrathink-notice",
    ).length >= 2,
    "original native hidden companions reach transcript with their batches",
  );
  if (process.env.D_PI_NATIVE_EVIDENCE) {
    const path = resolve(process.env.D_PI_NATIVE_EVIDENCE);
    await mkdir(join(path, ".."), { recursive: true });
    await writeFile(
      path,
      frames.map((frame) => JSON.stringify(frame)).join("\n") + "\n",
    );
    console.log(
      `Recorded fixed-SDK frames from isolated local provider fixture: ${path}`,
    );
  }
  console.log(
    "PASS: native queue identities/edit draft/cancel/reorder/delete, target delivery hold without skipping, independent stop/save/continue on same fixed SDK session",
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
