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

const selectedConfigurations = new WeakMap();
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
async function selectedConfiguration(session, model) {
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
  const {
    models = [],
    modelOverrides = {},
    ...provider
  } = loaded.value?.providers?.[model.provider] ?? {};
  const override = resolveModelOverrideWithAliases(
    new Map(Object.entries(modelOverrides)),
    model,
    (provider, id) => session.modelRegistry.find(provider, id) !== undefined,
  );
  return {
    provider: model.provider,
    id: model.id,
    fingerprint: createHash("sha256")
      .update(
        JSON.stringify(
          canonical({
            path: ModelsConfigFile.path(),
            provider,
            models: models.filter(
              (entry) =>
                entry.id === model.id || entry.id === model.requestModelId,
            ),
            override,
          }),
        ),
      )
      .digest("hex"),
  };
}
export async function captureCurrentModelConfiguration(session) {
  if (!session.model) {
    selectedConfigurations.delete(session);
    return;
  }
  selectedConfigurations.set(
    session,
    await selectedConfiguration(session, session.model),
  );
}
async function refreshNativeConfiguration(session) {
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
}
function availableModels(session) {
  return filterAvailableModelsByEnabledPatterns(
    session.modelRegistry.getAvailable(),
    cfgEnabledModels.get(session.settings),
    session.settings,
  );
}
export async function ensureCurrentModelConfiguration(session) {
  await refreshNativeConfiguration(session);
  const current = session.model;
  const live =
    current &&
    availableModels(session).find(
      (model) => model.provider === current.provider && model.id === current.id,
    );
  if (!live) throw Error("selected-model-unavailable");
  const accepted = selectedConfigurations.get(session);
  const observed = await selectedConfiguration(session, current);
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
      JSON.stringify(live[field] ?? null) !==
      JSON.stringify(current[field] ?? null)
    )
      throw Error("model-configuration-changed");
  }
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
  await refreshNativeConfiguration(session);
  let model = availableModels(session).find(
    (model) =>
      model.provider === selection.provider && model.id === selection.modelId,
  );
  if (!model) throw Error("Selected model unavailable");
  const configuration = await selectedConfiguration(session, model);
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
  // 18.4.6 has an explicit native Off selector. undefined preserves/defaults
  // the current selector and does not disable provider reasoning.
  else await session.setModelTemporary(model, ThinkingLevel.Off);
  const observed = await selectedConfiguration(session, session.model);
  if (configuration.fingerprint !== observed.fingerprint)
    throw Error("model-configuration-changed");
  selectedConfigurations.set(session, observed);
  return {
    model: session.model,
    thinkingLevel: session.thinkingLevel ?? ThinkingLevel.Inherit,
  };
}
