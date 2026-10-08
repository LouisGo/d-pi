import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ModelBrandIcon, ProviderBrandIcon } from "./brands";

function providerIcon(provider: string) {
  return renderToStaticMarkup(createElement(ProviderBrandIcon, { provider }));
}
function modelIcon(provider: string, modelId: string) {
  return renderToStaticMarkup(
    createElement(ModelBrandIcon, { provider, modelId }),
  );
}

describe("provider and model identity", () => {
  it("maps native provider aliases and keeps unknown providers generic", () => {
    expect(providerIcon("openai-codex")).toContain('data-brand="openai"');
    expect(providerIcon("google-antigravity")).toContain(
      'data-brand="antigravity"',
    );
    expect(providerIcon("google-vertex")).toContain('data-brand="google"');
    expect(providerIcon("github-copilot")).toContain(
      'data-brand="githubcopilot"',
    );
    expect(providerIcon("zai-coding-plan")).toContain('data-brand="zai"');
    expect(providerIcon("minimax-cn")).toContain('data-brand="minimax"');
    expect(providerIcon("arbitrary-openai-compatible")).toContain(
      'data-brand="generic"',
    );
    expect(providerIcon("__proto__")).toContain('data-brand="generic"');
    expect(providerIcon("toString")).toContain('data-brand="generic"');
  });

  it("shows the real model maker through aggregator and hosted model identities", () => {
    expect(modelIcon("openrouter", "anthropic/claude-sonnet-4.5")).toContain(
      'data-brand="anthropic"',
    );
    expect(
      modelIcon("amazon-bedrock", "us.anthropic.claude-sonnet-4-6-v1"),
    ).toContain('data-brand="anthropic"');
    expect(modelIcon("google-vertex", "gemini-3-pro-preview")).toContain(
      'data-brand="gemini"',
    );
    expect(modelIcon("local", "Qwen/Qwen3-32B")).toContain('data-brand="qwen"');
    expect(modelIcon("github-copilot", "gpt-6-luna")).toContain(
      'data-brand="openai"',
    );
    expect(modelIcon("openrouter", "meta-llama/llama-4-maverick")).toContain(
      'data-brand="meta"',
    );
    expect(
      modelIcon("openrouter", "vendor/unrecognized-custom-model"),
    ).toContain('data-brand="generic"');
    expect(modelIcon("deepseek", "custom-deployment-id")).toContain(
      'data-brand="deepseek"',
    );
  });

  it("does not guess a maker from arbitrary substrings or custom namespace names", () => {
    expect(modelIcon("openrouter", "somevendor/my-claude-tool")).toContain(
      'data-brand="generic"',
    );
    expect(modelIcon("custom-gateway", "fictional-gpt-model")).toContain(
      'data-brand="generic"',
    );
    expect(modelIcon("custom-gateway", "user/claude-local-proxy")).toContain(
      'data-brand="generic"',
    );
  });
});

it("renders narrow decorative SVGs with per-instance gradient IDs and no external content", () => {
  const markup = renderToStaticMarkup(
    createElement(
      "div",
      {},
      createElement(ModelBrandIcon, {
        provider: "google",
        modelId: "gemini-3-pro",
        size: 24,
      }),
      createElement(ModelBrandIcon, {
        provider: "google",
        modelId: "gemini-3-pro",
        size: 24,
      }),
    ),
  );
  expect(markup.match(/aria-hidden="true"/g)).toHaveLength(2);
  expect(markup.match(/focusable="false"/g)).toHaveLength(2);
  expect(markup.match(/width="24"/g)).toHaveLength(2);
  const ids = [...markup.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  expect(ids.length).toBeGreaterThan(0);
  expect(new Set(ids).size).toBe(ids.length);
  expect(markup).not.toMatch(/<script|<image|foreignObject|https?:|href=/);
});
