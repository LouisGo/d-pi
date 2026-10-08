import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { test } from "node:test";
import { createTestEnvironment } from "../../scripts/testing/test-environment.mjs";

const root = resolve(import.meta.dirname, "../..");
const bun = join(root, "node_modules/bun/bin/bun.exe");
function fixture() {
  const isolated = createTestEnvironment({ prefix: "d-pi-providers-models-" });
  const adapter = join(isolated.root, "adapter");
  mkdirSync(adapter);
  symlinkSync(
    resolve(
      realpathSync(join(root, "node_modules/@oh-my-pi/pi-coding-agent")),
      "../..",
    ),
    join(adapter, "node_modules"),
  );
  for (const name of [
    "configuration.mjs",
    "configuration-readonly.mjs",
    "model-selection.mjs",
  ])
    cpSync(join(root, "runtime", name), join(adapter, name));
  const guard = join(adapter, "guard.mjs");
  writeFileSync(
    guard,
    "globalThis.fetch = async () => { throw Error('network forbidden'); };\n",
  );
  function command(value) {
    const result = spawnSync(
      bun,
      ["--preload", guard, join(adapter, "configuration.mjs")],
      {
        cwd: isolated.cwd,
        env: { ...isolated.env, BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0" },
        input:
          JSON.stringify({
            scope: { kind: "application" },
            traceId: randomUUID(),
            ...value,
          }) + "\n",
        encoding: "utf8",
        timeout: 20000,
        maxBuffer: 16 * 1024 * 1024,
      },
    );
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout.trim().split("\n").at(-1)).message;
  }
  function script(source) {
    const path = join(adapter, "fixture.mjs");
    writeFileSync(path, source);
    const result = spawnSync(bun, ["--preload", guard, path], {
      cwd: isolated.cwd,
      env: isolated.env,
      encoding: "utf8",
      timeout: 20000,
    });
    assert.equal(result.status, 0, result.stderr);
  }
  function interactive(onPrompt) {
    return new Promise((resolve, reject) => {
      const child = spawn(
        bun,
        ["--preload", guard, join(adapter, "configuration.mjs")],
        {
          cwd: isolated.cwd,
          env: { ...isolated.env, BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0" },
          stdio: ["pipe", "pipe", "pipe"],
        },
      );
      const events = [];
      child.stderr.resume();
      const reader = createInterface({ input: child.stdout });
      const timeout = setTimeout(() => {
        child.kill();
        reject(Error("fixture timeout"));
      }, 20000);
      reader.on("line", (line) => {
        const event = JSON.parse(line).message;
        events.push(event);
        if (event.kind === "prompt")
          child.stdin.write(JSON.stringify(onPrompt(event)) + "\n");
      });
      child.on("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.on("close", (code) => {
        clearTimeout(timeout);
        reader.close();
        if (code !== 0) reject(Error("fixture exit " + code));
        else resolve(events);
      });
      child.stdin.write(
        JSON.stringify({
          kind: "login",
          providerId: "deepseek",
          jobId: randomUUID(),
          scope: { kind: "application" },
          traceId: randomUUID(),
        }) + "\n",
      );
    });
  }
  return { ...isolated, adapter, guard, command, script, interactive };
}

