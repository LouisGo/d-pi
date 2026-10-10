// Short-lived desktop adapter over unchanged OMP 18.8.7 config/auth modules.

import { randomUUID } from "node:crypto";
import {
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { createInterface } from "node:readline";
import { getOAuthProviders } from "@oh-my-pi/pi-ai";
import { ProviderHttpError } from "@oh-my-pi/pi-ai/error";
import { authPolicyFor } from "@oh-my-pi/pi-catalog/compat/auth";
import {
  getAgentDir,
  logger,
  resolveProfileEnv,
  setProfile,
} from "@oh-my-pi/pi-utils";
import { JSONC, YAML } from "bun";

setProfile(resolveProfileEnv(process.env.OMP_PROFILE, process.env.PI_PROFILE));
let auth;
let settings;
const source = () => ({
  directory: getAgentDir(),
  profile: process.env.OMP_PROFILE ?? process.env.PI_PROFILE ?? null,
  cwd: process.cwd(),
});
let writes = Promise.resolve();
let traceId = null;
const output = (data) => {
  writes = writes.then(
    () =>
      new Promise((resolve, reject) =>
        process.stdout.write(
          `${JSON.stringify({ traceId, message: data })}\n`,
          (error) => (error ? reject(error) : resolve()),
        ),
      ),
  );
  return writes;
};
const abort = new AbortController();
let prompt = null;
let started = false;
let interactive = false;
let authenticating = false;
const controlledFailures = new Set([
  "configuration-conflict",
  "configuration-invalid",
  "provider-unavailable",
  "credential-not-found",
  "catalog-refresh-failed",
  "model-not-found",
]);
function fail(code) {
  throw Error(code);
}
async function freshSnapshot(frame) {
  const { readConfigurationSnapshot } = await import(
    "./configuration-readonly.mjs"
  );
  return await readConfigurationSnapshot(frame);
}
function requireWritableSnapshot(snapshot) {
  if (
    !snapshot.revision ||
    snapshot.issues.some((issue) =>
      [
        "unsafe-path",
        "settings-external-reference-unobserved",
        "credential-schema-unsupported",
        "credential-policy-unobserved",
        "credentials-unavailable",
        "credential-count-limit",
        "remote-auth-unobserved",
        "legacy-settings-unobserved",
        "settings-unavailable",
        "models-config-invalid",
      ].includes(issue),
    )
  )
    fail("configuration-invalid");
}
async function nativeMutation(frame, identity) {
  const before = await freshSnapshot(frame);
  if (!before.revision || before.revision !== frame.expectedRevision)
    fail("configuration-conflict");
  requireWritableSnapshot(before);
  const { Settings } = await import(
    "@oh-my-pi/pi-coding-agent/config/settings"
  );
  const { ModelRegistry } = await import(
    "@oh-my-pi/pi-coding-agent/config/model-registry"
  );
  const { modelConfigurationPath, safePath } = await import(
    "./configuration-readonly.mjs"
  );
  const modelsPath = modelConfigurationPath();
  if (frame.kind === "logout") {
    const provider = before.providers.find(
      (provider) => provider.id === frame.providerId,
    );
    if (
      !provider ||
      provider.authState === "unknown" ||
      !provider.accounts.some(
        (account) => account.credentialId === frame.credentialId,
      )
    )
      fail("credential-not-found");
    await auth.credentials.reload();
    if (
      !(await auth.credentials.removeById(frame.providerId, frame.credentialId))
    )
      fail("credential-not-found");
  } else if (
    frame.kind === "provider-enable" ||
    frame.kind === "set-model-role"
  ) {
    settings = await Settings.loadIsolated({
      cwd: process.cwd(),
      agentDir: getAgentDir(),
    });
    if ((await freshSnapshot(frame)).revision !== frame.expectedRevision)
      fail("configuration-conflict");
    if (frame.kind === "provider-enable") {
      if (
        !before.providers.some((provider) => provider.id === frame.providerId)
      )
        fail("provider-unavailable");
      const { cfgDisabledProviders } = await import(
        "@oh-my-pi/pi-coding-agent/config/model-settings"
      );
      cfgDisabledProviders.setMember(settings, frame.providerId, {
        member: !frame.enabled,
      });
    } else {
      if (frame.target === "project" && frame.scope.kind !== "thread")
        fail("configuration-invalid");
      if (frame.selector !== null) {
        const { resolveModelRoleValue } = await import(
          "@oh-my-pi/pi-coding-agent/config/model-resolver"
        );
        const registry = new ModelRegistry(auth, modelsPath, {
          settings,
          cacheDbPath: ":memory:",
          fetch: () => Promise.reject(Error("network-forbidden")),
        });
        const resolved = resolveModelRoleValue(
          frame.selector,
          registry.getAll("all"),
          { settings },
        );
        if (!resolved.model) fail("model-not-found");
        const { getRoleInfo } = await import(
          "@oh-my-pi/pi-coding-agent/config/model-roles"
        );
        if (!getRoleInfo(frame.role, settings).accepts(resolved.model))
          fail("configuration-invalid");
      }
      if (frame.target === "global")
        settings.setModelRole(frame.role, frame.selector ?? undefined);
      else if (frame.selector === null)
        settings.clearProjectModelRole(frame.role);
      else settings.setProjectModelRole(frame.role, frame.selector);
    }
    await settings.flush();
  } else if (
    frame.kind === "upsert-custom-model" ||
    frame.kind === "delete-custom-model"
  ) {
    const { ModelsConfigFile, validateProviderConfiguration } = await import(
      "@oh-my-pi/pi-coding-agent/config/models-config"
    );
    const original = safePath(modelsPath)
      ? readFileSync(modelsPath, "utf8")
      : null;
    const doc =
      original === null
        ? {}
        : modelsPath.endsWith(".json")
          ? JSONC.parse(original)
          : YAML.parse(original);
    if (!doc || typeof doc !== "object" || Array.isArray(doc))
      fail("configuration-invalid");
    const providerId =
      frame.kind === "upsert-custom-model"
        ? frame.model.provider
        : frame.providerId;
    const providers = (doc.providers ??= {});
    if (typeof providers !== "object" || Array.isArray(providers))
      fail("configuration-invalid");
    if (frame.kind === "delete-custom-model") {
      const provider = providers[providerId];
      if (
        !provider ||
        !(provider.models ?? []).some((model) => model.id === frame.modelId)
      )
        fail("model-not-found");
      provider.models = provider.models.filter(
        (model) => model.id !== frame.modelId,
      );
    } else {
      const model = frame.model;
      const existing = providers[providerId];
      const builtin = before.models.find(
        (candidate) => candidate.provider === providerId,
      );
      const api = model.api ?? existing?.api ?? builtin?.api;
      if (!api) fail("configuration-invalid");
      const provider = (providers[providerId] ??= {
        baseUrl: model.baseUrl,
        api,
        auth: "oauth",
        models: [],
      });
      const modelValues = {
        id: model.id,
        name: model.name,
        api,
        baseUrl: model.baseUrl,
        contextWindow: model.contextWindow,
        maxTokens: model.maxTokens,
        reasoning: model.reasoning,
        input: model.input,
        ...(model.cost ? { cost: model.cost } : {}),
      };
      const index = (provider.models ?? []).findIndex(
        (entry) => entry.id === model.id,
      );
      provider.models ??= [];
      if (index < 0) provider.models.push(modelValues);
      else
        provider.models[index] = { ...provider.models[index], ...modelValues };
      // Built-in auth remains in agent.db, never a duplicated apiKey in this file.
      if (provider.auth === undefined && !provider.apiKey && !provider.headers)
        provider.auth = "oauth";
      provider.baseUrl ??= model.baseUrl;
      provider.api ??= api;
    }
    const file = ModelsConfigFile.relocate(modelsPath);
    const checked = file.schema(doc);
    if (checked instanceof Error) fail("configuration-invalid");
    for (const [id, provider] of Object.entries(doc.providers)) {
      try {
        validateProviderConfiguration(
          id,
          { ...provider, models: provider.models ?? [] },
          "models-config",
        );
      } catch {
        fail("configuration-invalid");
      }
    }
    if (
      (await freshSnapshot(frame)).revision !== frame.expectedRevision ||
      (safePath(modelsPath) ? readFileSync(modelsPath, "utf8") : null) !==
        original
    )
      fail("configuration-conflict");
    const contents = modelsPath.endsWith(".json")
      ? JSON.stringify(doc, null, 2) + "\n"
      : YAML.stringify(doc);
    mkdirSync(dirname(modelsPath), { recursive: true });
    const temporary = modelsPath + ".d-pi-" + randomUUID();
    try {
      writeFileSync(temporary, contents, { mode: 0o600, flag: "wx" });
      const fd = openSync(temporary, "r");
      try {
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      if (
        (safePath(modelsPath) ? readFileSync(modelsPath, "utf8") : null) !==
        original
      )
        fail("configuration-conflict");
      renameSync(temporary, modelsPath);
    } finally {
      rmSync(temporary, { force: true });
    }
  } else fail("configuration-invalid");
  const after = await freshSnapshot(frame);
  if (!after.revision) fail("configuration-unavailable");
  if (
    frame.kind === "provider-enable" &&
    after.providers.find((provider) => provider.id === frame.providerId)
      ?.disabled !== !frame.enabled
  )
    fail("configuration-conflict");
  if (frame.kind === "set-model-role") {
    const role = after.modelRoles.find((role) => role.role === frame.role);
    if (
      (frame.target === "global" ? role?.globalValue : role?.projectValue) !==
      frame.selector
    )
      fail("configuration-conflict");
  }
  await output({ kind: "done", ...identity, snapshot: after });
}
async function refreshCatalog(providerId) {
  const { ModelRegistry } = await import(
    "@oh-my-pi/pi-coding-agent/config/model-registry"
  );
  const { modelConfigurationPath } = await import(
    "./configuration-readonly.mjs"
  );
  const { isCommandConfigValue, resolveConfigValue } = await import(
    "@oh-my-pi/pi-coding-agent/config/resolve-config-value"
  );
  const modelsPath = modelConfigurationPath();
  const { ModelsConfigFile } = await import(
    "@oh-my-pi/pi-coding-agent/config/models-config"
  );
  const provider =
    ModelsConfigFile.relocate(modelsPath).load()?.providers?.[providerId];
  // Native discovery resolves configured headers independently of the key cascade.
  // Refuse helper-backed discovery before either resolver can materialize it.
  if (
    provider &&
    [
      provider.apiKey,
      ...Object.values(provider.headers ?? {}),
      ...(provider.models ?? []).flatMap((model) =>
        Object.values(model.headers ?? {}),
      ),
    ].some((value) => typeof value === "string" && isCommandConfigValue(value))
  )
    fail("catalog-refresh-failed");
  const registry = new ModelRegistry(auth, modelsPath, {
    settings,
  });
  // Refreshing catalogs grants network discovery, never command credential minting.
  auth.keys.setResolver((value) => {
    if (isCommandConfigValue(value)) fail("catalog-refresh-failed");
    return resolveConfigValue(value);
  });
  if (!registry.hasProvider(providerId) && !authPolicyFor(providerId))
    fail("provider-unavailable");
  await registry.refreshProvider(providerId, "online", {
    refreshCommandCredentials: false,
  });
  const discovery = registry.getProviderDiscoveryState(providerId);
  if (
    discovery?.error ||
    ["unavailable", "unauthenticated"].includes(discovery?.status)
  )
    fail("catalog-refresh-failed");
}

// Read only machine evidence; provider messages may contain secret input.
function authenticationFailureCode(error) {
  if (error instanceof ProviderHttpError) {
    if (error.status === 401 || error.status === 403)
      return "authentication-rejected";
    if (error.status === 429 || error.status >= 500)
      return "authentication-provider-unavailable";
  }
  if (error?.name === "TimeoutError") return "operation-timed-out";
  const codes = new Set([
    "ECONNREFUSED",
    "ECONNRESET",
    "ENOTFOUND",
    "EAI_AGAIN",
    "ENETUNREACH",
    "EHOSTUNREACH",
    "ETIMEDOUT",
    "ConnectionRefused",
    "ConnectionReset",
    "CERT_HAS_EXPIRED",
    "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
    "ERR_TLS_CERT_ALTNAME_INVALID",
  ]);
  if (codes.has(error?.code) || codes.has(error?.cause?.code))
    return "authentication-network";
  return "authentication-failed";
}
const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
async function run(frame) {
  if (frame.kind === "snapshot") {
    logger.setTransports({ console: false, file: false });
    const { readConfigurationSnapshot } = await import(
      "./configuration-readonly.mjs"
    );
    await output(await readConfigurationSnapshot(frame));
    return;
  }
  logger.setTransports({ console: false, file: false });
  const observed = await freshSnapshot(frame);
  requireWritableSnapshot(observed);
  if (
    frame.expectedRevision !== undefined &&
    observed.revision !== frame.expectedRevision
  )
    fail("configuration-conflict");
  const { Settings } = await import(
    "@oh-my-pi/pi-coding-agent/config/settings"
  );
  const { discoverAuthStorage, loadEffectiveAuthAccountPolicyConfig } =
    await import("@oh-my-pi/pi-coding-agent/session/auth-broker-config");
  settings = await Settings.loadReadOnly({
    cwd: process.cwd(),
    agentDir: getAgentDir(),
  });
  const policy = await loadEffectiveAuthAccountPolicyConfig({
    settings,
    cwd: process.cwd(),
    agentDir: getAgentDir(),
  });
  auth = await discoverAuthStorage(getAgentDir(), {
    accountPolicies: policy.accountPolicies,
    authStorageOptions: { defaultReservePct: policy.defaultReservePct },
  });
  const identity = {
    scope: frame.scope,
    traceId: frame.traceId,
    source: source(),
  };
  if (frame.kind === "save-key") {
    const providerId = frame.providerId ?? "deepseek";
    const rule = authPolicyFor(providerId)?.login;
    authenticating = true;
    if (rule?.kind === "api-key") {
      await auth.oauth.login(providerId, {
        signal: abort.signal,
        onAuth: () => {},
        onProgress: () => {},
        onPrompt: async () => frame.key,
      });
    } else {
      const before = await freshSnapshot(frame);
      if (
        !before.providers.find((provider) => provider.id === providerId)
          ?.apiKeyEditable
      )
        fail("provider-unavailable");
      // Raw-key credentials have no native probe. This is a save receipt, not validation.
      await auth.credentials.upsert(providerId, {
        type: "api_key",
        key: frame.key.trim(),
        source: "login",
      });
    }
    authenticating = false;
    await auth.credentials.reload();
    if (!auth.credentials.has(providerId)) fail("configuration-unavailable");
    await output({
      kind: "done",
      ...identity,
      snapshot: await freshSnapshot(frame),
    });
  } else if (frame.kind === "login") {
    const providerId = frame.providerId ?? "openai-codex";
    const method = getOAuthProviders().find(
      (provider) => provider.id === providerId && provider.available,
    );
    if (!method) fail("provider-unavailable");
    const policy = authPolicyFor(providerId);
    const jobId = frame.jobId;
    const ask = (request, signal = abort.signal) =>
      new Promise((resolve, reject) => {
        let pending;
        const cancel = () => {
          if (prompt === pending) prompt = null;
          reject(Error("cancelled"));
        };
        if (signal?.aborted || abort.signal.aborted) return cancel();
        signal?.addEventListener("abort", cancel, { once: true });
        pending = {
          resolve: (value) => {
            signal?.removeEventListener("abort", cancel);
            resolve(value);
          },
          reject: (error) => {
            signal?.removeEventListener("abort", cancel);
            reject(error);
          },
        };
        prompt = pending;
        output({
          ...identity,
          kind: "prompt",
          jobId,
          providerId,
          message: request.message,
          secret: request.secret !== false,
          ...(request.placeholder !== undefined
            ? { placeholder: request.placeholder }
            : {}),
          ...(request.allowEmpty !== undefined
            ? { allowEmpty: request.allowEmpty }
            : {}),
        });
      });
    authenticating = true;
    const stored = await auth.oauth.login(providerId, {
      signal: abort.signal,
      onAuth: (info) =>
        output({
          ...identity,
          kind: "challenge",
          jobId,
          providerId,
          url: info.url,
          instructions: info.instructions ?? "",
          ...(info.launchUrl ? { launchUrl: info.launchUrl } : {}),
        }),
      onProgress: (message) =>
        output({ ...identity, kind: "progress", jobId, message }),
      onPrompt: ask,
      ...(policy?.pasteCode
        ? {
            onManualCodeInput: (signal) =>
              ask(
                {
                  message:
                    "Paste the authorization code (or full redirect URL):",
                },
                signal,
              ),
          }
        : {}),
    });
    authenticating = false;
    if (!stored) fail("configuration-invalid");
    // Login acceptance and catalog discovery are separate; a provider's catalog
    // failure must not claim that successfully stored credentials were rejected.
    try {
      await refreshCatalog(method.storeCredentialsAs ?? providerId);
    } catch {
      /* Snapshot exposes remaining catalog coverage. */
    }
    await output({ kind: "done", ...identity });
  } else if (frame.kind === "refresh-catalog") {
    await refreshCatalog(frame.providerId);
    await output({
      kind: "done",
      ...identity,
      snapshot: await freshSnapshot(frame),
    });
  } else {
    await nativeMutation(frame, identity);
  }
}
lines.on("line", (line) => {
  if (Buffer.byteLength(line) > 32768) {
    abort.abort();
    lines.close();
    return;
  }
  let frame;
  try {
    frame = JSON.parse(line);
  } catch {
    process.exitCode = 1;
    lines.close();
    return;
  }
  if (frame.kind === "cancel") {
    abort.abort();
    prompt?.reject(Error("cancelled"));
    prompt = null;
    return;
  }
  if (frame.kind === "answer" && prompt) {
    prompt.resolve(frame.value);
    prompt = null;
    return;
  }
  if (started) return;
  started = true;
  interactive = frame.kind === "login";
  traceId = frame.traceId;
  run(frame)
    .catch((error) =>
      output({
        kind: "failed",
        scope: frame.scope,
        traceId: frame.traceId,
        source: source(),
        code: controlledFailures.has(error?.message)
          ? error.message
          : authenticating
            ? authenticationFailureCode(error)
            : "configuration-unavailable",
      }),
    )
    .finally(async () => {
      await writes;
      auth?.close();
      lines.close();
      process.exit();
    });
});
lines.on("close", () => {
  if (!interactive) return;
  abort.abort();
  prompt?.reject(Error("closed"));
});
