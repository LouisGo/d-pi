import { expect, it } from "vitest";
import { SubmissionReceiptSchema } from "../../../modules/execution/contracts/public";
import { presentSavedInput } from "./history-presentation";

const threadId = crypto.randomUUID();
const attachmentId = crypto.randomUUID();
const text = "Explain this file.\n[[dpi-attachment:" + attachmentId + "]]";
const payload =
  "Explain this file.\n\n[notes.md]\nfrozen file content\n[/attachment]\n";
const binding = {
  threadId,
  sessionId: "native",
  configContextId: "config",
  sessionFile: "/unused",
};
function receipt(rawText = text, sessionId = "native") {
  return SubmissionReceiptSchema.parse({
    submissionId: crypto.randomUUID(),
    threadId,
    traceId: crypto.randomUUID(),
    revision: 1,
    text: rawText,
    target: {
      nativeSessionRef: sessionId,
      configContextId: "config",
      processInstanceId: crypto.randomUUID(),
      connectionGeneration: crypto.randomUUID(),
    },
    requestId: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    state: "acknowledged",
    acknowledgedAt: new Date().toISOString(),
    outcome: "unobserved",
    content: {
      schemaVersion: 1,
      message: payload,
      images: [],
      sources: [
        {
          attachmentId,
          inputDigest: "a".repeat(64),
          representation: "text",
          converterVersion: "utf-8",
          coverageGaps: [],
          byteLength: 19,
          name: "notes.md",
        },
      ],
      rawBytes: 19,
    },
  });
}
it("presents frozen file metadata and original prompt only for a matching session payload", () => {
  const entry = { id: "user", parentId: null, role: "user", text: payload };
  const shown = presentSavedInput(entry, binding, [receipt()]);
  expect(shown.displayText).toBe("Explain this file.");
  expect(shown.files).toHaveLength(1);
  expect(shown.text.slice(shown.files![0]!.start, shown.files![0]!.end)).toBe(
    "frozen file content",
  );
  expect(presentSavedInput(entry, binding, [receipt(text, "other")])).toEqual(
    entry,
  );
  expect(
    presentSavedInput(entry, binding, [receipt(), receipt("Different prompt")]),
  ).toEqual(entry);
  expect(
    presentSavedInput({ ...entry, text: "literal [notes.md]" }, binding, [
      receipt(),
    ]).displayText,
  ).toBeUndefined();
});

it("does not present a truncated file preview when its content embeds the attachment delimiter", () => {
  const dangerousPayload = payload.replace(
    "frozen file content",
    "first\n[/attachment]\nsecond",
  );
  const candidate = receipt();
  candidate.content!.message = dangerousPayload;
  const shown = presentSavedInput(
    { id: "file", parentId: null, role: "user", text: dangerousPayload },
    binding,
    [candidate],
  );
  expect(shown.files?.[0]?.start).toBeUndefined();
});
