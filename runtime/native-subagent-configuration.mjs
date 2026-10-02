import { ThinkingLevel } from "@oh-my-pi/pi-agent-core";
import {
  getSupportedEfforts,
  requireSupportedEffort,
} from "@oh-my-pi/pi-catalog/model-thinking";
import {
  formatModelStringWithRouting,
  resolveAgentModelSelection,
} from "@oh-my-pi/pi-coding-agent/config/model-resolver";
import { discoverAgents } from "@oh-my-pi/pi-coding-agent/task/discovery";
import { cfgTaskAgentModelOverrides } from "@oh-my-pi/pi-coding-agent/task/settings";
import { formatModelSelectorValue } from "@oh-my-pi/pi-tui/overlays/model-selector";

// One adapter per native AgentSession. Settings is the only spawn-policy owner.
export function createSubagentConfiguration(session) {
  const overrides = new Map();
  const discover = async () => {
    const found = await discoverAgents(
      session.sessionManager.getCwd(),
      undefined,
      session.effectiveExtensionRoots,
    );
    // Native getAgent uses the first matching name. Preserve its identity.
    const names = new Set();
    return [...found.agents, ...session.getSessionAgents()].filter((agent) => {
      if (names.has(agent.name)) return false;
      names.add(agent.name);
      return true;
    });
  };
  const snapshot = async () => {
    await session.settings.reloadFromDisk();
    const configured = cfgTaskAgentModelOverrides.get(session.settings);
    return {
      agents: (await discover()).map((agent) => ({
        name: agent.name,
        description: agent.description ?? "",
        override: overrides.has(agent.name)
          ? {
              provider: overrides.get(agent.name).provider,
              modelId: overrides.get(agent.name).modelId,
              thinking: overrides.get(agent.name).thinking,
            }
          : null,
        effectivePatterns: resolveAgentModelSelection({
          settingsOverride: configured[agent.name],
          agentModel: agent.model,
          settings: session.settings,
          activeModelPattern: session.model
            ? formatModelStringWithRouting(session.model)
            : undefined,
        }).patterns,
      })),
    };
  };
  const apply = async (command) => {
    const agents = await discover();
    if (!agents.some((agent) => agent.name === command.agent))
      throw Error("subagent-unavailable");
    if (command.kind === "clear") {
      overrides.delete(command.agent);
      if (overrides.size === 0)
        cfgTaskAgentModelOverrides.clearOverride(session.settings);
      else
        cfgTaskAgentModelOverrides.override(
          session.settings,
          Object.fromEntries(
            [...overrides].map(([name, value]) => [name, value.pattern]),
          ),
        );
      return snapshot();
    }
    let model = session.modelRegistry.find(command.provider, command.modelId);
    if (!model || !session.modelRegistry.hasConfiguredAuth(model))
      throw Error("model-unavailable");
    model = await session.modelRegistry.refreshSelectedModelMetadata(model);
    const thinking = command.thinking;
    if (thinking?.kind === "effort")
      requireSupportedEffort(model, thinking.effort);
    else if (thinking?.kind === "off") {
      if (
        model.thinking?.requiresEffort ||
        (model.reasoning && getSupportedEfforts(model).length === 0)
      )
        throw Error("thinking-unavailable");
    } else if (thinking?.kind !== "default")
      throw Error("thinking-unavailable");
    const selector = formatModelStringWithRouting(model);
    const pattern =
      thinking.kind === "default"
        ? selector
        : formatModelSelectorValue(
            selector,
            thinking.kind === "off" ? ThinkingLevel.Off : thinking.effort,
          );
    cfgTaskAgentModelOverrides.override(session.settings, {
      ...Object.fromEntries(
        [...overrides].map(([name, value]) => [name, value.pattern]),
      ),
      [command.agent]: pattern,
    });
    overrides.set(command.agent, {
      provider: command.provider,
      modelId: command.modelId,
      thinking,
      pattern,
    });
    return snapshot();
  };
  return { snapshot, apply };
}