test("native readonly catalog exposes every login, model kinds and identities without secrets or helper execution", () => {
  const f = fixture();
  try {
    f.script(`import { AuthStorage } from '@oh-my-pi/pi-ai/auth-storage';
      import { getAgentDbPath } from '@oh-my-pi/pi-utils';
      const auth = await AuthStorage.create(getAgentDbPath());
      await auth.credentials.set('anthropic', [{type:'oauth', access:'secret-a', refresh:'secret-b', expires:Date.now()+86400000,email:'one@example.test'}, {type:'oauth', access:'secret-c', refresh:'secret-d', expires:Date.now()+86400000,email:'two@example.test'}]); auth.close();`);
    writeFileSync(
      join(f.config, "config.yml"),
      "modelRoles:\n  default: anthropic/claude-sonnet-4-6\n",
    );
    const helper = join(f.root, "helper-ran");
    writeFileSync(
      join(f.config, "models.json"),
      JSON.stringify({ providers: { openai: { apiKey: `!touch ${helper}` } } }),
    );
    const before = readFileSync(join(f.config, "models.json"));
    const snapshot = f.command({ kind: "snapshot" });
    assert.equal(snapshot.kind, "snapshot");
    assert.ok(
      snapshot.providers.flatMap((provider) => provider.loginMethods).length >=
        80,
    );
    assert.equal(
      snapshot.providers.find((provider) => provider.id === "anthropic")
        .accounts.length,
      2,
    );
    assert.equal(
      snapshot.providers.find((provider) => provider.id === "openai").authSource
        .kind,
      "config",
    );
    assert.equal(
      snapshot.providers.find((provider) => provider.id === "openai")
        .apiKeyEditable,
      true,
    );
    assert.equal(
      snapshot.providers.find((provider) => provider.id === "anthropic")
        .apiKeyEditable,
      true,
    );
    assert.equal(
      snapshot.providers
        .find((provider) => provider.id === "anthropic")
        .loginMethods.some((method) => method.kind === "oauth-code"),
      true,
    );
    assert.ok(snapshot.models.some((model) => model.kind !== "chat"));
    assert.ok(
      snapshot.models.some((model) => model.pricingStatus === "unknown"),
    );
    assert.ok(
      snapshot.modelRoles.some(
        (role) => role.role === "default" && role.source === "global",
      ),
    );
    assert.match(snapshot.revision, /^[a-f0-9]{64}$/);
    const serialized = JSON.stringify(snapshot);
    assert.ok(
      !serialized.includes("secret-a") &&
        !serialized.includes("secret-b") &&
        !serialized.includes("!touch"),
    );
    assert.deepEqual(readFileSync(join(f.config, "models.json")), before);
    assert.equal(existsSync(helper), false);
    assert.equal(f.command({ kind: "snapshot" }).revision, snapshot.revision);
  } finally {
    f.cleanup();
  }
});

test("native writes preserve sibling credentials/settings and reject stale revisions", () => {
  const f = fixture();
  try {
    f.script(
      `import { AuthStorage } from '@oh-my-pi/pi-ai/auth-storage'; import { getAgentDbPath } from '@oh-my-pi/pi-utils'; const auth=await AuthStorage.create(getAgentDbPath()); await auth.credentials.set('anthropic',[{type:'oauth',access:'a',refresh:'b',expires:Date.now()+86400000,email:'one@example.test'},{type:'oauth',access:'c',refresh:'d',expires:Date.now()+86400000,email:'two@example.test'}]); auth.close();`,
    );
    writeFileSync(
      join(f.config, "config.yml"),
      "modelRoles:\n  smol: deepseek/deepseek-chat\n",
    );
    let snapshot = f.command({ kind: "snapshot" });
    const account = snapshot.providers.find(
      (provider) => provider.id === "anthropic",
    ).accounts[0];
    const removed = f.command({
      kind: "logout",
      providerId: "anthropic",
      credentialId: account.credentialId,
      expectedRevision: snapshot.revision,
    });
    assert.equal(removed.kind, "done", JSON.stringify(removed));
    snapshot = removed.snapshot;
    assert.equal(
      snapshot.providers.find((provider) => provider.id === "anthropic")
        .accounts.length,
      1,
    );
    const keySaved = f.command({
      kind: "save-key",
      providerId: "anthropic",
      key: "fixture-static-key",
    });
    assert.equal(keySaved.kind, "done", JSON.stringify(keySaved));
    const accounts = keySaved.snapshot.providers.find(
      (provider) => provider.id === "anthropic",
    ).accounts;
    assert.equal(
      accounts.filter((account) => account.type === "oauth").length,
      1,
    );
    assert.equal(
      accounts.filter((account) => account.type === "api_key").length,
      1,
    );
    assert.ok(
      !JSON.stringify(keySaved.snapshot).includes("fixture-static-key"),
    );
    snapshot = keySaved.snapshot;
    const enabled = f.command({
      kind: "provider-enable",
      providerId: "anthropic",
      enabled: false,
      expectedRevision: snapshot.revision,
    });
    assert.equal(enabled.kind, "done", JSON.stringify(enabled));
    assert.equal(
      enabled.snapshot.providers.find((provider) => provider.id === "anthropic")
        .disabled,
      true,
    );
    const stale = f.command({
      kind: "set-model-role",
      role: "default",
      selector: "deepseek/deepseek-chat",
      target: "global",
      expectedRevision: snapshot.revision,
    });
    assert.equal(stale.code, "configuration-conflict");
    const assigned = f.command({
      kind: "set-model-role",
      role: "default",
      selector: "deepseek/deepseek-chat",
      target: "global",
      expectedRevision: enabled.snapshot.revision,
    });
    assert.equal(assigned.kind, "done", JSON.stringify(assigned));
    assert.equal(
      assigned.snapshot.modelRoles.find((role) => role.role === "smol").value,
      "deepseek/deepseek-chat",
    );
    assert.equal(assigned.snapshot.defaultModel, "deepseek/deepseek-chat");
  } finally {
    f.cleanup();
  }
});

