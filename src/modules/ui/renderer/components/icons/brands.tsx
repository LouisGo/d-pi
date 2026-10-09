import { useId } from "react";
import { type Brand, brandAssets } from "./_brands/assets";
import type { IconProps } from "./_shared/icon";

export type ProviderBrandIconProps = IconProps & {
  provider: string;
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
  ["lmstudio", "lmstudio"],
  ["lm-studio", "lmstudio"],
  ["vllm", "vllm"],
  ["cloudflare", "cloudflare"],
  ["cloudflare-workers-ai", "cloudflare"],
  ["voyage", "voyage"],
  ["voyageai", "voyage"],
  ["jina", "jina"],
  ["ai21", "ai21"],
  ["stepfun", "stepfun"],
  ["bytedance", "bytedance"],
  ["volcengine", "bytedance"],
  ["siliconflow", "siliconcloud"],
  ["siliconflow-cn", "siliconcloud"],
  ["novita", "novita"],
  ["baseten", "baseten"],
  ["opencode", "opencode"],
  ["opencode-zen", "opencode"],
  ["vercel", "vercel"],
  ["vercel-ai-gateway", "vercel"],
  ["venice", "venice"],
  ["nebius", "nebius"],
  ["chutes", "chutes"],
  ["deepinfra", "deepinfra"],
  ["xiaomi", "xiaomimimo"],
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
  "lmstudio",
  "lm-studio",
  "vllm",
  "cloudflare",
  "cloudflare-workers-ai",
  "bytedance",
  "volcengine",
  "siliconflow",
  "siliconflow-cn",
  "novita",
  "baseten",
  "opencode",
  "opencode-zen",
  "vercel",
  "vercel-ai-gateway",
  "venice",
  "nebius",
  "chutes",
  "deepinfra",
  "web",
  "web-search",
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
  ["ai21", "ai21"],
  ["jinaai", "jina"],
  ["voyageai", "voyage"],
  ["stepfun-ai", "stepfun"],
  ["bytedance", "bytedance"],
  ["xiaomi", "xiaomimimo"],
]);

const modelFamilies: readonly [RegExp, Brand][] = [
  [/^(?:gpt-|chatgpt-|codex-|o[134](?:-|$))/, "openai"],
  [/^claude(?:-|$)/, "anthropic"],
  [/^gemini(?:-|$)/, "gemini"],
  [/^gemma(?:-?\d|-|$)/, "gemma"],
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
  [/^jamba(?:-|$)/, "ai21"],
  [/^jina(?:-|$)/, "jina"],
  [/^voyage(?:-|$)/, "voyage"],
  [/^step(?:-?\d|-|$)/, "stepfun"],
  [/^(?:doubao|seed)(?:-|$)/, "bytedance"],
  [/^mimo(?:-|$)/, "xiaomimimo"],
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
  fallback = "generic",
}: Omit<ProviderBrandIconProps, "provider"> & {
  brand: Brand | null;
  fallback?: "generic" | "local" | "search";
}) {
  const id = useId().replaceAll(":", "");
  if (!brand)
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        data-brand="generic"
        aria-hidden={true}
        focusable={false}
      >
        {fallback === "local" ? (
          <>
            <rect x="3" y="4" width="18" height="13" rx="2" />
            <path d="M8 21h8M12 17v4" />
          </>
        ) : fallback === "search" ? (
          <>
            <circle cx="12" cy="12" r="9" />
            <ellipse cx="12" cy="12" rx="4" ry="9" />
            <path d="M3 12h18" />
          </>
        ) : (
          <>
            <path d="m12 3 9 5v8l-9 5-9-5V8l9-5Z" />
            <path d="m3 8 9 5 9-5M12 13v8" />
          </>
        )}
      </svg>
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
      fallback={
        provider === "local"
          ? "local"
          : ["web", "web-search"].includes(provider)
            ? "search"
            : "generic"
      }
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
