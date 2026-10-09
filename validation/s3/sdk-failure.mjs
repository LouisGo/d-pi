import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { createTestEnvironment } from "../../scripts/testing/test-environment.mjs";

// No provider credentials are available. A localhost endpoint also makes an
// unexpected model call observable without sending fixture content elsewhere.
const sandbox = createTestEnvironment({ prefix: "d-pi-sdk-failure-" });
let calls = 0;
const server = createServer((_request, response) => {
  calls++;
  response.writeHead(401);
  response.end("fixture: missing credentials");
});
await new Promise((accept) => server.listen(0, "127.0.0.1", accept));
await writeFile(
  resolve(sandbox.config, "models.yml"),
  JSON.stringify({
    providers: {
      fixture: {
        // A valid declaration whose credential command deterministically returns no key.
        apiKey: "!exit 1",
        baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
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
  resolve(sandbox.config, "config.yml"),
  JSON.stringify({
    autolearn: { enabled: false },
    modelRoles: { default: "fixture/fixture", smol: "fixture/fixture" },
  }),
);
const sdk = resolve(process.env.SDK_ROOT ?? "resources/sdk");
const child = spawn(resolve(sdk, "bun"), [resolve(sdk, "host.mjs")], {
  cwd: sandbox.cwd,
  env: sandbox.env,
  stdio: ["pipe", "pipe", "pipe"],
});
const frames = [];
let stderr = "";
child.stderr.on("data", (bytes) => {
  stderr = (stderr + bytes).slice(-4096);
});
createInterface({ input: child.stdout }).on("line", (line) => {
  frames.push(JSON.parse(line));
});
const wait = async (predicate) => {
  const deadline = Date.now() + 30000;
  while (!predicate()) {
    if (Date.now() >= deadline || child.exitCode !== null)
      throw Error(`SDK failure evidence unavailable: ${stderr}`);
    await new Promise((accept) => setTimeout(accept, 25));
  }
};
try {
  await wait(() => frames.some((frame) => frame.type === "ready"));
  const id = crypto.randomUUID();
  child.stdin.write(
    `${JSON.stringify({ type: "prompt", id, message: "FIXTURE_NO_CREDENTIALS" })}\n`,
  );
  await wait(() =>
    frames.some(
      (frame) =>
        frame.type === "prompt_result" &&
        frame.id === id &&
        frame.status === "error",
    ),
  );
  const replies = frames.filter(
    (frame) =>
      frame.type === "response" &&
      frame.id === id &&
      frame.command === "prompt",
  );
  assert.deepEqual(
    replies.map((frame) => frame.success),
    [true, false],
  );
  const result = frames.find(
    (frame) => frame.type === "prompt_result" && frame.id === id,
  );
  assert.equal(result.status, "error");
  assert.equal(result.error.retryable, false);
  assert.equal(result.agentInvoked, false);
  assert.equal(typeof result.sessionSettled, "boolean");
  assert.equal(calls, 0, "credential rejection must not invoke any provider");
  if (process.env.D_PI_NATIVE_EVIDENCE) {
    const path = resolve(process.env.D_PI_NATIVE_EVIDENCE);
    await mkdir(resolve(path, ".."), { recursive: true });
    await writeFile(
      path,
      (frames.map((frame) => JSON.stringify(frame)).join("\n") + "\n")
        .split(sandbox.root)
        .join("/isolated-native"),
    );
    const version = JSON.parse(
      await readFile(
        resolve(sdk, "node_modules/@oh-my-pi/pi-coding-agent/package.json"),
        "utf8",
      ),
    ).version;
    await writeFile(
      `${path}.metadata.json`,
      JSON.stringify(
        {
          sdk: version,
          provider: "no credentials; isolated localhost",
          promptId: id,
          providerCalls: calls,
        },
        null,
        2,
      ) + "\n",
    );
  }
  console.log(
    "PASS: fixed SDK resource accepts prompt, then reports prompt_result error with the same request ID; provider calls: 0",
  );
} finally {
  child.stdin.end();
  const kill = setTimeout(() => child.kill("SIGKILL"), 3000);
  await new Promise((accept) =>
    child.exitCode !== null ? accept() : child.once("exit", accept),
  );
  clearTimeout(kill);
  await new Promise((accept) => server.close(accept));
  sandbox.cleanup();
}
