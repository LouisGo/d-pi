import { describe, expect, it, vi } from "vitest";
import { createI18n } from "./create-i18n";

describe("shared i18n facade", () => {
  it("formats the same product key independently in Main and Renderer locales", () => {
    expect(createI18n("zh-CN").t("app.loading")).toBe("正在恢复本地草稿…");
    expect(createI18n("en-US").t("app.loading")).toBe(
      "Restoring the local draft…",
    );
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
      /1 other non-message record\b/,
    );
    expect(t("ui.history.omitted", { count: 2 })).toMatch(
      /2 other non-message records\b/,
    );
    expect(t("ui.runtime.queueActive", { queued: 1, background: 0 })).toMatch(
      /1 item\b/,
    );
    expect(t("ui.runtime.queueActive", { queued: 2, background: 0 })).toMatch(
      /2 items\b/,
    );
  });
});
