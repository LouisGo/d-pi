import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join, resolve } from "node:path";
import { createTestEnvironment } from "../../scripts/testing/test-environment.mjs";

// A disposable local-provider trial, not a real supplier or model evaluation.
// The unmodified package owns all GUI, receipts, SDK tools and native queue work.
const sandbox = createTestEnvironment({ prefix: "d-pi-s5-trial-" });
const bundle = join(sandbox.root, "S5 Trial", "d-pi.app");
const coldReopen = process.argv.includes("--cold-reopen");
cpSync(
  resolve(
    process.argv.slice(2).find((argument) => !argument.startsWith("--")) ??
      "dist/s5-candidate/mac-arm64/d-pi.app",
  ),
  bundle,
  {
    recursive: true,
    verbatimSymlinks: true,
  },
);
const identifier = "local.d-pi.s5-trial";
const plist = spawnSync(
  "/usr/libexec/PlistBuddy",
  [
    "-c",
    `Set :CFBundleIdentifier ${identifier}`,
    join(bundle, "Contents/Info.plist"),
  ],
  { env: sandbox.env, encoding: "utf8" },
);
assert.equal(plist.status, 0, plist.stderr);
const project = sandbox.cwd;
writeFileSync(join(project, "sample.ts"), "export const value = 1;\n");
for (const args of [
  ["init", "-q"],
  ["add", "sample.ts"],
  [
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@invalid",
    "-c",
    "commit.gpgsign=false",
    "commit",
    "-qm",
    "fixture",
  ],
]) {
  const result = spawnSync("/usr/bin/git", ["-C", project, ...args], {
    env: sandbox.env,
  });
  assert.equal(result.status, 0, result.stderr?.toString());
}
writeFileSync(join(project, "sample.ts"), "export const value = 2;\n");
assert.equal(
  spawnSync("/usr/bin/git", ["-C", project, "add", "sample.ts"], {
    env: sandbox.env,
  }).status,
  0,
);
writeFileSync(join(project, "sample.ts"), "  export const value = 3;  \n");
writeFileSync(
  join(project, "notes.txt"),
  "Untracked fixture; Git does not identify an author.\n",
);
mkdirSync(join(sandbox.config, "extensions"));
writeFileSync(
  join(sandbox.config, "extensions", "s5.ts"),
  `import { writeFileSync } from 'node:fs';
export default function(pi) { pi.registerCommand('s5ask', { description: 'S5 isolated fixture', handler: async (_, ctx) => {
  const confirm = await ctx.ui.confirm('S5 确认', '隔离测试：确认后进入另外三类交互');
  const select = await ctx.ui.select('S5 选择', ['选项甲', '选项乙']);
  const input = await ctx.ui.input('S5 输入');
  const editor = await ctx.ui.editor('S5 编辑', '预填内容');
  writeFileSync(${JSON.stringify(join(project, "answers.json"))}, JSON.stringify({ confirm, select, input, editor }));
} }); }`,
);

let requests = 0;
const sockets = new Set();
const server = createServer(async (req, res) => {
  let raw = "";
  for await (const chunk of req) raw += chunk.toString();
  const body = JSON.parse(raw);
  const messages = body.messages ?? [];
  const last = messages.at(-1);
  const text =
    typeof last?.content === "string"
      ? last.content
      : JSON.stringify(last?.content ?? "");
  requests++;
  console.log(
    `Fixture provider request ${requests}; no external supplier contacted`,
  );
  if (last?.role === "user" && text.includes("S5_FAIL")) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: {
          message: "S5 isolated provider failure",
          type: "invalid_request_error",
        },
      }),
    );
    return;
  }
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  const frame = (delta, finish_reason) =>
    `data: ${JSON.stringify({ id: "s5-fixture", object: "chat.completion.chunk", created: 1, model: "fixture", choices: [{ index: 0, delta, finish_reason }] })}\n\n`;
  if (last?.role === "user" && text.includes("S5_WRITE")) {
    res.write(
      frame(
        {
          role: "assistant",
          tool_calls: [
            {
              index: 0,
              id: `s5-write-${requests}`,
              type: "function",
              function: {
                name: "write",
                arguments: JSON.stringify({
                  path: "native-evidence.txt",
                  content: "S5 native tool fixture\n",
                }),
              },
            },
          ],
        },
        null,
      ),
    );
    res.write(frame({}, "tool_calls"));
    res.end("data: [DONE]\n\n");
    return;
  }
  res.write(
    frame(
      {
        role: "assistant",
        content:
          last?.role === "user" && text.includes("S5_HOLD")
            ? "S5 本地 fixture 正在保持执行，供排队/停止/关窗检查。"
            : "S5 本地 fixture 回复。执行、工具与历史由包内官方 OMP SDK 处理；此文本不是供应商模型结果。\n\n```ts\nconst fixture = true;\n```",
      },
      null,
    ),
  );
  if (last?.role === "user" && text.includes("S5_HOLD")) return;
  res.write(frame({}, "stop"));
  res.end("data: [DONE]\n\n");
});
server.on("connection", (socket) => {
  sockets.add(socket);
  socket.on("close", () => sockets.delete(socket));
});
await new Promise((accept) => server.listen(0, "127.0.0.1", accept));
writeFileSync(
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
            name: "S5 local fixture",
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
writeFileSync(
  join(sandbox.config, "config.yml"),
  JSON.stringify({
    autolearn: { enabled: false },
    modelRoles: { default: "fixture/fixture", smol: "fixture/fixture" },
  }),
);
const metadata = {
  bundle,
  identifier,
  root: sandbox.root,
  project,
  data: sandbox.data,
  config: sandbox.config,
  sessions: sandbox.sessions,
  supplier: "localhost fixture only",
  coldReopen,
};
writeFileSync(
  join(sandbox.root, "trial.json"),
  JSON.stringify(metadata, null, 2) + "\n",
);
console.log(JSON.stringify(metadata, null, 2));
console.log(
  "选择上面的 project → 保持仅浏览查看文件/Diff → 允许执行并启动 OMP。发送 S5_WRITE，查看真实 write 结果；发送 /s5ask 回答四类交互。发送 S5_HOLD 后排队发送 S5_NEXT，停止保留队列，关窗重开，明确继续。队列非空没有放弃退出出口；继续处理完成后再正常退出。S5_FAIL 是可选的失败反馈样本。",
);
console.log(
  "App 数据/OMP 配置/项目均隔离，不继承个人凭据；退出保留临时目录以供复查。测试副本仅改 Bundle ID，正式候选不变。",
);
console.log(
  "完整退出后不要从 Finder 冷启动测试副本：应重跑本命令，或使用 --cold-reopen 在同一隔离环境自动重开一次。",
);
const launches = [];
function launch() {
  const callsAtStart = requests;
  const child = spawn(join(bundle, "Contents/MacOS/d-pi"), ["--lang=zh-CN"], {
    env: sandbox.env,
    stdio: "inherit",
  });
  child.once("exit", (code, signal) => {
    launches.push({ code, signal, callsAtStart, callsAtExit: requests });
    writeFileSync(
      join(sandbox.root, "trial-result.json"),
      JSON.stringify(
        { ...metadata, providerRequests: requests, launches },
        null,
        2,
      ) + "\n",
    );
    if (coldReopen && launches.length === 1 && code === 0 && signal === null) {
      console.log(
        "同一隔离环境冷重开：旧 Thread 继续只读，检查草稿、历史与文件后再次正常退出。",
      );
      launch();
      return;
    }
    for (const socket of sockets) socket.destroy();
    server.close();
    process.exitCode = code ?? 1;
  });
}
launch();
