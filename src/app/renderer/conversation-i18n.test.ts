import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { SubmissionModel } from "../../modules/execution/renderer/public";
import { Submissions } from "./conversation";

let locale: "zh-CN" | "en-US" = "zh-CN";

vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof import("react")>();
  return {
    ...react,
    useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => unknown) =>
      getSnapshot(),
  };
});

vi.mock("../../modules/preferences/renderer/public", async () => {
  const { createI18n } = await import("../../shared/i18n/create-i18n");
  return { useI18n: () => ({ ...createI18n(locale) }) };
});

vi.mock("@/components/icons/common", () => ({ WebsiteIcon: () => null }));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children }: { children: ReactNode }) =>
    createElement("button", null, children),
}));

const originalText = "Keep this user-authored 原文";
const model = {
  subscribe: () => () => {},
  getSnapshot: () => ({
    sending: false,
    sendingText: false,
    message: null,
    receipts: [
      {
        submissionId: "receipt-1",
        state: "prepared",
        outcome: "unobserved",
        text: originalText,
      },
    ],
  }),
} as unknown as SubmissionModel;

describe("submission copy", () => {
  it("translates receipt chrome while retaining the submitted text", () => {
    locale = "zh-CN";
    const chinese = renderToStaticMarkup(createElement(Submissions, { model }));
    expect(chinese).toContain("已保存，未派发");
    expect(chinese).toContain(originalText);

    locale = "en-US";
    const english = renderToStaticMarkup(createElement(Submissions, { model }));
    expect(english).toContain("Saved, not dispatched");
    expect(english).toContain(originalText);
    expect(english).not.toContain("已保存，未派发");
  });
});