test("custom model CRUD writes only the native file, preserves secrets and rejects conflicts", () => {
  const f = fixture();
  try {
    const path = join(f.config, "models.json");
    const original = {
      providers: {
        custom: {
          api: "openai-completions",
          baseUrl: "https://custom.example.test/v1",
          apiKey: "native-private",
          headers: { "X-Private": "private-header" },
          models: [{ id: "sibling", name: "Sibling" }],
          vendorNote: "preserved metadata",
        },
      },
    };
    writeFileSync(path, JSON.stringify(original));
    const snapshot = f.command({ kind: "snapshot" });
    const model = {
      provider: "custom",
      id: "new-model",
      name: "New model",
      baseUrl: "https://custom.example.test/v1",
      api: "openai-completions",
      contextWindow: 32000,
      maxTokens: 4096,
      reasoning: false,
      input: ["text"],
    };
    const saved = f.command({
      kind: "upsert-custom-model",
      model,
      expectedRevision: snapshot.revision,
    });
    assert.equal(saved.kind, "done", JSON.stringify(saved));
    assert.equal(
      saved.snapshot.models.find(
        (entry) => entry.provider === "custom" && entry.id === model.id,
      ).custom,
      true,
    );
    const raw = JSON.parse(readFileSync(path, "utf8"));
    assert.equal(raw.providers.custom.apiKey, "native-private");
    assert.equal(raw.providers.custom.headers["X-Private"], "private-header");
    assert.equal(raw.providers.custom.models[0].id, "sibling");
    assert.equal(raw.providers.custom.vendorNote, "preserved metadata");
    assert.ok(!JSON.stringify(saved.snapshot).includes("private-header"));
    assert.equal(
      f.command({
        kind: "upsert-custom-model",
        model: { ...model, name: "Changed" },
        expectedRevision: snapshot.revision,
      }).code,
      "configuration-conflict",
    );
    raw.providers.custom.models[1].headers = {
      "X-Model-Private": "model-secret",
    };
    raw.providers.custom.models[1].cost = {
      input: 1,
      output: 2,
      cacheRead: 0.1,
      cacheWrite: 0.2,
    };
    writeFileSync(path, JSON.stringify(raw));
    const updated = f.command({
      kind: "upsert-custom-model",
      model: { ...model, name: "Changed" },
      expectedRevision: f.command({ kind: "snapshot" }).revision,
    });
    assert.equal(updated.kind, "done", JSON.stringify(updated));
    const updatedRaw = JSON.parse(readFileSync(path, "utf8"));
    assert.equal(updatedRaw.providers.custom.models[1].name, "Changed");
    assert.deepEqual(
      updatedRaw.providers.custom.models[1].cost,
      raw.providers.custom.models[1].cost,
    );
    assert.equal(
      updatedRaw.providers.custom.models[1].headers["X-Model-Private"],
      "model-secret",
    );
    assert.ok(!JSON.stringify(updated.snapshot).includes("model-secret"));
    const deleted = f.command({
      kind: "delete-custom-model",
      providerId: model.provider,
      modelId: model.id,
      expectedRevision: updated.snapshot.revision,
    });
    assert.equal(deleted.kind, "done", JSON.stringify(deleted));
    assert.equal(
      JSON.parse(readFileSync(path, "utf8")).providers.custom.models.length,
      1,
    );
    const created = f.command({
      kind: "upsert-custom-model",
      model: { ...model, provider: "another" },
      expectedRevision: deleted.snapshot.revision,
    });
    assert.equal(created.kind, "done", JSON.stringify(created));
    const key = f.command({
      kind: "save-key",
      providerId: "another",
      key: "custom-native-key",
    });
    assert.equal(key.kind, "done", JSON.stringify(key));
    assert.equal(
      key.snapshot.providers.find((provider) => provider.id === "another")
        .authState,
      "configured",
    );
    assert.ok(!JSON.stringify(key.snapshot).includes("custom-native-key"));
  } finally {
    f.cleanup();
  }
});

