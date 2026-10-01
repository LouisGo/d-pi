import { QueryClient } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import {
  type ConfigurationBridge,
  ConfigurationCommandSchema,
  type ConfigurationScope,
  ConfigurationScopeSchema,
} from "../contracts/public";
import { configurationSnapshotQuery } from "./queries";

const scope = (threadId: string): ConfigurationScope =>
  ConfigurationScopeSchema.parse({
    kind: "thread",
    threadId,
    workingDirectoryId: crypto.randomUUID(),
  });
it("carries cache scope to the command and refuses another target's reply", async () => {
  const a = scope(crypto.randomUUID());
  const b = scope(crypto.randomUUID());
  const request = vi.fn<ConfigurationBridge["request"]>(async (command) => ({
    kind: "snapshot",
    scope: b,
    traceId: command.traceId,
    source: { directory: "/native", profile: null, cwd: "/B" },
    models: [],
    defaultModel: "B",
    openaiAuthenticated: false,
    deepseekAuthenticated: false,
    catalogError: false,
    coverage: "complete",
    issues: [],
  }));
  const client = new QueryClient();
  try {
    await expect(
      client.fetchQuery(
        configurationSnapshotQuery({ request, subscribe: () => () => {} }, a),
      ),
    ).rejects.toMatchObject({ code: "identity-mismatch" });
    expect(request.mock.calls[0]?.[0]).toMatchObject({
      kind: "snapshot",
      scope: a,
    });
    expect(client.getQueryData(["configuration", a])).toBeUndefined();
    expect(
      ConfigurationCommandSchema.safeParse({
        kind: "snapshot",
        traceId: crypto.randomUUID(),
      }).success,
    ).toBe(false);
  } finally {
    client.clear();
  }
});
it("keeps the application scope explicit instead of an absent target", async () => {
  const application: ConfigurationScope = { kind: "application" };
  const query = configurationSnapshotQuery(undefined, application);
  expect(query.queryKey).toEqual(["configuration", application]);
  expect(await new QueryClient().fetchQuery(query)).toBeNull();
});
