import { expect, it } from "vitest";
import { ToolDetailSchema } from "../../resources/contracts/public";
import { decodeToolArtifact } from "./tool-artifact";

it("uses native saved-artifact metadata and preserves unsaved bytes and unknown completeness", () => {
  expect(
    decodeToolArtifact({
      details: {
        meta: { truncation: { artifactId: "12", totalBytes: 1000000 } },
      },
    }),
  ).toEqual({ key: "12", expectedBytes: 1000000, coverage: "complete" });
  expect(
    decodeToolArtifact({
      details: {
        meta: {
          truncation: {
            artifactId: "12",
            totalBytes: 1000000,
            artifactElidedBytes: 900000,
          },
        },
      },
    }),
  ).toEqual({
    key: "12",
    expectedBytes: 1000000,
    elidedBytes: 900000,
    coverage: "partial",
  });
  expect(
    decodeToolArtifact({
      details: { meta: { limits: { columnTruncated: { artifactId: "2" } } } },
    }),
  ).toEqual({ key: "2", coverage: "unknown" });
  expect(
    decodeToolArtifact({ content: [{ type: "text", text: "artifact://12" }] }),
  ).toBeUndefined();
  expect(
    decodeToolArtifact({
      details: {
        meta: {
          artifactError: { kind: "write" },
          truncation: { artifactId: "12", totalBytes: 100 },
        },
      },
    }),
  ).toBeUndefined();
  expect(
    decodeToolArtifact({
      details: {
        meta: { truncation: { artifactId: "../12", totalBytes: 100 } },
      },
    }),
  ).toBeUndefined();
  expect(
    decodeToolArtifact({
      details: {
        meta: {
          truncation: { artifactId: "12", totalBytes: 100 },
          limits: { columnTruncated: { artifactId: "13" } },
        },
      },
    }),
  ).toBeUndefined();
});

it("reserves the large body allowance for versioned native artifacts", () => {
  const record = {
    kind: "native-record",
    threadId: crypto.randomUUID(),
    nativeSessionKey: "session",
    recordId: "result",
    revision: "record-version",
  };
  const detail = {
    source: record,
    contentRevision: "record-version",
    toolName: "bash",
    argumentsText: "{}",
    text: "a".repeat(262145),
    lifecycle: "completed",
    coverage: "observed",
    truncated: false,
  };
  expect(ToolDetailSchema.safeParse(detail).success).toBe(false);
  expect(
    ToolDetailSchema.safeParse({
      ...detail,
      source: {
        ...record,
        kind: "native-artifact",
        recordRevision: record.revision,
        artifactKey: "0",
        revision: "a".repeat(64),
      },
    }).success,
  ).toBe(true);
});
