// Versioned, read-only boundary for OMP 18.4.6. No OAuth/key resolution or refresh.

import { Database } from "bun:sqlite";
import {
  lstatSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { delimiter, dirname, join, parse, resolve } from "node:path";
import { AuthStorage } from "@oh-my-pi/pi-ai/auth-storage";
import { isCredentialScopedModelCacheProvider } from "@oh-my-pi/pi-catalog/provider-models";
import { ModelRegistry } from "@oh-my-pi/pi-coding-agent/config/model-registry";
import { cfgAuthBrokerUrl } from "@oh-my-pi/pi-coding-agent/config/model-settings";
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

function safePath(path) {
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
  const check = (path) => {
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
  try {
    safeSettingsPaths(agent, source.cwd);
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
    let modelsPath = join(agent, "models.json");
    for (const name of ["models.yml", "models.yaml", "models.json"]) {
      const candidate = join(agent, name);
      if (safePath(candidate)) {
        modelsPath = candidate;
        break;
      }
    }
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
    const available = new Set(
      registry.getAvailable().map((model) => model.provider + "/" + model.id),
    );
    const models = registry.getAll().map((model) => {
      const accountGap =
        auth.credentials.hasOAuth(model.provider) &&
        isCredentialScopedModelCacheProvider(model.provider);
      if (accountGap && !issues.includes("account-catalog-unobserved"))
        issues.push("account-catalog-unobserved");
      const unknown = !credentialsKnown || accountGap;
      const ready = available.has(model.provider + "/" + model.id) && !unknown;
      return {
        provider: model.provider,
        id: model.id,
        name: model.name,
        available: ready,
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
