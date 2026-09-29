import { describe, expect, it } from "vitest";
import { LocaleSnapshotSchema, resolveLocale } from "./locale";

describe("desktop locale resolution", () => {
  it("keeps system preference separate while resolving the current OS locale", () => {
    expect(resolveLocale("system", "zh-Hans-CN")).toBe("zh-CN");
    expect(resolveLocale("system", "en-GB")).toBe("en-US");
    expect(resolveLocale("zh-CN", "en-US")).toBe("zh-CN");
    expect(
      LocaleSnapshotSchema.parse({
        preference: "system",
        resolvedLocale: "zh-CN",
      }),
    ).toEqual({ preference: "system", resolvedLocale: "zh-CN" });
  });

  it("rejects unsupported persisted or IPC locale values", () => {
    expect(() =>
      LocaleSnapshotSchema.parse({
        preference: "fr-FR",
        resolvedLocale: "fr-FR",
      }),
    ).toThrow();
  });
});
