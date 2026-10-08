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

async function refreshNativeConfiguration(session) {
  await session.settings.reloadFromDisk();
  const registry = session.modelRegistry;
  await registry.authStorage.credentials.reload();
  // OMP offline discovery can resolve command-backed credentials. Synchronizing
  // disk/cache state must not execute unrelated helpers or refresh OAuth tokens.
  registry.authStorage.keys.setResolver((value) =>
    isCommandConfigValue(value) ? undefined : resolveConfigValue(value),
  );
  try {
    await registry.refresh("offline", { refreshCommandCredentials: false });
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
  // A changed endpoint/transport must be applied by explicit model selection.
  // Never send through the old endpoint or silently switch this Session.
  for (const field of [
    "api",
    "baseUrl",
    "headers",
    "input",
    "contextWindow",
    "maxTokens",
  ]) {
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
  return {
    model: session.model,
    thinkingLevel: session.thinkingLevel ?? ThinkingLevel.Inherit,
  };
}
