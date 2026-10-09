// Short display labels only; native provider IDs remain the selection identity.
const providerLabels = new Map<string, string>([
  ["openai-codex", "Codex"],
  ["openai", "OpenAI"],
  ["anthropic", "Anthropic"],
  ["google", "Google AI"],
  ["google-gemini-cli", "Gemini CLI"],
  ["google-vertex", "Vertex AI"],
  ["google-antigravity", "Antigravity"],
  ["github-copilot", "GitHub Copilot"],
  ["amazon-bedrock", "Amazon Bedrock"],
  ["bedrock-mantle", "Bedrock Mantle"],
  ["azure-openai", "Azure OpenAI"],
  ["azure-openai-responses", "Azure OpenAI Responses"],
  ["kimi-code", "Kimi Code"],
  ["moonshot", "Moonshot"],
  ["zai", "Z.AI"],
  ["zai-coding-plan", "Z.AI Coding Plan"],
  ["minimax", "MiniMax"],
  ["minimax-cn", "MiniMax CN"],
  ["minimax-code", "MiniMax Code"],
  ["alibaba-coding-plan", "Alibaba Coding Plan"],
  ["alibaba-token-plan", "Alibaba Token Plan"],
  ["openrouter", "OpenRouter"],
  ["deepseek", "DeepSeek"],
]);

export function providerDisplayName(id: string, nativeName?: string): string {
  return providerLabels.get(id) ?? nativeName ?? id;
}
