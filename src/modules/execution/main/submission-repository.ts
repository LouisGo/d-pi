import type { AppDatabase } from "../../../platform/main/storage/public";
import type {
  DraftConsumptionWriter,
  DraftReader,
} from "../../input/contracts/public";
import {
  type FrozenSubmission,
  SubmissionConflict,
  type SubmissionReceipt,
  SubmissionReceiptSchema,
  type SubmissionRejectionReason,
} from "../contracts/public";
export class SubmissionRepository {
  constructor(
    private readonly database: AppDatabase,
    private readonly drafts: Pick<DraftReader, "read"> & DraftConsumptionWriter,
  ) {}
  private get db() {
    return this.database.connection;
  }
  prepareSubmission(value: FrozenSubmission): SubmissionReceipt {
    return this.database.transaction(() => {
      const existing = this.submission(value.submissionId);
      if (existing) {
        // Identity reuse cannot replace the frozen content or route it elsewhere.
        if (
          existing.threadId !== value.threadId ||
          existing.traceId !== value.traceId ||
          existing.revision !== value.revision ||
          existing.text !== value.text ||
          existing.delivery !== value.delivery ||
          existing.retryOf !== value.retryOf ||
          (existing.origin ?? "draft") !== (value.origin ?? "draft") ||
          existing.requestId !== value.requestId ||
          existing.target.processInstanceId !==
            value.target.processInstanceId ||
          existing.target.connectionGeneration !==
            value.target.connectionGeneration ||
          existing.target.configContextId !== value.target.configContextId ||
          existing.target.nativeSessionRef !== value.target.nativeSessionRef
        )
          throw new SubmissionConflict("Submission identity conflict");
        return existing;
      }
      if (value.retryOf) {
        const source = this.submission(value.retryOf);
        if (
          !source ||
          source.threadId !== value.threadId ||
          source.text !== value.text ||
          source.revision !== value.revision ||
          source.delivery !== value.delivery
        )
          throw new SubmissionConflict("Invalid resend source");
      } else if (value.origin === "free") {
        // Free text has no draft revision to bind: uniqueness is carried by
        // the submissionId primary key, so neither the same-revision gate
        // nor the draft-content gate applies.
      } else {
        const sameRevision = this.db
          .prepare(
            "SELECT id FROM submission WHERE thread_id=? AND json_extract(receipt, '$.revision')=? AND json_extract(receipt, '$.state') != 'rejected' LIMIT 1",
          )
          .get(value.threadId, value.revision);
        if (sameRevision)
          throw new SubmissionConflict("Revision already frozen");
        const draft = this.drafts.read(value.threadId);
        if (
          draft.revision !== value.revision ||
          draft.text !== value.text ||
          draft.consumedBy
        )
          throw new SubmissionConflict("Submission draft revision conflict");
      }
      const now = new Date().toISOString();
      const receipt: SubmissionReceipt = {
        // A new attempt owns its own lifecycle facts. Structural callers may
        // pass a receipt as FrozenSubmission, so copy only the frozen identity.
        submissionId: value.submissionId,
        threadId: value.threadId,
        traceId: value.traceId,
        revision: value.revision,
        text: value.text,
        requestId: value.requestId,
        target: value.target,
        ...(value.origin === undefined ? {} : { origin: value.origin }),
        ...(value.delivery === undefined ? {} : { delivery: value.delivery }),
        ...(value.retryOf === undefined ? {} : { retryOf: value.retryOf }),
        state: "prepared",
        acknowledgedAt: null,
        outcome: "unobserved",
        createdAt: now,
        updatedAt: now,
      };
      this.db
        .prepare("INSERT INTO submission VALUES(?,?,?)")
        .run(value.submissionId, value.threadId, JSON.stringify(receipt));
      return receipt;
    });
  }
  dispatchSubmission(id: string): boolean {
    return this.database.transaction(() => {
      const receipt = this.submission(id);
      if (!receipt || receipt.state !== "prepared") return false;
      this.writeReceipt({ ...receipt, state: "dispatching" });
      return true;
    });
  }
  recoverInterruptedSubmissions(): number {
    return this.database.transaction(() => {
      const rows = this.db
        .prepare(
          "SELECT receipt FROM submission WHERE json_extract(receipt,'$.state')='dispatching' ORDER BY rowid",
        )
        .all();
      let recovered = 0;
      for (const row of rows) {
        const receipt = this.decodeReceipt(row.receipt);
        if (receipt.state === "dispatching") {
          this.writeReceipt({
            ...receipt,
            state: "unknown",
            outcome: "unknown",
          });
          recovered += 1;
        }
      }
      return recovered;
    });
  }
  acknowledgeSubmission(id: string): boolean {
    return this.database.transaction(() => {
      const receipt = this.submission(id);
      if (!receipt) return false;
      if (receipt.state === "acknowledged") return true;
      if (receipt.state !== "dispatching" && receipt.state !== "unknown")
        return false;
      this.writeReceipt({
        ...receipt,
        state: "acknowledged",
        acknowledgedAt: new Date().toISOString(),
      });
      // Only draft-bound submissions consume editor content. Free-text
      // follow-ups (origin "free") never mark a draft revision consumed.
      if (!receipt.retryOf && receipt.origin !== "free")
        this.drafts.consume(
          receipt.threadId,
          receipt.revision,
          receipt.submissionId,
        );
      return true;
    });
  }
  submission(id: string): SubmissionReceipt | null {
    const row = this.db
      .prepare("SELECT receipt FROM submission WHERE id=?")
      .get(id);
    if (!row) return null;
    return this.decodeReceipt(row.receipt);
  }
  list(threadId: string): SubmissionReceipt[] {
    return this.db
      .prepare(
        "SELECT receipt FROM submission WHERE thread_id=? ORDER BY rowid DESC LIMIT 100",
      )
      .all(threadId)
      .map((row) => this.decodeReceipt(row.receipt));
  }
  private decodeReceipt(value: unknown): SubmissionReceipt {
    if (typeof value !== "string")
      throw new Error("Invalid submission receipt");
    return SubmissionReceiptSchema.parse(JSON.parse(value));
  }
  private writeReceipt(receipt: SubmissionReceipt): void {
    this.db
      .prepare("UPDATE submission SET receipt=? WHERE id=?")
      .run(
        JSON.stringify({ ...receipt, updatedAt: new Date().toISOString() }),
        receipt.submissionId,
      );
  }
  // Main before dispatch or Host before its native write can prove non-dispatch.
  rejectSubmission(id: string, reason?: SubmissionRejectionReason): void {
    this.database.transaction(() => {
      const receipt = this.submission(id);
      if (
        !receipt ||
        (receipt.state !== "prepared" &&
          receipt.state !== "dispatching" &&
          receipt.state !== "unknown")
      )
        return;
      const { rejectionReason: _previous, ...rest } = receipt;
      this.writeReceipt({
        ...rest,
        state: "rejected",
        outcome: "unobserved",
        ...(reason ? { rejectionReason: reason } : {}),
      });
    });
  }
  unknownSubmission(id: string): void {
    this.database.transaction(() => {
      const receipt = this.submission(id);
      if (
        !receipt ||
        receipt.state === "prepared" ||
        receipt.state === "rejected"
      )
        return;
      const outcome = receipt.outcome === "failed" ? "failed" : "unknown";
      if (receipt.state === "acknowledged") {
        this.writeReceipt({ ...receipt, outcome });
      } else {
        this.writeReceipt({ ...receipt, state: "unknown", outcome });
      }
    });
  }
  failSubmission(id: string): void {
    this.database.transaction(() => {
      const receipt = this.submission(id);
      if (
        !receipt ||
        receipt.state === "prepared" ||
        receipt.state === "rejected"
      )
        return;
      if (receipt.state === "acknowledged") {
        this.writeReceipt({ ...receipt, outcome: "failed" });
      } else {
        this.writeReceipt({ ...receipt, state: "unknown", outcome: "failed" });
      }
    });
  }
}
