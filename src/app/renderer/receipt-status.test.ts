import { expect, it } from "vitest";
import { SubmissionRejectionReasonSchema } from "../../modules/execution/contracts/public";
import { createI18n } from "../../shared/i18n/create-i18n";
import { receiptNeedsAttention, receiptStatusKey } from "./receipt-status";

it.each(SubmissionRejectionReasonSchema.options)(
  "gives the native refusal cause %s its own message",
  (rejectionReason) => {
    const key = receiptStatusKey({ state: "rejected", rejectionReason });
    expect(key).toBe(
      `ui.interaction.rejected.${rejectionReason.replace(/-([a-z])/g, (_, c) => c.toUpperCase())}`,
    );
    // The fallback returns the key itself, so a real translation must differ.
    for (const locale of ["en-US", "zh-CN"] as const)
      expect(createI18n(locale).t(key)).not.toBe(key);
  },
);

it("keeps the generic rejection copy when the cause is not reported", () => {
  expect(receiptStatusKey({ state: "rejected" })).toBe(
    "ui.interaction.followUpRejected",
  );
});

it("does not report an unconfirmed outcome as acknowledged", () => {
  expect(
    receiptStatusKey({ state: "acknowledged", outcome: "unobserved" }),
  ).toBe("ui.interaction.followUpAcknowledged");
  expect(receiptStatusKey({ state: "acknowledged", outcome: "unknown" })).toBe(
    "ui.interaction.followUpUnknown",
  );
  expect(receiptStatusKey({ state: "acknowledged", outcome: "failed" })).toBe(
    "ui.interaction.followUpUnknown",
  );
});

it("maps the remaining receipt states", () => {
  expect(receiptStatusKey({ state: "prepared" })).toBe(
    "ui.interaction.followUpPrepared",
  );
  expect(receiptStatusKey({ state: "dispatching" })).toBe(
    "ui.interaction.followUpDispatching",
  );
  expect(receiptStatusKey({ state: "unknown" })).toBe(
    "ui.interaction.followUpUnknown",
  );
});

it("flags exactly the receipts that need the user's attention", () => {
  expect(receiptNeedsAttention({ state: "rejected" })).toBe(true);
  expect(receiptNeedsAttention({ state: "unknown" })).toBe(true);
  expect(
    receiptNeedsAttention({ state: "acknowledged", outcome: "failed" }),
  ).toBe(true);
  expect(
    receiptNeedsAttention({ state: "acknowledged", outcome: "unknown" }),
  ).toBe(true);
  expect(
    receiptNeedsAttention({ state: "acknowledged", outcome: "unobserved" }),
  ).toBe(false);
  expect(receiptNeedsAttention({ state: "prepared" })).toBe(false);
  expect(receiptNeedsAttention({ state: "dispatching" })).toBe(false);
});
