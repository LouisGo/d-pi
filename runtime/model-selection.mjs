import { ThinkingLevel } from "@oh-my-pi/pi-agent-core";
import {
  defaultSupportedEffort,
  getSupportedEfforts,
  requireSupportedEffort,
} from "@oh-my-pi/pi-catalog/model-thinking";
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
  let model = session.modelRegistry.find(selection.provider, selection.modelId);
  if (!model || !session.modelRegistry.hasConfiguredAuth(model))
    throw Error("Selected model unavailable");
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
