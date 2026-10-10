import { createHash } from "node:crypto";
import { ThinkingLevel } from "@oh-my-pi/pi-agent-core";
import {
  defaultSupportedEffort,
  getSupportedEfforts,
  requireSupportedEffort,
} from "@oh-my-pi/pi-catalog/model-thinking";
import { filterAvailableModelsByEnabledPatterns } from "@oh-my-pi/pi-coding-agent/config/model-resolver";
import { cfgEnabledModels } from "@oh-my-pi/pi-coding-agent/config/model-settings";
import {
  isCommandConfigValue,
  resolveConfigValue,
} from "@oh-my-pi/pi-coding-agent/config/resolve-config-value";

// Guard provenance only: actual models, availability and selection stay owned
// by OMP. Old native objects retain their declaration even after a catalog swap.
const configurationBaselines = new WeakMap();
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  return value;
}
function fingerprint(value) {
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}
async function readNativeDeclaration() {
  // Read declarative config through the native schema, never resolve headers or
  // credentials to compare them. Neither closures nor live context-window
  // discovery are configuration identities.
  const { ModelsConfigFile } = await import(
    "@oh-my-pi/pi-coding-agent/config/models-config"
  );
  const { resolveModelOverrideWithAliases } = await import(
    "@oh-my-pi/pi-coding-agent/config/custom-models"
  );
  ModelsConfigFile.invalidate();
  const loaded = ModelsConfigFile.tryLoad();
  if (loaded.status === "error") throw Error("model-configuration-unavailable");
  const path = ModelsConfigFile.path();
  return {
    path,
    value: loaded.value,
    fingerprint: fingerprint({ path, value: loaded.value }),
    resolveModelOverrideWithAliases,
  };
}
function modelConfiguration(session, model, declaration) {
  const {
    models = [],
    modelOverrides = {},
    ...provider
  } = declaration.value?.providers?.[model.provider] ?? {};
  const override = declaration.resolveModelOverrideWithAliases(
    new Map(Object.entries(modelOverrides)),
    model,
    (provider, id) => session.modelRegistry.find(provider, id) !== undefined,
  );
  return {
    provider: model.provider,
    id: model.id,
    fingerprint: fingerprint({
      path: declaration.path,
      provider,
      models: models.filter(
        (entry) => entry.id === model.id || entry.id === model.requestModelId,
      ),
      override,
    }),
  };
}
function rememberNativeModels(session, declaration) {
  let state = configurationBaselines.get(session);
  if (!state) {
    state = { models: new WeakMap(), documentFingerprint: null };
    configurationBaselines.set(session, state);
  }
  // Includes role-specific native targets such as tiny/prewalk, without keeping
  // a model list or resolving credentials. Never rebase an old object here.
  for (const model of session.modelRegistry.getAvailable("all")) {
    if (!state.models.has(model))
      state.models.set(model, modelConfiguration(session, model, declaration));
  }
  state.documentFingerprint = declaration.fingerprint;
  return state;
}
export async function captureCurrentModelConfiguration(session) {
  const declaration = await readNativeDeclaration();
  const state = rememberNativeModels(session, declaration);
  if (session.model && !state.models.has(session.model))
    state.models.set(
      session.model,
      modelConfiguration(session, session.model, declaration),
    );
}
async function refreshNativeConfiguration(session) {
  const before = await readNativeDeclaration();
  const registry = session.modelRegistry;
  // OMP offline discovery can resolve command-backed credentials. Synchronizing
  // disk/cache state must not execute unrelated helpers or refresh OAuth tokens.
  registry.authStorage.keys.setResolver((value) =>
    isCommandConfigValue(value) ? undefined : resolveConfigValue(value),
  );
  try {
    // Install the safe resolver before Settings listeners can rebuild catalogs.
    await session.settings.reloadFromDisk();
    await registry.authStorage.credentials.reload();
    // Native policy reapply forces the static reload even for equal mtimes, and
    // coalesces the same offline refresh requested by Settings listeners.
    await registry.reapplyModelPolicies();
  } finally {
    registry.authStorage.keys.setResolver(resolveConfigValue);
  }
  if (registry.getError()) throw Error("model-configuration-unavailable");
  const declaration = await readNativeDeclaration();
  // A model object must be associated with the document used for its native
  // rebuild, never with an edit that arrived while that rebuild was pending.
  if (before.fingerprint !== declaration.fingerprint)
    throw Error("model-configuration-changed");
  return declaration;
}
function availableModels(session, kind = "chat") {
  return filterAvailableModelsByEnabledPatterns(
    session.modelRegistry.getAvailable(kind),
    cfgEnabledModels.get(session.settings),
    session.settings,
  );
}
export async function ensureCurrentModelConfiguration(session) {
  const state = configurationBaselines.get(session);
  const declaration = await refreshNativeConfiguration(session);
  const current = session.model;
  let accepted = current && state?.models.get(current);
  // enabledModels scopes the desktop picker. OMP roles and prewalk can select
  // any native available target, still subject to auth and disabled providers.
  const live =
    current &&
    session.modelRegistry
      .getAvailable("all")
      .find(
        (model) =>
          model.provider === current.provider && model.id === current.id,
      );
  if (!live) throw Error("selected-model-unavailable");
  const observed = modelConfiguration(session, current, declaration);
  // Native lazy metadata can create a new object between calls. Its declaration
  // may only be inherited if the entire pre-existing native document baseline
  // is unchanged; a model_changed event or first call alone cannot authorize it.
  if (!accepted && state?.documentFingerprint === declaration.fingerprint)
    accepted = observed;
  if (
    !accepted ||
    accepted.provider !== observed.provider ||
    accepted.id !== observed.id ||
    accepted.fingerprint !== observed.fingerprint
  )
    throw Error("model-configuration-changed");
  // A changed endpoint/transport must be applied by explicit model selection.
  // Never send through the old endpoint or silently switch this Session.
  for (const field of ["api", "baseUrl", "headers"]) {
    if (
      JSON.stringify(canonical(live[field] ?? null)) !==
      JSON.stringify(canonical(current[field] ?? null))
    )
      throw Error("model-configuration-changed");
  }
  state.models.set(current, observed);
  rememberNativeModels(session, declaration);
}
export function thinkingCapabilities(model) {
  const efforts = [...getSupportedEfforts(model)];
  return {
    efforts,
    adjustable: efforts.length > 0,
    requiresEffort: model.thinking?.requiresEffort === true,
    defaultEffort: efforts.includes(model.thinking?.defaultLevel)
      ? model.thinking.defaultLevel
      : model.thinking?.requiresEffort
        ? (defaultSupportedEffort(model) ?? null)
        : null,
    defaultLevel: model.thinking?.defaultLevel ?? null,
  };
}
export async function applyModelSelection(session, selection) {
  const declaration = await refreshNativeConfiguration(session);
  const state = rememberNativeModels(session, declaration);
  let model = availableModels(session).find(
    (model) =>
      model.provider === selection.provider && model.id === selection.modelId,
  );
  if (!model) throw Error("Selected model unavailable");
  const configuration = modelConfiguration(session, model, declaration);
  model = await session.modelRegistry.refreshSelectedModelMetadata(model);
  const thinking = selection.thinking;
  if (thinking?.kind === "effort")
    requireSupportedEffort(model, thinking.effort);
  else if (thinking?.kind === "off") {
    if (
      model.thinking?.requiresEffort ||
      (model.reasoning && getSupportedEfforts(model).length === 0)
    )
      throw Error("Model does not support thinking off");
  } else if (thinking?.kind !== "default")
    throw Error("Invalid thinking selection");
  if (thinking.kind === "default") await session.setModelTemporary(model);
  else if (thinking.kind === "effort")
    await session.setModelTemporary(model, thinking.effort);
  // 18.8.7 has an explicit native Off selector. undefined preserves/defaults
  // the current selector and does not disable provider reasoning.
  else await session.setModelTemporary(model, ThinkingLevel.Off);
  const observed = modelConfiguration(
    session,
    session.model,
    await readNativeDeclaration(),
  );
  if (configuration.fingerprint !== observed.fingerprint)
    throw Error("model-configuration-changed");
  state.models.set(session.model, observed);
  return {
    model: session.model,
    thinkingLevel: session.thinkingLevel ?? ThinkingLevel.Inherit,
  };
}