test("generic native API-key normalization and validation preserve an older credential on rejection", () => {
  const f = fixture();
  try {
    writeFileSync(
      f.guard,
      `globalThis.fetch = async (_url, options) => { if (options.headers.Authorization !== 'Bearer replacement') throw Error('normalization missing'); return new Response('{"data":[]}', {status:200,headers:{'content-type':'application/json'}}); };`,
    );
    let saved = f.command({
      kind: "save-key",
      providerId: "deepseek",
      key: "  Bearer replacement  ",
    });
    assert.equal(saved.kind, "done", JSON.stringify(saved));
    const originalId = saved.snapshot.providers.find(
      (provider) => provider.id === "deepseek",
    ).accounts[0].credentialId;
    writeFileSync(
      f.guard,
      "globalThis.fetch = async () => new Response('{}',{status:401});",
    );
    const rejected = f.command({
      kind: "save-key",
      providerId: "deepseek",
      key: "rejected",
    });
    assert.equal(rejected.code, "authentication-rejected");
    writeFileSync(
      f.guard,
      "globalThis.fetch = () => { throw Error('network forbidden'); };\n",
    );
    saved = f.command({ kind: "snapshot" });
    assert.equal(
      saved.providers.find((provider) => provider.id === "deepseek").accounts[0]
        .credentialId,
      originalId,
    );
    assert.equal(saved.deepseekAuthenticated, true);
  } finally {
    f.cleanup();
  }
});

test("credential-scoped native caches hydrate offline without changing the user's cache or running a key helper", () => {
  const f = fixture();
  try {
    f.script(`import { AuthStorage } from '@oh-my-pi/pi-ai/auth-storage';
      import { getAgentDbPath, getModelDbPath } from '@oh-my-pi/pi-utils';
      import { getBundledModels } from '@oh-my-pi/pi-catalog/models';
      import { writeModelCache } from '@oh-my-pi/pi-catalog/model-cache';
      import { resolveModelCacheProviderId } from '@oh-my-pi/pi-catalog/provider-models';
      const auth=await AuthStorage.create(getAgentDbPath());
      await auth.credentials.set('github-copilot',{type:'oauth',access:'fixture-token',refresh:'fixture-refresh',expires:Date.now()+86400000});
      const key=JSON.stringify({token:'fixture-token'});
      const base=getBundledModels('github-copilot')[0];
      writeModelCache(resolveModelCacheProviderId('github-copilot',{apiKey:key}), Date.now(),[{...base,id:'fixture-account-model',name:'Account model'}],true,'',getModelDbPath(),[],base.headers); auth.close();`);
    const source = readFileSync(join(f.config, "models.db"));
    const snapshot = f.command({ kind: "snapshot" });
    const model = snapshot.models.find(
      (model) =>
        model.provider === "github-copilot" &&
        model.id === "fixture-account-model",
    );
    assert.ok(model, JSON.stringify(snapshot.issues));
    assert.equal(model.available, true);
    assert.deepEqual(readFileSync(join(f.config, "models.db")), source);
  } finally {
    f.cleanup();
  }
});

test("unsafe configuration writes are refused before native writable storage is opened", () => {
  const f = fixture();
  try {
    const target = join(f.root, "external-models.json");
    writeFileSync(target, '{"providers":{}}');
    symlinkSync(target, join(f.config, "models.json"));
    const result = f.command({
      kind: "save-key",
      providerId: "openai",
      key: "unsafe-test-key",
    });
    assert.equal(result.code, "configuration-invalid");
    assert.equal(existsSync(join(f.config, "agent.db")), false);
    assert.equal(readFileSync(target, "utf8"), '{"providers":{}}');
  } finally {
    f.cleanup();
  }
});

