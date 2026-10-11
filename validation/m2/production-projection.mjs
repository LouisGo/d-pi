import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";

const root = process.env.D_PI_PERFORMANCE_ROOT;
assert(root);
const isolation = JSON.parse(
  readFileSync(join(root, "isolation.json"), "utf8"),
);
const config = join(root, "projection-config");
mkdirSync(config, { recursive: true });
const requests = [];
const server = createServer(async (request, response) => {
  let body = "";
  for await (const chunk of request) body += chunk.toString();
  const payload = JSON.parse(body);
  const text = JSON.stringify(
    payload.messages?.filter((m) => m.role === "user").at(-1)?.content,
  );
  const real = text?.includes("PERF_PROJECTION_NATIVE_PRODUCER");
  requests.push({ at: Date.now(), bytes: Buffer.byteLength(body), real });
  response.writeHead(200, { "Content-Type": "text/event-stream" });
  const frame = (text, reason = null) =>
    `data: ${JSON.stringify({ id: "projection-fixture", object: "chat.completion.chunk", created: 1, model: "fixture", choices: [{ index: 0, delta: { content: text }, finish_reason: reason }] })}\n\n`;
  if (!real) {
    response.end(frame("Isolated fixture title", "stop") + "data: [DONE]\n\n");
    return;
  }
  for (let i = 0; i < 600; i++) {
    response.write(
      frame(
        `中文真实原生流 ${i} ${createHash("sha256").update(String(i)).digest("hex")}\n`,
      ),
    );
    await new Promise((r) => setTimeout(r, 10));
  }
  response.end(frame("实际流结束", "stop") + "data: [DONE]\n\n");
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const models = JSON.parse(
  readFileSync(join(isolation.config, "models.yml"), "utf8"),
);
models.providers.fixture.baseUrl = `http://127.0.0.1:${server.address().port}/v1`;
writeFileSync(join(config, "models.yml"), JSON.stringify(models));
writeFileSync(
  join(config, "config.yml"),
  readFileSync(join(isolation.config, "config.yml")),
);
const child = spawn(
  join(root, "resources/sdk/bun"),
  [join(root, "out/projection/production-projection.js")],
  {
    cwd: isolation.cwd,
    env: {
      ...isolation.env,
      PI_CODING_AGENT_DIR: config,
      D_PI_PERFORMANCE_ROOT: root,
    },
    stdio: "inherit",
  },
);
const result = await new Promise((r) => {
  child.once("error", (e) => r({ error: e.message }));
  child.once("exit", (code, signal) => r({ code, signal }));
});
server.closeAllConnections();
await new Promise((r) => server.close(r));
writeFileSync(
  join(root, "native-projection-run.json"),
  JSON.stringify({ result, requests }, null, 2),
);
assert.equal(result.code, 0, JSON.stringify(result));
assert.equal(result.signal, null);
