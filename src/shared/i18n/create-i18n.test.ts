import { describe, expect, it, vi } from "vitest";
import { createI18n } from "./create-i18n";

describe("shared i18n facade", () => {
  it("formats the same product key independently in Main and Renderer locales", () => {
    expect(createI18n("zh-CN").t("app.loading")).toBe("恢复草稿中…");
    expect(createI18n("en-US").t("app.loading")).toBe("Restoring draft…");
  });

  it("falls back to English then the key without a blank string", () => {
    const report = vi.spyOn(console, "error").mockImplementation(() => {});
    const i18n = createI18n("zh-CN");
    expect(i18n.t("missing.key" as "app.loading")).toBe("missing.key");
    expect(report).toHaveBeenCalled();
    report.mockRestore();
  });

  it("uses ICU grammar for changing counts", () => {
    const t = createI18n("en-US").t;
    expect(t("ui.history.omitted", { count: 1 })).toMatch(
      /1 non-message record\b/,
    );
    expect(t("ui.history.omitted", { count: 2 })).toMatch(
      /2 non-message records\b/,
    );
    expect(t("dev.demoLabels.buttonCount", { count: 1 })).toMatch(/1 time\b/);
    expect(t("dev.demoLabels.buttonCount", { count: 2 })).toMatch(/2 times\b/);
  });
});
