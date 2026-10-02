import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  copyFileSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { createTestEnvironment } from "../../scripts/testing/test-environment.mjs";

const isolated = createTestEnvironment({ prefix: "d-pi-m2-auth-" });
const sdk = resolve("resources/sdk");
let entry = join(sdk, "configuration.mjs");
if (process.env.D_PI_CONFIGURATION_SOURCE === "1") {
  const adapter = join(isolated.root, "adapter");
  const scope = join(adapter, "node_modules", "@oh-my-pi");
  mkdirSync(scope, { recursive: true });
  const coding = realpathSync("node_modules/@oh-my-pi/pi-coding-agent");
  for (const name of readdirSync(join(coding, ".."))) {
    try {
      symlinkSync(realpathSync(join(coding, "..", name)), join(scope, name));
    } catch {}
  }
  for (const name of [
    "configuration.mjs",
    "configuration-readonly.mjs",
    "model-selection.mjs",
  ])
    copyFileSync(resolve("runtime", name), join(adapter, name));
  entry = join(adapter, "configuration.mjs");
}
const preload = join(isolated.root, "auth-fetch.mjs");
writeFileSync(
  preload,
  `globalThis.fetch = async (input, init) => {
 const url = String(input instanceof Request ? input.url : input);
 if (url !== 'https://api.deepseek.com/v1/models') throw Error('Unexpected network boundary');
 const mode = process.env.FIXTURE_AUTH_STATUS;
 if (mode === 'network') throw Object.assign(new TypeError('private fixture-key text'), {cause: {code: 'ECONNREFUSED'}});
 if (mode === 'timeout') throw new DOMException('private fixture-key text', 'TimeoutError');
 if (mode === 'unknown') throw Error('private fixture-key text');
 if ((init?.method ?? 'GET').toUpperCase() !== 'GET') throw Error('Unexpected billed request');
 return new Response(process.env.FIXTURE_AUTH_STATUS === '401' ? '{"error":{"message":"rejected fixture"}}' : '{"data":[{"id":"fixture"}]}', {
  status: Number(process.env.FIXTURE_AUTH_STATUS ?? 200), headers: {'Content-Type':'application/json'}
 });
};`,
);
function run(frame, status = 200) {
  const traceId = randomUUID();
  const scope = { kind: "application" };
  const process = spawnSync(join(sdk, "bun"), ["--preload", preload, entry], {
    cwd: isolated.cwd,
    env: { ...isolated.env, FIXTURE_AUTH_STATUS: String(status) },
    input: JSON.stringify({ ...frame, scope, traceId }) + "\n",
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
    timeout: 30000,
  });
  assert.equal(process.status, 0, process.stderr);
  const reply = JSON.parse(process.stdout.trim()).message;
  assert.equal(reply.traceId, traceId);
  assert.deepEqual(reply.scope, scope);
  assert.equal(reply.source.cwd, isolated.cwd);
  const {
    scope: _scope,
    traceId: _traceId,
    source: _source,
    ...result
  } = reply;
  return result;
}
const before = run({ kind: "snapshot" });
assert.equal(before.deepseekAuthenticated, false);
assert.equal(
  before.models.some((m) => m.available),
  false,
);
assert.deepEqual(run({ kind: "save-key", key: "Bearer fixture-original" }), {
  kind: "done",
});
assert.deepEqual(run({ kind: "save-key", key: "fixture-rejected" }, 401), {
  kind: "failed",
  code: "authentication-rejected",
});
for (const [status, code] of [
  [403, "authentication-rejected"],
  [429, "authentication-provider-unavailable"],
  [503, "authentication-provider-unavailable"],
  ["network", "authentication-network"],
  ["timeout", "operation-timed-out"],
  ["unknown", "authentication-failed"],
]) {
  const result = run({ kind: "save-key", key: "fixture-rejected" }, status);
  assert.deepEqual(result, { kind: "failed", code });
  assert.ok(!JSON.stringify(result).includes("fixture-key"));
}
// Query the native credential cascade, compare inside this process, print no secret.
const probe = join(isolated.root, "auth-probe.mjs");
symlinkSync(
  process.env.D_PI_CONFIGURATION_SOURCE === "1"
    ? join(isolated.root, "adapter", "node_modules")
    : join(sdk, "node_modules"),
  join(isolated.root, "node_modules"),
  "dir",
);
writeFileSync(
  probe,
  `import { getAgentDir } from '@oh-my-pi/pi-utils';
import { discoverAuthStorage } from '@oh-my-pi/pi-coding-agent/session/auth-broker-config';
const auth = await discoverAuthStorage(getAgentDir());
console.log(JSON.stringify({oldCredentialPreserved: await auth.keys.peek('deepseek') === 'fixture-original'}));
auth.close();`,
);
const checked = spawnSync(join(sdk, "bun"), [probe], {
  cwd: isolated.cwd,
  env: isolated.env,
  encoding: "utf8",
  timeout: 30000,
});
assert.equal(checked.status, 0, checked.stderr);
assert.equal(JSON.parse(checked.stdout).oldCredentialPreserved, true);
const after = run({ kind: "snapshot" });
assert.equal(after.deepseekAuthenticated, true);
assert.ok(after.models.some((m) => m.provider === "deepseek" && m.available));
console.log(
  JSON.stringify({
    root: isolated.root,
    sdkVersion: JSON.parse(
      readFileSync(
        process.env.D_PI_CONFIGURATION_SOURCE === "1"
          ? resolve("node_modules/@oh-my-pi/pi-coding-agent/package.json")
          : join(sdk, "manifest.json"),
      ),
    )[process.env.D_PI_CONFIGURATION_SOURCE === "1" ? "version" : "sdkVersion"],
    models: after.models.length,
    checks: [
      "isolated empty configuration",
      "native normalization and GET validation",
      "rejected, network, timeout and unknown failures preserve previous credential",
      "readonly native catalog composition after credential save",
    ],
    realSupplierRequests: 0,
  }),
);
