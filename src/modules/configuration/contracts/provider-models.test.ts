import { expect, it } from "vitest";
import { CustomModelInputSchema } from "./provider-models";
import { ConfigurationCommandSchema } from "./public";

const identity = {
  scope: { kind: "application" },
  traceId: crypto.randomUUID(),
};
it("accepts native provider login and exact-account removal with a revision", () => {
  expect(
    ConfigurationCommandSchema.safeParse({
      kind: "login",
      ...identity,
      providerId: "anthropic",
    }).success,
  ).toBe(true);
  expect(
    ConfigurationCommandSchema.safeParse({
      kind: "logout",
      ...identity,
      providerId: "anthropic",
      credentialId: 4,
      expectedRevision: "a".repeat(64),
    }).success,
  ).toBe(true);
  expect(
    ConfigurationCommandSchema.safeParse({
      kind: "logout",
      ...identity,
      providerId: "anthropic",
    }).success,
  ).toBe(false);
});
it("rejects custom-model URLs that would embed secrets or unsupported transports", () => {
  const model = {
    provider: "fixture",
    id: "model",
    name: "Model",
    contextWindow: 128000,
    maxTokens: 8192,
    reasoning: false,
    input: ["text"],
  };
  for (const baseUrl of [
    "https://token@api.example.test/v1",
    "https://api.example.test/v1?key=secret",
    "https://api.example.test/v1#secret",
    "file:///tmp/model",
  ]) {
    expect(
      CustomModelInputSchema.safeParse({ ...model, baseUrl }).success,
    ).toBe(false);
  }
  expect(
    CustomModelInputSchema.safeParse({
      ...model,
      baseUrl: "http://127.0.0.1:8000/v1",
    }).success,
  ).toBe(true);
});
it("keeps role writes explicitly scoped and custom models free of credential fields", () => {
  expect(
    ConfigurationCommandSchema.safeParse({
      kind: "set-model-role",
      ...identity,
      role: "default",
      selector: "deepseek/deepseek-chat",
      target: "global",
      expectedRevision: "a".repeat(64),
    }).success,
  ).toBe(true);
  expect(
    ConfigurationCommandSchema.safeParse({
      kind: "upsert-custom-model",
      ...identity,
      expectedRevision: "a".repeat(64),
      model: {
        provider: "deepseek",
        id: "custom",
        name: "Custom",
        baseUrl: "https://api.deepseek.com/v1",
        api: "openai-completions",
        contextWindow: 128000,
        maxTokens: 8192,
        reasoning: false,
        input: ["text"],
        apiKey: "secret",
      },
    }).success,
  ).toBe(false);
});
