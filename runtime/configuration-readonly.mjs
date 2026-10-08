// Versioned, read-only boundary for OMP 18.4.6. No OAuth/key resolution or refresh.

import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import {
  lstatSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { delimiter, dirname, join, parse, resolve } from "node:path";
import { getOAuthProviders } from "@oh-my-pi/pi-ai";
import { AuthStorage } from "@oh-my-pi/pi-ai/auth-storage";
import { authPolicyFor, authProviders } from "@oh-my-pi/pi-catalog/compat/auth";
import { getModelPricingStatus } from "@oh-my-pi/pi-catalog/models";
import { isCredentialScopedModelCacheProvider } from "@oh-my-pi/pi-catalog/provider-models";
import { modelKind } from "@oh-my-pi/pi-catalog/types";
import { ModelRegistry } from "@oh-my-pi/pi-coding-agent/config/model-registry";
import {
  getKnownRoleIds,
  getRoleInfo,
} from "@oh-my-pi/pi-coding-agent/config/model-roles";
import {
  cfgAuthBrokerUrl,
  cfgDisabledProviders,
  cfgModelRoleStorage,
} from "@oh-my-pi/pi-coding-agent/config/model-settings";
import { Settings } from "@oh-my-pi/pi-coding-agent/config/settings";
import {
  resolveUserPath,
  SOURCE_PATHS,
} from "@oh-my-pi/pi-coding-agent/discovery/helpers";
import { loadEffectiveAuthAccountPolicyConfig } from "@oh-my-pi/pi-coding-agent/session/auth-broker-config";
import {
  getAgentDbPath,
  getAgentDir,
  getModelDbPath,
} from "@oh-my-pi/pi-utils";
import { thinkingCapabilities } from "./model-selection.mjs";

export function safePath(path) {
  const absolute = resolve(path);
  let current = parse(absolute).root;
  for (const part of absolute
    .slice(current.length)
    .split("/")
    .filter(Boolean)) {
    current = join(current, part);
    let stat;
    try {
      stat = lstatSync(current);
    } catch (error) {
      if (error.code === "ENOENT") return false;
      throw error;
    }
    if (stat.isSymbolicLink()) throw Error("unsafe-path");
    if (!stat.isFile() && !stat.isDirectory()) throw Error("unsafe-path");
    if (stat.isFile() && stat.size > 32 * 1024 * 1024)
      throw Error("source-too-large");
  }
  return true;
}
function safeSettingsPaths(agent, cwd) {
  const names = [
    "config.yml",
    "config.yaml",
    "config.toml",
    "settings.yml",
    "settings.yaml",
    "settings.json",
    "settings.local.json",
    "opencode.json",
    "opencode.jsonc",
  ];
  const paths = new Set();
  const check = (path) => {
    paths.add(resolve(path));
    if (!safePath(path)) return;
    // The native OpenCode provider expands arbitrary {file:...} references,
    // including those introduced by {env:...}. Do not copy its expansion rules
    // or let this finite read boundary follow unobserved external sources.
    if (
      /opencode\.jsonc?$/.test(path) &&
      /\{(?:file|env):/.test(readFileSync(path, "utf8"))
    )
      throw Error("settings-external-reference-unobserved");
  };
  for (const name of names) check(join(agent, name));
  const ctx = { cwd, home: homedir() };
  for (const source of Object.keys(SOURCE_PATHS)) {
    const user = resolveUserPath(ctx, source, "");
    if (user) for (const name of names) check(join(user, name));
  }
  {
    let directory = resolve(cwd);
    while (true) {
      for (const owner of new Set(
        Object.values(SOURCE_PATHS)
          .map((source) => source.projectDir)
          .filter(Boolean),
      ))
        for (const name of names) check(join(directory, owner, name));
      for (const name of ["opencode.json", "opencode.jsonc"])
        check(join(directory, name));
      const parent = dirname(directory);
      if (parent === directory) break;
      directory = parent;
    }
  }
  for (const file of process.env.PI_CONFIG_FILES?.split(delimiter).filter(
    Boolean,
  ) ?? [])
    check(
      resolve(
        cwd,
        file.startsWith("~/") ? join(process.env.HOME, file.slice(2)) : file,
      ),
    );
  return [...paths];
}
function readonlyDatabase(path) {
  if (!safePath(path)) return null;
  // WAL contains committed credentials while CLI/Host remains open. Let SQLite
  // pin a consistent read transaction instead of treating normal WAL as failure.
  // Its shared-memory index is coordination data, never an App-owned credential.
  safePath(path + "-wal");
  safePath(path + "-shm");
  safePath(path + "-journal");
  const db = new Database(path, {
    readonly: true,
    create: false,
    strict: true,
  });
  try {
    db.run("PRAGMA query_only = ON");
    db.run("PRAGMA busy_timeout = 1000");
    db.run("BEGIN");
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}
function credentialRows(db) {
  if (!db) return [];
  const version = db
    .query("SELECT version FROM auth_schema_version WHERE id=1")
    .get()?.version;
  if (version !== 8) throw Error("credential-schema-unsupported");
  const columns = new Set(
    db
      .query("PRAGMA table_info(auth_credentials)")
      .all()
      .map((row) => row.name),
  );
  if (
    ![
      "id",
      "provider",
      "credential_type",
      "data",
      "disabled_cause",
      "identity_key",
    ].every((name) => columns.has(name))
  )
    throw Error("credential-schema-unsupported");
  return db
    .query(
      "SELECT id,provider,credential_type,data FROM auth_credentials WHERE disabled_cause IS NULL ORDER BY id LIMIT 1001",
    )
    .all()
    .map((row) => {
      const value = JSON.parse(row.data);
      if (!value || typeof value !== "object" || Array.isArray(value))
        throw Error("credential-data-invalid");
      let credential;
      // Serialization seam only. Official AuthStorage owns cascade, policy and identity.
      if (row.credential_type === "api_key" && typeof value.key === "string")
        credential = {
          type: "api_key",
          key: value.key,
          ...(value.source === "login" ? { source: "login" } : {}),
        };
      else if (
        row.credential_type === "oauth" &&
        typeof value.access === "string" &&
        typeof value.refresh === "string" &&
        typeof value.expires === "number"
      )
        credential = { ...value, type: "oauth" };
      else throw Error("credential-data-invalid");
      return {
        id: row.id,
        provider: row.provider,
        credential,
        disabledCause: null,
      };
    });
}
export function modelConfigurationPath(agent = getAgentDir()) {
  for (const name of ["models.yml", "models.yaml", "models.json"]) {
    const candidate = join(agent, name);
    if (safePath(candidate)) return candidate;
  }
  return join(agent, "models.yml");
}
export function configurationRevision(paths, source, rows) {
  const hash = createHash("sha256").update(JSON.stringify(source));
  for (const path of [...new Set(paths)].sort()) {
    hash.update(path).update("\0");
    hash.update(safePath(path) ? readFileSync(path) : "missing");
  }
  hash.update(JSON.stringify(rows));
  return hash.digest("hex");
}
function publicBaseUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}
function providerSummaries(auth, registry, settings, models, known) {
  const logins = getOAuthProviders();
  const ids = new Set(
    authProviders().map((policy) => policy.storeAs ?? policy.id),
  );
  for (const model of models) ids.add(model.provider);
  for (const row of auth?.credentials.list() ?? []) ids.add(row.provider);
  const disabled = new Set(settings ? cfgDisabledProviders.get(settings) : []);
  return [...ids].map((id) => {
    const policy = authPolicyFor(id);
    const source = known ? auth?.keys.source(id) : undefined;
    const keyless =
      known &&
      (auth?.keys.keyless(id) ||
        (models.some((model) => model.provider === id && model.available) &&
          !source));
    const accounts = known
      ? (auth?.credentials.list(id) ?? []).map((row) => {
          const credential = row.credential;
          const summary = { credentialId: row.id, type: credential.type };
          if (credential.type === "oauth")
            for (const field of [
              "email",
              "accountId",
              "orgId",
              "orgName",
              "projectId",
              "enterpriseUrl",
            ]) {
              if (typeof credential[field] === "string")
                summary[field] = credential[field];
            }
          return summary;
        })
      : [];
    return {
      id,
      storageProvider: id,
      name: policy?.name ?? id,
      disabled: disabled.has(id),
      authState: !known
        ? "unknown"
        : source
          ? "configured"
          : keyless
            ? "keyless"
            : "required",
      authSource: source ?? null,
      accounts,
      loginMethods: logins
        .filter((login) => (login.storeCredentialsAs ?? login.id) === id)
        .map((login) => {
          const rule = authPolicyFor(login.id)?.login;
          return {
            id: login.id,
            name: login.name,
            available: login.available,
            kind: rule?.kind ?? "custom",
            probe:
              rule?.kind === "api-key"
                ? (rule.validate?.kind ?? "none")
                : "none",
          };
        }),
      apiKeyEditable:
        !policy ||
        policy.login?.kind === "api-key" ||
        Boolean(policy.env && !policy.nativeAuthApis?.length) ||
        Boolean(!policy.login && !policy.nativeAuthApis?.length),
      keyValidation:
        policy?.login?.kind === "api-key" && policy.login.validate
          ? "native"
          : "none",
      modelCount: models.filter((model) => model.provider === id).length,
      baseUrl: publicBaseUrl(registry?.getProviderBaseUrl(id)),
    };
  });
}
function roleSummaries(settings) {
  return getKnownRoleIds(settings).map((role) => ({
    role,
    name: getRoleInfo(role, settings)?.name ?? role,
    value: settings.getModelRole(role) ?? null,
    source: settings.getModelRoleProvenance(role) ?? null,
    globalValue: settings.getGlobalModelRole(role) ?? null,
    projectValue: settings.getProjectModelRole(role) ?? null,
  }));
}
export async function readConfigurationSnapshot(frame) {
  const agent = getAgentDir();
  const source = {
    directory: agent,
    profile: process.env.OMP_PROFILE ?? process.env.PI_PROFILE ?? null,
    cwd: process.cwd(),
  };
  const issues = [];
  let auth;
  let db;
  let settings;
  let cacheDirectory;
  let configurationFiles = [];
  try {
    configurationFiles = safeSettingsPaths(agent, source.cwd);
    settings = await Settings.loadReadOnly({
      cwd: source.cwd,
      agentDir: agent,
    });
  } catch (error) {
    return {
      kind: "snapshot",
      scope: frame.scope,
      traceId: frame.traceId,
      source,
      models: [],
      providers: providerSummaries(null, null, null, [], false),
      modelRoles: [],
      defaultModel: null,
      openaiAuthenticated: null,
      deepseekAuthenticated: null,
      catalogError: true,
      coverage: "unavailable",
      issues: [
        ["unsafe-path", "settings-external-reference-unobserved"].includes(
          error.message,
        )
          ? error.message
          : "settings-unavailable",
      ],
    };
  }
  let credentialsKnown = true;
  let rows = [];
  const legacySettings = !["config.yml", "config.yaml"].some((name) =>
    safePath(join(agent, name)),
  );
  if (legacySettings && safePath(join(agent, "settings.json")))
    issues.push("legacy-settings-unobserved");
  try {
    // Remote stores require network/credential materialization and are not queried.
    if (cfgAuthBrokerUrl.get(settings)) throw Error("remote-auth-unobserved");
    db = readonlyDatabase(getAgentDbPath(agent));
    if (
      legacySettings &&
      db
        ?.query(
          "SELECT 1 FROM sqlite_master WHERE type='table' AND name='settings'",
        )
        .get() &&
      db.query("SELECT 1 FROM settings LIMIT 1").get()
    )
      issues.push("legacy-settings-unobserved");
    rows = credentialRows(db);
    if (rows.length > 1000) throw Error("credential-count-limit");
  } catch (error) {
    credentialsKnown = false;
    rows = [];
    issues.push(
      [
        "unsafe-path",
        "credential-schema-unsupported",
        "remote-auth-unobserved",
        "credential-count-limit",
      ].includes(error.message)
        ? error.message
        : "credentials-unavailable",
    );
  } finally {
    db?.close();
  }
  // A deliberately narrow store: native code that attempts dedupe, refresh or
  // writes fails closed. Secrets remain in this short-lived process only.
  const store = new Proxy(
    {
      listAuthCredentials: (provider) =>
        rows.filter(
          (row) => provider === undefined || row.provider === provider,
        ),
      close: () => {},
    },
    {
      get(target, key) {
        if (key in target) return target[key];
        if (["pollExternalChanges", "acknowledgeLocalChanges"].includes(key))
          return undefined;
        return () => {
          throw Error("readonly-operation-unavailable");
        };
      },
    },
  );
  auth = new AuthStorage(
    store,
    await loadEffectiveAuthAccountPolicyConfig({
      settings,
      cwd: source.cwd,
      agentDir: agent,
    }),
  );
  try {
    try {
      await auth.credentials.reload();
    } catch {
      credentialsKnown = false;
      issues.push("credential-policy-unobserved");
    }
    const modelsPath = modelConfigurationPath(agent);
    configurationFiles.push(
      ...["models.yml", "models.yaml", "models.json"].map((name) =>
        join(agent, name),
      ),
    );
    const { ModelsConfigFile } = await import(
      "@oh-my-pi/pi-coding-agent/config/models-config"
    );
    const customConfig = ModelsConfigFile.relocate(modelsPath).load();
    const customModels = new Set(
      Object.entries(customConfig?.providers ?? {}).flatMap(
        ([provider, config]) =>
          (config.models ?? []).map((model) => provider + "/" + model.id),
      ),
    );
    const revision = configurationRevision(configurationFiles, source, rows);
    // Native cache reads initialize/migrate/write. Serialize a consistent SQLite
    // read transaction (including committed WAL) to a private, short-lived cache.
    // Official OMP code owns compatibility, freshness, merging and header restore;
    // any migrations/deletions affect this copy only, never the user's catalog.
    let cache;
    let cacheDbPath = ":memory:";
    let cacheProviders = [];
    try {
      cache = readonlyDatabase(getModelDbPath(agent));
      if (cache) {
        const columns = new Set(
          cache
            .query("PRAGMA table_info(model_cache)")
            .all()
            .map((row) => row.name),
        );
        if (
          ![
            "provider_id",
            "version",
            "models",
            "materialization_policy",
            "updated_at",
            "authoritative",
            "static_fingerprint",
            "header_omitted_model_ids",
            "unrestorable_header_model_ids",
            "header_restore_version",
          ].every((name) => columns.has(name))
        )
          issues.push("catalog-schema-unsupported");
        else if (cache.query("SELECT 1 FROM model_cache LIMIT 1").get()) {
          const bytes = cache.serialize();
          if (bytes.length > 32 * 1024 * 1024) throw Error("source-too-large");
          cacheDirectory = mkdtempSync(join(tmpdir(), "d-pi-model-catalog-"));
          cacheDbPath = join(cacheDirectory, "models.db");
          writeFileSync(cacheDbPath, bytes, { mode: 0o600 });
          cacheProviders = cache
            .query("SELECT provider_id FROM model_cache")
            .all();
        }
      }
    } catch (error) {
      cacheDbPath = ":memory:";
      issues.push(
        error.message === "unsafe-path"
          ? "unsafe-path"
          : "catalog-cache-unavailable",
      );
    } finally {
      cache?.close();
    }
    const registry = new ModelRegistry(auth, modelsPath, {
      settings,
      cacheDbPath,
      fetch: () => Promise.reject(Error("readonly-network-forbidden")),
    });
    const { isCommandConfigValue, resolveConfigValue } = await import(
      "@oh-my-pi/pi-coding-agent/config/resolve-config-value"
    );
    // The official offline hydration path scopes cache rows to fresh, existing
    // credentials. Its resolver is constrained so neither !key helpers nor
    // token refresh/network work can be reached by this read-only process.
    auth.keys.setResolver((value) =>
      isCommandConfigValue(value) ? undefined : resolveConfigValue(value),
    );
    await registry.hydrateCredentialScopedModelCaches();
    const { cfgEnabledModels } = await import(
      "@oh-my-pi/pi-coding-agent/config/model-settings"
    );
    const { filterAvailableModelsByEnabledPatterns } = await import(
      "@oh-my-pi/pi-coding-agent/config/model-resolver"
    );
    const selectable = new Set(
      filterAvailableModelsByEnabledPatterns(
        registry.getAvailable(),
        cfgEnabledModels.get(settings),
        settings,
      ).map((model) => model.provider + "/" + model.id),
    );
    const available = new Set(
      registry
        .getAvailable("all")
        .map((model) => model.provider + "/" + model.id),
    );
    const disabledProviders = new Set(cfgDisabledProviders.get(settings));
    const models = registry.getAll("all").map((model) => {
      const accountGap =
        !disabledProviders.has(model.provider) &&
        Boolean(auth.keys.source(model.provider)) &&
        isCredentialScopedModelCacheProvider(model.provider) &&
        registry.getProviderDiscoveryState(model.provider)?.status !== "cached";
      if (accountGap && !issues.includes("account-catalog-unobserved"))
        issues.push("account-catalog-unobserved");
      const unknown = !credentialsKnown || accountGap;
      const ready = available.has(model.provider + "/" + model.id) && !unknown;
      return {
        provider: model.provider,
        id: model.id,
        name: model.name,
        kind: modelKind(model),
        api: model.api,
        assignableRoles: getKnownRoleIds(settings).filter((role) =>
          getRoleInfo(role, settings).accepts(model),
        ),
        baseUrl: publicBaseUrl(model.baseUrl),
        custom: customModels.has(model.provider + "/" + model.id),
        contextWindow: Number.isFinite(model.contextWindow)
          ? model.contextWindow
          : null,
        maxTokens: Number.isFinite(model.maxTokens) ? model.maxTokens : null,
        pricingStatus: getModelPricingStatus(model),
        cost:
          model.cost &&
          ["input", "output", "cacheRead", "cacheWrite"].every(
            (field) =>
              Number.isFinite(model.cost[field]) && model.cost[field] >= 0,
          )
            ? Object.fromEntries(
                ["input", "output", "cacheRead", "cacheWrite"].map((field) => [
                  field,
                  model.cost[field],
                ]),
              )
            : null,
        available: ready,
        sessionSelectable:
          ready && selectable.has(model.provider + "/" + model.id),
        reason: ready
          ? null
          : unknown
            ? "configuration-unknown"
            : registry.hasConfiguredAuth(model)
              ? "disabled"
              : "authentication-required",
        reasoning: model.reasoning,
        input: model.input,
        thinking: thinkingCapabilities(model),
      };
    });
    if (cacheDirectory && cacheProviders.length) {
      let materialized;
      try {
        materialized = new Database(cacheDbPath, {
          readonly: true,
          create: false,
        });
        const remaining = new Set(
          materialized
            .query("SELECT provider_id FROM model_cache")
            .all()
            .map((row) => row.provider_id),
        );
        // Official compatibility and parsing may reject rows in the private
        // copy. Preserve that decision, but do not claim complete source coverage.
        if (cacheProviders.some((row) => !remaining.has(row.provider_id)))
          issues.push("catalog-cache-rejected");
      } catch {
        issues.push("catalog-cache-unavailable");
      } finally {
        materialized?.close();
      }
    }
    if (registry.getError()) issues.push("models-config-invalid");
    return {
      kind: "snapshot",
      scope: frame.scope,
      traceId: frame.traceId,
      source,
      models,
      providers: providerSummaries(
        auth,
        registry,
        settings,
        models,
        credentialsKnown,
      ),
      modelRoles: roleSummaries(settings),
      modelRoleStorage: cfgModelRoleStorage.get(settings),
      revision,
      defaultModel: settings.getModelRole("default") ?? null,
      openaiAuthenticated: credentialsKnown
        ? auth.credentials.hasOAuth("openai-codex")
        : null,
      deepseekAuthenticated: credentialsKnown
        ? Boolean(auth.keys.source("deepseek"))
        : null,
      catalogError: issues.length > 0,
      coverage: issues.length ? "partial" : "complete",
      issues: [...new Set(issues)],
    };
  } catch (error) {
    return {
      kind: "snapshot",
      scope: frame.scope,
      traceId: frame.traceId,
      source,
      models: [],
      providers: providerSummaries(auth, null, settings, [], credentialsKnown),
      modelRoles: roleSummaries(settings),
      modelRoleStorage: cfgModelRoleStorage.get(settings),
      defaultModel: settings.getModelRole("default") ?? null,
      openaiAuthenticated: credentialsKnown
        ? auth.credentials.hasOAuth("openai-codex")
        : null,
      deepseekAuthenticated: credentialsKnown
        ? Boolean(auth.keys.source("deepseek"))
        : null,
      catalogError: true,
      coverage: "unavailable",
      issues: [
        ...new Set([
          ...issues,
          error.message === "unsafe-path"
            ? "unsafe-path"
            : "catalog-unavailable",
        ]),
      ],
    };
  } finally {
    auth.close();
    if (cacheDirectory)
      rmSync(cacheDirectory, { recursive: true, force: true });
  }
}
