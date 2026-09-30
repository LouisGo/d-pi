import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { symlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createTestEnvironment } from "../../scripts/test-environment.mjs";

const isolated = createTestEnvironment({ prefix: "d-pi-m2-auth-" });
const sdk = resolve("resources/sdk");
const preload = join(isolated.root, "auth-fetch.mjs");
writeFileSync(
  preload,
  `globalThis.fetch = async (input, init) => {
 const url = String(input instanceof Request ? input.url : input);
 if (url !== 'https://api.deepseek.com/v1/models') throw Error('Unexpected network boundary');
 if ((init?.method ?? 'GET').toUpperCase() !== 'GET') throw Error('Unexpected billed request');
 return new Response(process.env.FIXTURE_AUTH_STATUS === '401' ? '{"error":{"message":"rejected fixture"}}' : '{"data":[{"id":"fixture"}]}', {
  status: Number(process.env.FIXTURE_AUTH_STATUS ?? 200), headers: {'Content-Type':'application/json'}
 });
};`,
);
function run(frame, status = 200) {
  const process = spawnSync(
    join(sdk, "bun"),
    ["--preload", preload, join(sdk, "configuration.mjs")],
    {
      cwd: isolated.cwd,
      env: { ...isolated.env, FIXTURE_AUTH_STATUS: String(status) },
      input: JSON.stringify({ ...frame, traceId: randomUUID() }) + "\n",
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
      timeout: 30000,
    },
  );
  assert.equal(process.status, 0, process.stderr);
  const reply = JSON.parse(process.stdout.trim()).message;
  return reply;
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
  code: "authentication-failed",
});
// Query the native credential cascade, compare inside this process, print no secret.
const probe = join(isolated.root, "auth-probe.mjs");
symlinkSync(
  join(sdk, "node_modules"),
  join(isolated.root, "node_modules"),
  "dir",
);
writeFileSync(
  probe,
  `import { getAgentDir } from '@oh-my-pi/pi-utils';
import { discoverAuthStorage } from '@oh-my-pi/pi-coding-agent/sdk';
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
    models: after.models.length,
    checks: [
      "isolated empty configuration",
      "native normalization and GET validation",
      "invalid key preserves previous credential",
      "native catalog refresh",
    ],
    realSupplierRequests: 0,
  }),
);
