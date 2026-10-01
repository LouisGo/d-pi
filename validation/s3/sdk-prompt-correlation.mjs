import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const sdk = resolve(process.env.SDK_ROOT ?? "resources/sdk");
const module = join(
  sdk,
  "node_modules/@oh-my-pi/pi-coding-agent/src/modes/rpc/rpc-prompt-results.ts",
);
// This is the real native correlation class with controlled AgentSession events,
// separate from the localhost RPC recording; no account or provider is invoked.
const code = `
import { RpcPromptResults } from ${JSON.stringify(module)};
import { RpcSessionSettleWatcher } from ${JSON.stringify(join(dirname(module), "rpc-session-settle.ts"))};
const frames = [];
let background = false;
let releaseBackground;
const backgroundDone = new Promise((resolve) => { releaseBackground = resolve; });
const session = { isStreaming: true, hasAdmittedSubmission: false, queuedMessageCount: 0, hasPendingAsyncWork: () => background, settleAsyncWork: () => backgroundDone };
const results = new RpcPromptResults(session, (frame) => frames.push(frame));
const tick = () => new Promise((resolve) => setImmediate(resolve));
results.observe({ type: "agent_start" });
const fresh = results.begin("fresh-after-old");
// Old run yielded after the fresh command was accepted; it is not fresh's run.
results.observe({ type: "agent_end", isTerminal: true, messages: [{ role: "assistant", stopReason: "stop" }] });
await tick();
if (frames.length !== 0) throw Error("Old run incorrectly settled fresh prompt");
results.observe({ type: "agent_start" });
results.settle(fresh);
session.isStreaming = false;
results.observe({ type: "agent_end", isTerminal: true, messages: [{ role: "assistant", stopReason: "error", api: "openai-completions", provider: "fixture", model: "fixture", errorMessage: "fixture-error", errorStatus: 503 }] });
await tick();
const first = results.begin("queued-first");
const second = results.begin("queued-second");
session.isStreaming = true;
session.queuedMessageCount = 2;
results.settle(first);
results.settle(second);
results.observe({ type: "agent_end", isTerminal: true, messages: [{ role: "assistant", stopReason: "stop" }] });
await tick();
if (frames.length !== 1) throw Error("Still-queued input incorrectly completed");
session.queuedMessageCount = 0;
session.isStreaming = false;
results.observe({ type: "agent_end", isTerminal: true, messages: [{ role: "assistant", stopReason: "stop" }] });
await tick();
const watcher = new RpcSessionSettleWatcher(session, (frame) => frames.push(frame));
const backgroundPrompt = results.begin("completed-with-background");
session.isStreaming = true;
background = true;
results.observe({ type: "agent_start" });
watcher.observe({ type: "agent_start" });
results.settle(backgroundPrompt);
session.isStreaming = false;
const end = { type: "agent_end", isTerminal: true, messages: [{ role: "assistant", stopReason: "stop" }] };
results.observe(end);
watcher.observe(end);
await tick();
await tick();
if (frames.at(-1)?.sessionSettled !== false) throw Error("Background work incorrectly settled prompt");
if (frames.some((frame) => frame.type === "session_settled")) throw Error("Background work incorrectly settled session");
background = false;
releaseBackground();
await tick();
await tick();
if (frames.at(-1)?.type !== "session_settled") throw Error("Drained background work failed to settle session");
console.log(JSON.stringify(frames));
`;
const result = spawnSync(join(sdk, "bun"), ["--eval", code], {
  env: { PATH: "/usr/bin:/bin" },
  encoding: "utf8",
  timeout: 10000,
});
assert.equal(result.status, 0, result.stderr);
const frames = JSON.parse(result.stdout.trim());
assert.deepEqual(
  frames
    .filter((frame) => frame.type === "prompt_result")
    .map((frame) => [frame.id, frame.status]),
  [
    ["fresh-after-old", "error"],
    ["queued-first", "completed"],
    ["queued-second", "completed"],
    ["completed-with-background", "completed"],
  ],
);
assert.equal(frames[0].error.httpStatus, 503);
if (process.env.D_PI_NATIVE_EVIDENCE) {
  const path = resolve(process.env.D_PI_NATIVE_EVIDENCE);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(
    path,
    frames.map((frame) => JSON.stringify(frame)).join("\n") + "\n",
  );
  const version = JSON.parse(
    await readFile(
      join(sdk, "node_modules/@oh-my-pi/pi-coding-agent/package.json"),
      "utf8",
    ),
  ).version;
  await writeFile(
    `${path}.metadata.json`,
    JSON.stringify(
      {
        sdk: version,
        source:
          "real RpcPromptResults and RpcSessionSettleWatcher with controlled AgentSession events",
        providerCalls: 0,
        cases: [
          "old run yield cannot settle newly accepted prompt",
          "queued messages must drain before queued prompt results",
          "completed prompt remains sessionSettled false until background work drains",
        ],
      },
      null,
      2,
    ) + "\n",
  );
}
console.log(
  "PASS: native correlation keeps old runs, queued prompts, and background settlement independent",
);
