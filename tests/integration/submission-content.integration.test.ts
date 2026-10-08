import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { AppStorage } from "../../src/app/main/wiring/app-storage";
import { SubmissionCoordinator } from "../../src/modules/execution/core/public";

it("persists frozen represented content independently of the draft and dispatches the actual image once", () => {
  const directory = mkdtempSync(join(tmpdir(), "dpi-content-"));
  const store = AppStorage.open(join(directory, "app.sqlite"));
  try {
    const draft = store.drafts.create(directory);
    store.drafts.save(draft.threadId, 0, "short attachment token");
    const content = {
      schemaVersion: 1 as const,
      message: "captured file text",
      images: [
        { type: "image" as const, data: "aGVsbG8=", mimeType: "image/png" },
      ],
      sources: [],
      rawBytes: 5,
    };
    const frozen = {
      submissionId: randomUUID(),
      threadId: draft.threadId,
      traceId: randomUUID(),
      revision: 1,
      text: "short attachment token",
      content,
      requestId: randomUUID(),
      target: {
        processInstanceId: randomUUID(),
        connectionGeneration: randomUUID(),
        configContextId: "test",
        nativeSessionRef: "managed",
      },
    };
    const frames: string[] = [];
    const coordinator = new SubmissionCoordinator(store.submissions, {
      isCurrentTarget: () => true,
      canDispatch: () => true,
      write: (_value, frame) => frames.push(frame),
    });
    expect(coordinator.prepare(frozen).kind).toBe("receipt");
    expect(store.submissions.submission(frozen.submissionId)).toMatchObject({
      content,
    });
    store.drafts.save(draft.threadId, 1, "later draft");
    coordinator.dispatch(frozen.submissionId);
    coordinator.dispatch(frozen.submissionId);
    expect(frames).toHaveLength(1);
    expect(JSON.parse(frames[0] ?? "")).toMatchObject({
      message: content.message,
      images: content.images,
    });
    expect(store.drafts.read(draft.threadId).text).toBe("later draft");
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

it("admits an ordinary image above 1 MiB Base64 and stores resource references and dispatches exactly once", () => {
  const directory = mkdtempSync(join(tmpdir(), "dpi-image-budget-"));
  const store = AppStorage.open(join(directory, "app.sqlite"));
  try {
    const draft = store.drafts.create(directory);
    store.drafts.save(draft.threadId, 0, "解释这张图片");
    const resource = { digest: "a".repeat(64), byteLength: 908202 };
    const attachmentId = randomUUID();
    const frozen = {
      submissionId: randomUUID(),
      threadId: draft.threadId,
      traceId: randomUUID(),
      revision: 1,
      text: "解释这张图片",
      requestId: randomUUID(),
      content: {
        schemaVersion: 1 as const,
        message: "解释这张图片",
        images: [{ type: "image" as const, mimeType: "image/png", resource }],
        sources: [
          {
            attachmentId,
            inputDigest: resource.digest,
            representation: "image" as const,
            converterVersion: "original-image-v1",
            coverageGaps: [],
            byteLength: 908202,
            name: "question.png",
          },
        ],
        rawBytes: 908202,
      },
      target: {
        processInstanceId: randomUUID(),
        connectionGeneration: randomUUID(),
        configContextId: "test",
        nativeSessionRef: "managed",
      },
    };
    const frames: string[] = [];
    const coordinator = new SubmissionCoordinator(store.submissions, {
      isCurrentTarget: () => true,
      canDispatch: () => true,
      write: (_v, frame) => frames.push(frame),
    });
    expect(coordinator.prepare(frozen).kind).toBe("receipt");
    coordinator.dispatch(frozen.submissionId);
    coordinator.dispatch(frozen.submissionId);
    expect(frames).toHaveLength(1);
    expect(JSON.parse(frames[0]!).images[0].resource).toEqual(resource);
    expect(frames[0]!.length).toBeLessThan(1024);
    expect(
      JSON.stringify(store.submissions.submission(frozen.submissionId)),
    ).not.toContain("base64");
    expect(store.drafts.read(draft.threadId).text).toBe("解释这张图片");
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
