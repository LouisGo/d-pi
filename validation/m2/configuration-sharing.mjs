import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import {
  copyFileSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { createTestEnvironment } from "../../scripts/test-environment.mjs";

const sdk = resolve(process.env.D_PI_CONFIGURATION_SDK ?? "resources/sdk");
const isolated = createTestEnvironment({ prefix: "d-pi-config-sharing-" });
const adapter = join(isolated.root, "adapter");
mkdirSync(adapter);
symlinkSync(
  process.env.D_PI_CONFIGURATION_SOURCE === "1"
    ? resolve("node_modules")
    : join(sdk, "node_modules"),
  join(adapter, "node_modules"),
);
for (const name of [
  "configuration.mjs",
  "configuration-readonly.mjs",
  "model-selection.mjs",
])
  copyFileSync(
    process.env.D_PI_CONFIGURATION_SOURCE === "1"
      ? resolve("runtime", name)
      : join(sdk, name),
    join(adapter, name),
  );
const guard = join(adapter, "network-guard.mjs");
writeFileSync(
  guard,
  "globalThis.fetch = () => { throw Error('network forbidden'); };\n",
);
const fixture = join(adapter, "cli-login.mjs");
writeFileSync(
  fixture,
  `import { AuthStorage } from '@oh-my-pi/pi-ai/auth-storage';
import { getAgentDbPath, getAgentDir } from '@oh-my-pi/pi-utils';
import { Settings } from '@oh-my-pi/pi-coding-agent/config/settings';
import { Database } from 'bun:sqlite';
import { getModelDbPath } from '@oh-my-pi/pi-utils';
import { getBundledModel } from '@oh-my-pi/pi-catalog/models';
import { writeModelCache } from '@oh-my-pi/pi-catalog/model-cache';
import { resolveModelCacheProviderId } from '@oh-my-pi/pi-catalog/provider-models';
const settings = await Settings.init({cwd: process.cwd(), agentDir: getAgentDir()});
settings.setModelRole('default', 'openai-codex/gpt-6-sol');
await settings.flush();
const auth = await AuthStorage.create(getAgentDbPath());
await auth.credentials.set('openai-codex', {
 type: 'oauth', access: 'fixture-access', refresh: 'fixture-refresh',
 expires: Date.now() + 86400000,
});
const cacheId = resolveModelCacheProviderId('openai-codex');
writeModelCache(cacheId, Date.now(), [], false, '', getModelDbPath());
const cacheHolder = new Database(getModelDbPath());
cacheHolder.query('SELECT COUNT(*) FROM model_cache').get();
writeModelCache(cacheId, Date.now(), [{...getBundledModel('openai-codex', 'gpt-6-sol'), id:'fixture-cli-cached', name:'CLI discovered model'}], false, '', getModelDbPath());
console.log('ready');
process.stdin.on('data', () => { cacheHolder.close(); auth.close(); process.exit(); });`,
);
const checks = [];
function readSnapshot() {
  const traceId = randomUUID();
  const result = spawnSync(
    join(sdk, "bun"),
    ["--preload", guard, join(adapter, "configuration.mjs")],
    {
      cwd: isolated.cwd,
      env: { ...isolated.env, BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0" },
      input:
        JSON.stringify({
          kind: "snapshot",
          scope: { kind: "application" },
          traceId,
        }) + "\n",
      encoding: "utf8",
      timeout: 30000,
      maxBuffer: 8 * 1024 * 1024,
    },
  );
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout.trim()).message;
}
function persistentFiles({ coordinationModes = true } = {}) {
  return Object.fromEntries(
    readdirSync(isolated.config)
      .filter((name) => !name.endsWith("-shm"))
      .map((name) => [
        name,
        {
          hash: createHash("sha256")
            .update(readFileSync(join(isolated.config, name)))
            .digest("hex"),
          // SQLite may reset WAL coordination permissions after the writer
          // closes. Source bytes and source-file permissions must still match.
          ...(coordinationModes || !name.endsWith("-wal")
            ? { mode: statSync(join(isolated.config, name)).mode }
            : {}),
        },
      ]),
  );
}
let writer;
let writerTimeout;
try {
  writer = spawn(join(sdk, "bun"), ["--preload", guard, fixture], {
    cwd: isolated.cwd,
    env: isolated.env,
    stdio: ["pipe", "pipe", "pipe"],
  });
  writerTimeout = setTimeout(() => writer?.kill(), 30000);
  let fixtureError = "";
  writer.stderr.on("data", (bytes) => {
    fixtureError += bytes;
  });
  const lines = createInterface({ input: writer.stdout });
  const ready = await Promise.race([
    once(lines, "line").then(([line]) => line),
    once(writer, "exit").then(([code]) => {
      throw Error(`fixture exited: ${code}: ${fixtureError}`);
    }),
  ]);
  assert.equal(ready, "ready");
  clearTimeout(writerTimeout);
  assert.ok(statSync(join(isolated.config, "agent.db-wal")).size > 0);
  const before = persistentFiles();
  const snapshot = readSnapshot();
  assert.equal(
    snapshot.openaiAuthenticated,
    true,
    JSON.stringify(snapshot.issues),
  );
  assert.equal(snapshot.defaultModel, "openai-codex/gpt-6-sol");
  assert.ok(
    snapshot.models.some(
      (model) =>
        model.provider === "openai-codex" &&
        model.id === "gpt-6-sol" &&
        model.available,
    ),
  );
  assert.ok(
    snapshot.models.some(
      (model) =>
        model.provider === "openai-codex" &&
        model.id === "fixture-cli-cached" &&
        model.available,
    ),
    "desktop must reuse CLI-discovered models, not just bundled models",
  );
  assert.deepEqual(
    persistentFiles(),
    before,
    "reading must not checkpoint, migrate or change stored credentials/settings",
  );
  checks.push(
    "CLI login in live WAL is readable by desktop",
    "CLI cached models in live WAL are reused without source writes",
  );
  writer.stdin.end("close");
  await once(writer, "exit");
  writer = null;
  const rejectCacheFixture = join(adapter, "reject-cache.mjs");
  writeFileSync(
    rejectCacheFixture,
    `
import { Database } from 'bun:sqlite';
import { getModelDbPath } from '@oh-my-pi/pi-utils';
import { getBundledModel } from '@oh-my-pi/pi-catalog/models';
import { writeModelCache } from '@oh-my-pi/pi-catalog/model-cache';
import { resolveModelCacheProviderId } from '@oh-my-pi/pi-catalog/provider-models';
const provider = resolveModelCacheProviderId('openai-codex');
writeModelCache(provider, Date.now(), [{...getBundledModel('openai-codex', 'gpt-6-sol'), id:'fixture-cli-cached', name:'CLI discovered model'}], false, '', getModelDbPath());
const db = new Database(getModelDbPath());
const mode = process.argv.at(-1);
if(mode === 'models') db.query('UPDATE model_cache SET models=? WHERE provider_id=?').run('not-json', provider);
else if(mode === 'policy') db.query('UPDATE model_cache SET materialization_policy=? WHERE provider_id=?').run('incompatible-policy', provider);
else if(mode === 'version') db.query('UPDATE model_cache SET version=? WHERE provider_id=?').run(-1, provider);
else throw Error('unexpected fixture mode');
db.close();
`,
  );
  for (const mode of ["models", "policy", "version"]) {
    const mutated = spawnSync(join(sdk, "bun"), [rejectCacheFixture, mode], {
      cwd: isolated.cwd,
      env: isolated.env,
      encoding: "utf8",
      timeout: 30000,
    });
    assert.equal(mutated.status, 0, mutated.stderr);
    const corruptedSource = persistentFiles({ coordinationModes: false });
    const rejected = readSnapshot();
    assert.equal(
      rejected.coverage,
      "partial",
      `rejected ${mode} cache must not report complete`,
    );
    assert.ok(rejected.issues.includes("catalog-cache-rejected"));
    assert.equal(
      rejected.models.some((model) => model.id === "fixture-cli-cached"),
      false,
    );
    assert.equal(rejected.openaiAuthenticated, true);
    assert.deepEqual(
      persistentFiles({ coordinationModes: false }),
      corruptedSource,
      "rejection must not repair or delete source rows",
    );
  }
  checks.push(
    "native rejection of corrupt and incompatible model cache rows is partial without source writes",
  );
  // A fresh home has the bundled runtime but no separately installed omp CLI.
  for (const name of readdirSync(isolated.config))
    rmSync(join(isolated.config, name), { recursive: true, force: true });
  assert.equal(readSnapshot().openaiAuthenticated, false);
  assert.equal(
    spawnSync("omp", ["--version"], { env: isolated.env }).error?.code,
    "ENOENT",
  );
  const authGuard = join(adapter, "auth-fixture.mjs");
  writeFileSync(
    authGuard,
    `
const token = 'fixture.' + Buffer.from(JSON.stringify({
 'https://api.openai.com/auth': {chatgpt_account_id:'fixture-account'},
 'https://api.openai.com/profile': {email:'fixture@example.test'}
})).toString('base64url') + '.fixture';
globalThis.fetch = async (input, init) => {
 const url = String(input instanceof Request ? input.url : input);
 if (url === 'https://auth.openai.com/oauth/token') return Response.json({access_token:token,refresh_token:'fixture-refresh',expires_in:3600});
 if (url === 'https://api.deepseek.com/v1/models' && (init?.method ?? 'GET') === 'GET') return Response.json({data:[{id:'deepseek-chat'}]});
 throw Error('Unexpected network boundary');
};`,
  );
  async function desktopCommand(command) {
    const traceId = randomUUID();
    const job = spawn(
      join(sdk, "bun"),
      ["--preload", authGuard, join(adapter, "configuration.mjs")],
      {
        cwd: isolated.cwd,
        env: isolated.env,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    const output = createInterface({ input: job.stdout });
    const timeout = setTimeout(() => job.kill(), 30000);
    try {
      const completed = new Promise((resolve, reject) => {
        output.on("line", (line) => {
          try {
            const message = JSON.parse(line).message;
            if (message.kind === "challenge") {
              const authorize = new URL(message.url);
              const callback = new URL(
                authorize.searchParams.get("redirect_uri"),
              );
              assert.ok(["localhost", "127.0.0.1"].includes(callback.hostname));
              callback.searchParams.set(
                "state",
                authorize.searchParams.get("state"),
              );
              callback.searchParams.set("code", "fixture-code");
              // The native OAuth listener may close its socket immediately after
              // accepting the code. The adapter's persisted `done` is the result.
              void fetch(callback).catch(() => {});
            }
            if (message.kind === "done") resolve(message);
            if (message.kind === "failed") reject(Error(message.code));
          } catch (error) {
            reject(error);
          }
        });
        job.once("error", reject);
        job.once("exit", (code) => {
          reject(Error(`desktop auth exited before completion: ${code}`));
        });
      });
      job.stdin.write(
        JSON.stringify({
          ...command,
          traceId,
          scope: { kind: "application" },
        }) + "\n",
      );
      await completed;
      const exited = once(job, "exit");
      job.stdin.end();
      await exited;
    } finally {
      clearTimeout(timeout);
      output.close();
      if (job.exitCode === null && job.signalCode === null) job.kill();
    }
  }
  await desktopCommand({ kind: "login", jobId: randomUUID() });
  await desktopCommand({ kind: "save-key", key: "fixture-deepseek" });
  const fresh = readSnapshot();
  assert.equal(fresh.openaiAuthenticated, true);
  assert.equal(fresh.deepseekAuthenticated, true);
  checks.push(
    "desktop-only fresh home persists OpenAI OAuth and DeepSeek through official login flows",
  );
  const cliProbe = join(adapter, "cli-reuse.mjs");
  writeFileSync(
    cliProbe,
    `
import { getAgentDir } from '@oh-my-pi/pi-utils';
import { discoverAuthStorage } from '@oh-my-pi/pi-coding-agent/session/auth-broker-config';
import { Settings } from '@oh-my-pi/pi-coding-agent/config/settings';
import { ModelRegistry } from '@oh-my-pi/pi-coding-agent/config/model-registry';
const settings = await Settings.init({cwd:process.cwd(),agentDir:getAgentDir()});
const auth = await discoverAuthStorage(getAgentDir(),{settings,cwd:process.cwd()});
const registry = new ModelRegistry(auth,undefined,{settings});
console.log(JSON.stringify({directory:getAgentDir(),openai:auth.credentials.hasOAuth('openai-codex'),deepseek:auth.keys.source('deepseek') !== undefined,providers:[...new Set(registry.getAvailable().map(m=>m.provider))]}));
auth.close();
process.exit();`,
  );
  const cli = spawnSync(join(sdk, "bun"), ["--preload", guard, cliProbe], {
    cwd: isolated.cwd,
    env: isolated.env,
    encoding: "utf8",
    timeout: 30000,
  });
  assert.equal(cli.status, 0, cli.stderr);
  const reused = JSON.parse(cli.stdout.trim());
  assert.equal(reused.directory, isolated.config);
  assert.equal(reused.openai, true);
  assert.equal(reused.deepseek, true);
  assert.ok(reused.providers.includes("openai-codex"));
  assert.ok(reused.providers.includes("deepseek"));
  checks.push(
    "native CLI startup readers reuse desktop credentials and model availability",
  );
  const cliProcess = spawn(
    join(sdk, "bun"),
    [
      "--preload",
      guard,
      join(sdk, "node_modules/@oh-my-pi/pi-coding-agent/dist/cli.js"),
      "--mode",
      "rpc",
    ],
    { cwd: isolated.cwd, env: isolated.env, stdio: ["pipe", "pipe", "pipe"] },
  );
  const cliLines = createInterface({ input: cliProcess.stdout });
  const cliTimeout = setTimeout(() => cliProcess.kill(), 30000);
  let cliError = "";
  cliProcess.stderr.on("data", (bytes) => {
    cliError += bytes;
  });
  try {
    const available = new Promise((resolve, reject) => {
      cliLines.on("line", (line) => {
        try {
          const message = JSON.parse(line);
          if (message.id === "reuse-models") {
            if (!message.success) reject(Error("CLI model request failed"));
            else resolve(message.data.models);
          }
        } catch (error) {
          reject(error);
        }
      });
      cliProcess.once("error", reject);
      cliProcess.once("exit", (code) =>
        reject(Error(`CLI exited before model list: ${code}: ${cliError}`)),
      );
    });
    cliProcess.stdin.write(
      JSON.stringify({ type: "get_available_models", id: "reuse-models" }) +
        "\n",
    );
    const cliModels = await available;
    assert.ok(cliModels.some((model) => model.provider === "openai-codex"));
    assert.ok(cliModels.some((model) => model.provider === "deepseek"));
    checks.push(
      "actual official CLI RPC model list reuses desktop login without reconfiguration",
    );
  } finally {
    clearTimeout(cliTimeout);
    cliLines.close();
    if (cliProcess.exitCode === null && cliProcess.signalCode === null) {
      const exited = once(cliProcess, "exit");
      cliProcess.kill();
      await exited;
    }
  }
  console.log(JSON.stringify({ checks, realSupplierRequests: 0 }));
} finally {
  clearTimeout(writerTimeout);
  if (writer && writer.exitCode === null && writer.signalCode === null) {
    writer.stdin.end("close");
    await once(writer, "exit");
  }
  rmSync(realpathSync(isolated.root), { recursive: true, force: true });
}
