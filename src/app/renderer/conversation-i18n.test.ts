import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { HistoryEntry } from "../../modules/conversation/contracts/public";
import type { SubmissionModel } from "../../modules/execution/renderer/public";
import { historyToolEvidenceMessage, Submissions } from "./conversation";

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

describe("history tool evidence", () => {
  it("renders the adapter-provided effect and keeps failure as the first outcome", () => {
    const mutation: NonNullable<HistoryEntry["toolEvidence"]> = {
      toolCallId: "call-mutation",
      toolName: "future-file-tool",
      isError: false,
      effect: "mutation",
      coverage: "text-parts-only",
      nonTextParts: 0,
    };
    expect(historyToolEvidenceMessage(mutation)).toBe(
      "ui.history.toolReportedWrite",
    );

    const noMutation: NonNullable<HistoryEntry["toolEvidence"]> = {
      toolCallId: "call-read",
      toolName: "future-read-tool",
      isError: false,
      effect: "no-mutation",
      coverage: "text-parts-only",
      nonTextParts: 0,
    };
    expect(historyToolEvidenceMessage(noMutation)).toBe(
      "ui.history.toolSuccessNoWrite",
    );

    const unknown: NonNullable<HistoryEntry["toolEvidence"]> = {
      toolCallId: "call-unknown",
      toolName: "future-tool",
      isError: false,
      effect: "unknown",
      coverage: "text-parts-only",
      nonTextParts: 0,
    };
    expect(historyToolEvidenceMessage(unknown)).toBe("ui.history.toolUnknown");

    const failedMutation: NonNullable<HistoryEntry["toolEvidence"]> = {
      toolCallId: "call-failed",
      toolName: "future-file-tool",
      isError: true,
      effect: "mutation",
      coverage: "text-parts-only",
      nonTextParts: 0,
    };
    expect(historyToolEvidenceMessage(failedMutation)).toBe(
      "ui.history.toolFailed",
    );
  });
});
