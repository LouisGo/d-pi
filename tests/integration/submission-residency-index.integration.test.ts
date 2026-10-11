import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { AppStorage } from "../../src/app/main/wiring/app-storage";
import { FrozenSubmissionSchema } from "../../src/modules/execution/contracts/public";

it("indexes lifetime evidence across all receipts, updates it with terminal observations, and never hydrates text", () => {
  const root = mkdtempSync(join(tmpdir(), "d-pi-residency-index-"));
  const store = AppStorage.open(join(root, "app.sqlite"));
  try {
    const draft = store.drafts.create(root);
    const create = () =>
      store.submissions.prepareSubmission(
        FrozenSubmissionSchema.parse({
          submissionId: crypto.randomUUID(),
          threadId: draft.threadId,
          traceId: crypto.randomUUID(),
          requestId: crypto.randomUUID(),
          revision: 0,
          origin: "free",
          text: "x".repeat(10_000),
          target: {
            processInstanceId: crypto.randomUUID(),
            connectionGeneration: crypto.randomUUID(),
            configContextId: "fixture",
            nativeSessionRef: "/fixture/native.jsonl",
          },
        }),
      );
    expect(store.submissions.hasUnsettled(draft.threadId)).toBe(false);
    const old = create();
    for (let index = 0; index < 101; index++) {
      const newer = create();
      store.submissions.rejectSubmission(newer.submissionId, "not-ready");
    }
    const prepare = vi.spyOn(store.database.connection, "prepare");
    expect(store.submissions.hasUnsettled(draft.threadId)).toBe(true);
    const sql = prepare.mock.calls[0]?.[0];
    prepare.mockRestore();
    if (!sql) throw Error("missing lifetime query");
    const plan = store.database.connection
      .prepare(`EXPLAIN QUERY PLAN ${sql}`)
      .all(draft.threadId);
    expect(
      plan.some((row) =>
        /SEARCH submission USING INDEX submission_unsettled_thread.*thread_id/.test(
          String(row.detail),
        ),
      ),
    ).toBe(true);
    expect(sql).not.toContain("SELECT receipt");
    store.submissions.dispatchSubmission(old.submissionId);
    store.submissions.acknowledgeSubmission(old.submissionId);
    expect(store.submissions.hasUnsettled(draft.threadId)).toBe(true);
    store.submissions.observePromptResult(old.submissionId, {
      source: "native-prompt-result",
      status: "completed",
      agentInvoked: true,
      sessionSettled: true,
    });
    expect(store.submissions.hasUnsettled(draft.threadId)).toBe(false);
    expect(store.submissions.hasUnsettled(crypto.randomUUID())).toBe(false);
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});

it.each(["{broken", '{"state":"unrecognized"}', '{"state":"acknowledged"}'])(
  "retains a native when lifetime metadata cannot prove settlement (%s)",
  (receipt) => {
    const root = mkdtempSync(join(tmpdir(), "d-pi-residency-invalid-"));
    const store = AppStorage.open(join(root, "app.sqlite"));
    try {
      const draft = store.drafts.create(root);
      store.database.connection
        .prepare("INSERT INTO submission(id,thread_id,receipt) VALUES(?,?,?)")
        .run(crypto.randomUUID(), draft.threadId, receipt);
      expect(store.submissions.hasUnsettled(draft.threadId)).toBe(true);
    } finally {
      store.close();
      rmSync(root, { recursive: true, force: true });
    }
  },
);