test("explicit catalog refresh reports native failure and refuses command-backed headers", () => {
  const f = fixture();
  try {
    f.script(
      `import { AuthStorage } from '@oh-my-pi/pi-ai/auth-storage'; import { getAgentDbPath } from '@oh-my-pi/pi-utils'; const auth=await AuthStorage.create(getAgentDbPath());await auth.credentials.upsert('deepseek',{type:'api_key',key:'fixture-key',source:'login'});auth.close();`,
    );
    assert.equal(
      f.command({ kind: "refresh-catalog", providerId: "deepseek" }).code,
      "catalog-refresh-failed",
    );
    const marker = join(f.root, "header-helper-ran");
    writeFileSync(
      join(f.config, "models.json"),
      JSON.stringify({
        providers: {
          deepseek: { headers: { "X-Helper": `!touch ${marker}` } },
        },
      }),
    );
    assert.equal(
      f.command({ kind: "refresh-catalog", providerId: "deepseek" }).code,
      "catalog-refresh-failed",
    );
    assert.equal(existsSync(marker), false);
  } finally {
    f.cleanup();
  }
});

test("generic native login carries masked key prompts and cancellation does not store credentials", async () => {
  const f = fixture();
  try {
    const cancelled = await f.interactive(() => ({ kind: "cancel" }));
    assert.equal(
      cancelled.find((event) => event.kind === "prompt").secret,
      true,
    );
    assert.equal(cancelled.at(-1).kind, "failed");
    assert.equal(
      f
        .command({ kind: "snapshot" })
        .providers.find((provider) => provider.id === "deepseek").accounts
        .length,
      0,
    );
    writeFileSync(
      f.guard,
      "globalThis.fetch=async()=>new Response('{\"data\":[]}',{status:200,headers:{'content-type':'application/json'}});",
    );
    const events = await f.interactive(() => ({
      kind: "answer",
      value: "Bearer interactive-key",
    }));
    const prompt = events.find((event) => event.kind === "prompt");
    assert.equal(prompt.providerId, "deepseek");
    assert.equal(prompt.secret, true);
    assert.equal(typeof prompt.message, "string");
    assert.equal(events.at(-1).kind, "done", JSON.stringify(events.at(-1)));
    assert.ok(!JSON.stringify(events).includes("interactive-key"));
    assert.equal(
      f
        .command({ kind: "snapshot" })
        .providers.find((provider) => provider.id === "deepseek").accounts
        .length,
      1,
    );
  } finally {
    f.cleanup();
  }
});

test("project role writes and clears use native provenance without changing the global fallback", () => {
  const f = fixture();
  try {
    writeFileSync(
      join(f.config, "config.yml"),
      "modelRoles:\n  default: deepseek/deepseek-chat\n",
    );
    let snapshot = f.command({ kind: "snapshot" });
    assert.equal(
      f.command({
        kind: "set-model-role",
        role: "default",
        selector: "deepseek/deepseek-reasoner",
        target: "project",
        expectedRevision: snapshot.revision,
      }).code,
      "configuration-invalid",
    );
    const scope = {
      kind: "thread",
      threadId: randomUUID(),
      workingDirectoryId: randomUUID(),
    };
    const assigned = f.command({
      kind: "set-model-role",
      scope,
      role: "default",
      selector: "deepseek/deepseek-reasoner",
      target: "project",
      expectedRevision: snapshot.revision,
    });
    assert.equal(assigned.kind, "done", JSON.stringify(assigned));
    const role = assigned.snapshot.modelRoles.find(
      (role) => role.role === "default",
    );
    assert.equal(role.projectValue, "deepseek/deepseek-reasoner");
    assert.equal(role.globalValue, "deepseek/deepseek-chat");
    assert.equal(role.source, "project");
    const cleared = f.command({
      kind: "set-model-role",
      scope,
      role: "default",
      selector: null,
      target: "project",
      expectedRevision: assigned.snapshot.revision,
    });
    assert.equal(cleared.kind, "done", JSON.stringify(cleared));
    assert.equal(cleared.snapshot.defaultModel, "deepseek/deepseek-chat");
    assert.equal(
      cleared.snapshot.modelRoles.find((role) => role.role === "default")
        .source,
      "global",
    );
  } finally {
    f.cleanup();
  }
});
