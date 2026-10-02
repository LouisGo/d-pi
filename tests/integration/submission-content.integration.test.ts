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
