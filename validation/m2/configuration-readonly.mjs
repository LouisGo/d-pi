import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  copyFileSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { createTestEnvironment } from "../../scripts/test-environment.mjs";

const sdk = resolve("resources/sdk");
const isolated = createTestEnvironment({ prefix: "d-pi-config-readonly-" });
function inventory(root, relative = "") {
  const result = {};
  for (const name of readdirSync(join(root, relative))) {
    const path = join(relative, name);
    const stat = lstatSync(join(root, path));
    if (stat.isSymbolicLink())
      result[path] = { mode: stat.mode, link: readlinkSync(join(root, path)) };
    else if (stat.isDirectory()) {
      result[path] = { mode: stat.mode, directory: true };
      Object.assign(result, inventory(root, path));
    } else
      result[path] = {
        mode: stat.mode,
        hash: createHash("sha256")
          .update(readFileSync(join(root, path)))
          .digest("hex"),
      };
  }
  return result;
}
const agent = isolated.env.PI_CODING_AGENT_DIR;
mkdirSync(agent, { recursive: true });
writeFileSync(
  join(agent, "models.json"),
  JSON.stringify({
    providers: {
      fixture: {
        api: "openai-completions",
        baseUrl: "http://127.0.0.1:9",
        apiKey: "!touch should-not-exist",
        models: [
          {
            id: "custom",
            name: "Custom",
            reasoning: false,
            input: ["text"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 1000,
            maxTokens: 100,
          },
        ],
      },
    },
  }),
);
const guard = join(isolated.root, "readonly-guard.mjs");
writeFileSync(
  guard,
  "globalThis.fetch = () => { throw Error('Network forbidden during configuration query'); };\n",
);
let entry = join(sdk, "configuration.mjs");
if (process.env.D_PI_CONFIGURATION_SOURCE === "1") {
  const adapter = join(isolated.root, "adapter");
  mkdirSync(join(adapter, "node_modules", "@oh-my-pi"), { recursive: true });
  for (const name of [
    "configuration.mjs",
    "configuration-readonly.mjs",
    "model-selection.mjs",
  ])
    copyFileSync(resolve("runtime", name), join(adapter, name));
  const coding = realpathSync(
    resolve("node_modules", "@oh-my-pi", "pi-coding-agent"),
  );
  for (const name of readdirSync(join(coding, ".."))) {
    try {
      symlinkSync(
        realpathSync(join(coding, "..", name)),
        join(adapter, "node_modules", "@oh-my-pi", name),
      );
    } catch {}
  }
  entry = join(adapter, "configuration.mjs");
}
const checks = [];
function run(check, assertions, fixtureEnv = {}) {
  const before = inventory(isolated.root);
  const traceId = randomUUID();
  const scope = { kind: "application" };
  const result = spawnSync(join(sdk, "bun"), ["--preload", guard, entry], {
    cwd: isolated.cwd,
    env: {
      ...isolated.env,
      ...fixtureEnv,
      BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0",
    },
    input: JSON.stringify({ kind: "snapshot", scope, traceId }) + "\n",
    encoding: "utf8",
    timeout: 30000,
    maxBuffer: 8 * 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(
    inventory(isolated.root),
    before,
    check + ": native/project file set, hashes and modes stay unchanged",
  );
  const snapshot = JSON.parse(result.stdout.trim()).message;
  assert.equal(snapshot.kind, "snapshot");
  assert.deepEqual(snapshot.scope, scope);
  assert.equal(snapshot.traceId, traceId);
  assertions(snapshot);
  checks.push(check);
  return snapshot;
}
run(
  "legacy JSON, missing DB and command key without migration/helper/network",
  (snapshot) =>
    assert.ok(
      snapshot.models.some(
        (model) => model.provider === "fixture" && model.id === "custom",
      ),
    ),
);
writeFileSync(
  join(isolated.cwd, "opencode.json"),
  JSON.stringify({ model: "{file:../unobserved-config}" }),
);
run(
  "native external settings references are unavailable before file expansion",
  (snapshot) => {
    assert.equal(snapshot.coverage, "unavailable");
    assert.ok(
      snapshot.issues.includes("settings-external-reference-unobserved"),
    );
  },
);
rmSync(join(isolated.cwd, "opencode.json"));
writeFileSync(
  join(agent, "settings.json"),
  JSON.stringify({ modelRoles: { default: "fixture/legacy" } }),
);
run(
  "legacy settings are reported as unobserved without migration",
  (snapshot) => {
    assert.equal(snapshot.coverage, "partial");
    assert.ok(snapshot.issues.includes("legacy-settings-unobserved"));
  },
);
rmSync(join(agent, "settings.json"));
const overlay = join(isolated.root, "overlay.yml");
symlinkSync(join(agent, "models.json"), overlay);
run(
  "explicit symlink configuration overlay is rejected",
  (snapshot) => {
    assert.equal(snapshot.coverage, "unavailable");
    assert.ok(snapshot.issues.includes("unsafe-path"));
  },
  { PI_CONFIG_FILES: overlay },
);
rmSync(overlay);
const models = (id) => ({
  providers: {
    fixture: {
      api: "openai-completions",
      baseUrl: "http://127.0.0.1:9",
      apiKey: "fixture",
      models: [
        {
          id,
          name: id,
          reasoning: false,
          input: ["text"],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 1000,
          maxTokens: 100,
        },
      ],
    },
  },
});
writeFileSync(
  join(agent, "models.yaml"),
  JSON.stringify(models("yaml-secondary")),
);
writeFileSync(
  join(agent, "models.yml"),
  JSON.stringify(models("yaml-primary")),
);
run("native yml before yaml before JSON priority", (snapshot) => {
  assert.ok(snapshot.models.some((model) => model.id === "yaml-primary"));
  assert.ok(
    !snapshot.models.some((model) =>
      ["yaml-secondary", "custom"].includes(model.id),
    ),
  );
});
mkdirSync(join(isolated.cwd, ".omp"), { recursive: true });
writeFileSync(
  join(agent, "config.yml"),
  JSON.stringify({ modelRoles: { default: "fixture/global" } }),
);
writeFileSync(
  join(isolated.cwd, ".omp", "config.yml"),
  JSON.stringify({ modelRoles: { default: "fixture/project" } }),
);
run("project default overrides global without execution trust", (snapshot) =>
  assert.equal(snapshot.defaultModel, "fixture/project"),
);
writeFileSync(join(agent, "models.yml"), "providers: [invalid YAML");
run("invalid model source remains visible without repair", (snapshot) => {
  assert.equal(snapshot.catalogError, true);
  assert.notEqual(snapshot.coverage, "complete");
});
rmSync(join(agent, "models.yml"));
symlinkSync(join(agent, "models.yaml"), join(agent, "models.yml"));
run("symlink model source is unavailable without following it", (snapshot) => {
  assert.equal(snapshot.coverage, "unavailable");
  assert.ok(snapshot.issues.includes("unsafe-path"));
});
rmSync(join(agent, "models.yml"));
const dbFixture = join(isolated.root, "db-fixture.mjs");
writeFileSync(
  dbFixture,
  `import { Database } from "bun:sqlite";const db=new Database(process.argv[2]);db.run("CREATE TABLE auth_schema_version(id INTEGER PRIMARY KEY,version INTEGER);INSERT INTO auth_schema_version VALUES(1,0);CREATE TABLE auth_credentials(id INTEGER,provider TEXT,credential_type TEXT,data TEXT)");db.close();`,
);
const dbPath = join(agent, "agent.db");
const created = spawnSync(join(sdk, "bun"), [dbFixture, dbPath], {
  cwd: isolated.cwd,
  env: isolated.env,
  encoding: "utf8",
});
assert.equal(created.status, 0, created.stderr);
run(
  "old credential schema stays untouched and authentication is unknown",
  (snapshot) => {
    assert.equal(snapshot.openaiAuthenticated, null);
    assert.equal(snapshot.deepseekAuthenticated, null);
    assert.ok(
      snapshot.issues.includes("credential-schema-unsupported"),
      JSON.stringify(snapshot.issues),
    );
  },
);
rmSync(dbPath);
writeFileSync(dbPath, "not-a-database");
run("corrupt credential DB stays untouched without recovery", (snapshot) => {
  assert.equal(snapshot.openaiAuthenticated, null);
  assert.ok(snapshot.issues.includes("credentials-unavailable"));
});
rmSync(dbPath);
symlinkSync(join(agent, "models.yaml"), dbPath);
run("symlink credential DB is partial and unknown", (snapshot) => {
  assert.equal(snapshot.openaiAuthenticated, null);
  assert.ok(snapshot.issues.includes("unsafe-path"));
});
rmSync(dbPath);
writeFileSync(join(agent, "models.db"), "corrupt-catalog");
run("corrupt catalog cache stays untouched", (snapshot) => {
  assert.equal(snapshot.coverage, "partial");
  assert.ok(snapshot.issues.includes("catalog-cache-unavailable"));
});
rmSync(join(agent, "models.db"));
writeFileSync(
  join(isolated.cwd, ".omp", "config.yml"),
  "modelRoles: [invalid YAML",
);
run("invalid project settings are not quarantined or rewritten", (snapshot) =>
  assert.notEqual(snapshot.coverage, "complete"),
);
console.log(
  JSON.stringify({
    sdkVersion: JSON.parse(
      readFileSync(
        process.env.D_PI_CONFIGURATION_SOURCE === "1"
          ? resolve("node_modules/@oh-my-pi/pi-coding-agent/package.json")
          : join(sdk, "manifest.json"),
      ),
    )[process.env.D_PI_CONFIGURATION_SOURCE === "1" ? "version" : "sdkVersion"],
    root: isolated.root,
    checks,
    realSupplierRequests: 0,
  }),
);
