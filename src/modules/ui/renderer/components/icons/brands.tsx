import { AiChipIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useId } from "react";
import { type Brand, brandAssets } from "./_brands/assets";

export type ProviderBrandIconProps = {
  provider: string;
  size?: 16 | 18 | 20 | 24;
  className?: string;
};
export type ModelBrandIconProps = ProviderBrandIconProps & { modelId: string };

// Presentation aliases only. Availability, authentication and native model
// identity remain owned by OMP; this table never admits or registers providers.
const providerBrands = new Map<string, Brand>([
  ["openai", "openai"],
  ["openai-codex", "openai"],
  ["codex", "openai"],
  ["anthropic", "anthropic"],
  ["claude", "anthropic"],
  ["google", "google"],
  ["google-vertex", "google"],
  ["google-gemini-cli", "gemini"],
  ["google-antigravity", "antigravity"],
  ["gemini", "gemini"],
  ["deepseek", "deepseek"],
  ["qwen", "qwen"],
  ["alibaba", "alibaba"],
  ["alibaba-coding-plan", "alibaba"],
  ["alibaba-token-plan", "alibaba"],
  ["dashscope", "alibaba"],
  ["kimi", "kimi"],
  ["kimi-code", "kimi"],
  ["moonshot", "kimi"],
  ["moonshotai", "kimi"],
  ["zai", "zai"],
  ["z-ai", "zai"],
  ["zai-coding-plan", "zai"],
  ["zhipu", "zai"],
  ["zhipuai", "zai"],
  ["xai", "xai"],
  ["grok", "grok"],
  ["github-copilot", "githubcopilot"],
  ["cursor", "cursor"],
  ["openrouter", "openrouter"],
  ["minimax", "minimax"],
  ["minimax-cn", "minimax"],
  ["minimax-code", "minimax"],
  ["mistral", "mistral"],
  ["meta", "meta"],
  ["amazon-bedrock", "aws"],
  ["bedrock", "aws"],
  ["amazon", "aws"],
  ["bedrock-mantle", "aws"],
  ["azure", "azure"],
  ["azure-openai", "azure"],
  ["azure-openai-responses", "azure"],
  ["huggingface", "huggingface"],
  ["groq", "groq"],
  ["cerebras", "cerebras"],
  ["together", "together"],
  ["togetherai", "together"],
  ["fireworks", "fireworks"],
  ["fireworks-ai", "fireworks"],
  ["ollama", "ollama"],
  ["nvidia", "nvidia"],
  ["perplexity", "perplexity"],
  ["cohere", "cohere"],
  ["apple", "apple"],
]);

// A gateway brand identifies transport, not a model's maker. For unrecognized
// model IDs on these providers, show a neutral glyph rather than claim a maker.
const gateways = new Set([
  "openrouter",
  "amazon-bedrock",
  "bedrock",
  "bedrock-mantle",
  "azure",
  "azure-openai",
  "azure-openai-responses",
  "google-vertex",
  "google-antigravity",
  "github-copilot",
  "cursor",
  "huggingface",
  "groq",
  "cerebras",
  "together",
  "togetherai",
  "fireworks",
  "fireworks-ai",
  "ollama",
  "local",
  "alibaba",
  "alibaba-coding-plan",
  "alibaba-token-plan",
  "dashscope",
  "nvidia",
]);

const namespaces = new Map<string, Brand>([
  ["openai", "openai"],
  ["anthropic", "anthropic"],
  ["google", "gemini"],
  ["deepseek", "deepseek"],
  ["deepseek-ai", "deepseek"],
  ["qwen", "qwen"],
  ["qwen-ai", "qwen"],
  ["moonshotai", "kimi"],
  ["moonshot", "kimi"],
  ["minimax", "minimax"],
  ["minimaxai", "minimax"],
  ["z-ai", "zai"],
  ["zai", "zai"],
  ["zhipu-ai", "zai"],
  ["mistralai", "mistral"],
  ["mistral", "mistral"],
  ["meta-llama", "meta"],
  ["meta", "meta"],
  ["x-ai", "grok"],
  ["xai", "grok"],
  ["amazon", "aws"],
  ["cohere", "cohere"],
  ["nvidia", "nvidia"],
  ["perplexity", "perplexity"],
]);

const modelFamilies: readonly [RegExp, Brand][] = [
  [/^(?:gpt-|chatgpt-|codex-|o[134](?:-|$))/, "openai"],
  [/^claude(?:-|$)/, "anthropic"],
  [/^(?:gemini|gemma)(?:-|$)/, "gemini"],
  [/^deepseek(?:-|$)/, "deepseek"],
  [/^(?:qwen|qwq)(?:\d|-|$)/, "qwen"],
  [/^(?:kimi|moonshot)(?:-|$)/, "kimi"],
  [/^glm(?:-?\d|-|$)/, "zai"],
  [/^grok(?:-|$)/, "grok"],
  [/^minimax(?:-|$)/, "minimax"],
  [
    /^(?:mistral|mixtral|codestral|magistral|devstral|pixtral|voxtral)(?:-|$)/,
    "mistral",
  ],
  [/^llama(?:-?\d|-|$)/, "meta"],
  [/^nova(?:-|$)/, "aws"],
  [/^command(?:-|$)/, "cohere"],
];

function modelBrand(provider: string, modelId: string): Brand | null {
  const id = modelId.trim().toLowerCase();
  const slash = id.indexOf("/");
  if (slash !== -1) {
    // A recognized author namespace is stronger evidence than the model name.
    // Unknown namespaces can contain arbitrary custom IDs; do not guess.
    return namespaces.get(id.slice(0, slash)) ?? null;
  }
  const hosted = /^(?:(?:us|eu|apac|global)\.)?([a-z-]+)\./.exec(id);
  if (hosted?.[1] && namespaces.has(hosted[1]))
    return namespaces.get(hosted[1]) ?? null;
  const family = modelFamilies.find(([pattern]) => pattern.test(id));
  if (family) return family[1];
  return gateways.has(provider) ? null : (providerBrands.get(provider) ?? null);
}

function BrandIcon({
  brand,
  size = 16,
  className,
}: Omit<ProviderBrandIconProps, "provider"> & { brand: Brand | null }) {
  const id = useId().replaceAll(":", "");
  if (!brand)
    return (
      <HugeiconsIcon
        icon={AiChipIcon}
        data-brand="generic"
        size={size}
        className={className}
        strokeWidth={1.5}
        color="currentColor"
        aria-hidden={true}
        focusable={false}
      />
    );
  const asset = brandAssets[brand];
  return (
    <svg
      width={size}
      height={size}
      viewBox={asset.viewBox}
      fill={asset.fill}
      fillRule={"fillRule" in asset ? asset.fillRule : undefined}
      className={className}
      data-brand={brand}
      aria-hidden={true}
      focusable={false}
    >
      {asset.content(id)}
    </svg>
  );
}

export function ProviderBrandIcon({
  provider = "",
  ...props
}: ProviderBrandIconProps) {
  return (
    <BrandIcon
      {...props}
      brand={providerBrands.get(provider.trim().toLowerCase()) ?? null}
    />
  );
}

export function ModelBrandIcon({
  provider = "",
  modelId = "",
  ...props
}: ModelBrandIconProps) {
  return (
    <BrandIcon
      {...props}
      brand={modelBrand(provider.trim().toLowerCase(), modelId)}
    />
  );
}
