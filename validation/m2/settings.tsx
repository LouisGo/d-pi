import type { ConfigurationBridge } from "../../src/modules/configuration/contracts/public";
import { bridge, mountRenderingFixture } from "./rendering.js";

const configuration: ConfigurationBridge = {
  subscribe: () => () => {},
  request: async (command) => {
    if (command.kind !== "snapshot")
      throw Error("Fixture does not authenticate or save credentials");
    return {
      kind: "snapshot",
      scope: command.scope,
      traceId: command.traceId,
      source: {
        directory: "/isolated/native-config",
        profile: null,
        cwd: "/isolated/rendering",
      },
      coverage: "complete",
      issues: [],
      models: [],
      defaultModel: null,
      openaiAuthenticated: false,
      deepseekAuthenticated: false,
      catalogError: false,
    };
  },
};
bridge.configuration = configuration;
mountRenderingFixture();
