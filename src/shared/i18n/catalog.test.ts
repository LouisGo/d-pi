import { parse } from "@formatjs/icu-messageformat-parser";
import { describe, expect, it } from "vitest";
import { PlainUiMessageCodeSchema } from "../../features/localization/contracts";
import { enUSMessages, zhCNMessages } from "./catalog";

describe("product message catalogs", () => {
  it("has matching English and Chinese keys and covers every cross-layer message code", () => {
    expect(Object.keys(zhCNMessages).sort()).toEqual(
      Object.keys(enUSMessages).sort(),
    );
    for (const code of [
      ...PlainUiMessageCodeSchema.options,
      "runtime.configProfile",
      "runtime.configDirectory",
      "conversation.unsupportedNativeEvent",
    ]) {
      expect(enUSMessages).toHaveProperty(code);
      expect(zhCNMessages).toHaveProperty(code);
    }
  });

  it("parses all ICU messages in both supported locales", () => {
    for (const catalog of [enUSMessages, zhCNMessages]) {
      for (const [key, message] of Object.entries(catalog)) {
        expect(() => parse(message), key).not.toThrow();
      }
    }
  });
});
