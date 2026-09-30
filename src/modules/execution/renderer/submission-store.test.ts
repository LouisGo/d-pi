import { expect, it } from "vitest";
import {
  type PlainUiMessageCode,
  uiMessage,
} from "../../../shared/messages/contracts";
import { DraftSchema } from "../../input/contracts/public";
import { DraftController } from "../../input/core/public";
import {
  type SubmissionBridge,
  type SubmissionReceipt,
  SubmissionReceiptSchema,
  type SubmissionReply,
} from "../contracts/public";
import { SubmissionModel } from "./submission-model";

type PreparedReceipt = Extract<SubmissionReceipt, { state: "prepared" }>;
function preparedReceipt(value: unknown): PreparedReceipt {
  const receipt = SubmissionReceiptSchema.parse(value);
  if (receipt.state !== "prepared") throw Error("expected prepared fixture");
  return receipt;
}

// The SubmissionModel state container must keep the publication contract the
// hand written view had: partial publications merge into the current view,
// fine grained selectors only fire for their own projection, the snapshot stays
// a cached reference and dispose releases the bridge and stops publication.
function failure(code: PlainUiMessageCode) {
  return {
    errorId: crypto.randomUUID(),
    traceId: crypto.randomUUID(),
    code: "storage-unavailable" as const,
    observedAt: "main" as const,
    reportedBy: "app" as const,
    attribution: "unknown" as const,
    handlingOwner: "submission" as const,
    recovery: "reconcile_first" as const,
    message: uiMessage(code),
  };
}

function submissionStore() {
  const draft = DraftSchema.parse({
    schemaVersion: 1,
    threadId: crypto.randomUUID(),
    workingDirectoryId: crypto.randomUUID(),
    directory: "/fixture",
    revision: 1,
    text: "A",
  });
  const controller = new DraftController(
    draft,
    async (revision) => ({
      kind: "saved",
      threadId: draft.threadId,
      revision: revision + 1,
    }),
    () => {
      throw Error("unexpected save failure");
    },
  );
  let receive: (reply: SubmissionReply) => void = () => {};
  let released = false;
  let listFails = false;
  let prepared: PreparedReceipt | undefined;
  const bridge: SubmissionBridge = {
    subscribe(listener) {
      receive = listener;
      return () => {
        released = true;
      };
    },
    async request(command) {
      if (command.kind === "list") {
        if (listFails) throw Error("list unavailable");
        return { kind: "list", receipts: [] };
      }
      if (command.kind === "prepare") {
        const { kind: _kind, ...value } = command;
        prepared = preparedReceipt({
          ...value,
          target: {
            processInstanceId: crypto.randomUUID(),
            connectionGeneration: crypto.randomUUID(),
            configContextId: "cfg",
            nativeSessionRef: "s",
          },
          requestId: crypto.randomUUID(),
          state: "prepared",
          acknowledgedAt: null,
          outcome: "unobserved",
          createdAt: "now",
          updatedAt: "now",
        });
        return { kind: "receipt", receipt: prepared };
      }
      if (!prepared) throw Error("missing prepared receipt");
      return {
        kind: "receipt",
        receipt: { ...prepared, state: "dispatching" },
      };
    },
  };
  const model = new SubmissionModel(bridge, draft.threadId, controller);
  return {
    model,
    controller,
    receive: (reply: SubmissionReply) => receive(reply),
    released: () => released,
    failList: () => {
      listFails = true;
    },
    prepared: () => prepared,
  };
}

it("notifies a selected projection only when that projection changes", async () => {
  const fixture = submissionStore();
  const sendings: boolean[] = [];
  const states: (string | null)[] = [];
  const messages: (string | null)[] = [];
  fixture.model.subscribeTo(
    (view) => view.sending,
    () => {
      sendings.push(fixture.model.getSnapshot().sending);
    },
  );
  fixture.model.subscribeTo(
    (view) => view.receipts[0]?.state ?? null,
    () => {
      states.push(fixture.model.getSnapshot().receipts[0]?.state ?? null);
    },
  );
  fixture.model.subscribeTo(
    (view) => view.message?.code ?? null,
    () => {
      messages.push(fixture.model.getSnapshot().message?.code ?? null);
    },
  );
  // A list refresh replaces the receipt array with an equivalent empty one:
  // no projection changed, so nothing may notify.
  await fixture.model.refresh();
  expect(sendings).toEqual([]);
  expect(states).toEqual([]);
  expect(messages).toEqual([]);
  await fixture.model.send();
  // The two receipt publications in between never touch the sending flag, and
  // the receipt projection ignores the two flag flips.
  expect(sendings).toEqual([true, false]);
  expect(states).toEqual(["prepared", "dispatching"]);
  expect(messages).toEqual([]);
  const prepared = fixture.prepared();
  if (!prepared) throw Error("missing prepared receipt");
  fixture.receive({
    kind: "receipt",
    receipt: { ...prepared, state: "acknowledged", acknowledgedAt: "now" },
  });
  expect(states).toEqual(["prepared", "dispatching", "acknowledged"]);
  expect(sendings).toEqual([true, false]);
  fixture.receive({
    kind: "failed",
    code: "storage-unavailable",
    error: failure("submission.storageUnavailable"),
  });
  expect(messages).toEqual(["submission.storageUnavailable"]);
  expect(states).toEqual(["prepared", "dispatching", "acknowledged"]);
  fixture.model.dispose();
  fixture.controller.dispose();
});

it("releases a fine grained subscription", async () => {
  const fixture = submissionStore();
  await fixture.model.refresh();
  let changes = 0;
  const release = fixture.model.subscribeTo(
    (view) => view.receipts[0]?.state ?? null,
    () => {
      changes += 1;
    },
  );
  await fixture.model.send();
  expect(changes).toBe(2);
  release();
  const prepared = fixture.prepared();
  if (!prepared) throw Error("missing prepared receipt");
  fixture.receive({
    kind: "receipt",
    receipt: { ...prepared, state: "acknowledged", acknowledgedAt: "later" },
  });
  expect(changes).toBe(2);
  fixture.model.dispose();
  fixture.controller.dispose();
});

it("keeps the other view fields when one field is published", async () => {
  const fixture = submissionStore();
  await fixture.model.refresh();
  await fixture.model.send();
  const sent = fixture.model.getSnapshot();
  expect(sent.receipts).toHaveLength(1);
  fixture.failList();
  await fixture.model.refresh();
  const failed = fixture.model.getSnapshot();
  expect(failed.message).toEqual({ code: "submission.stateUnverified" });
  expect(failed.receipts).toEqual(sent.receipts);
  expect(failed.sending).toBe(false);
  expect(failed.sendingText).toBe(false);
  fixture.model.dispose();
  fixture.controller.dispose();
});

it("does not publish after dispose and releases the bridge subscription", async () => {
  const fixture = submissionStore();
  await fixture.model.refresh();
  let changes = 0;
  fixture.model.subscribe(() => {
    changes += 1;
  });
  const before = fixture.model.getSnapshot();
  fixture.model.dispose();
  expect(fixture.released()).toBe(true);
  fixture.receive({
    kind: "failed",
    code: "storage-unavailable",
    error: failure("submission.storageUnavailable"),
  });
  expect(fixture.model.getSnapshot()).toBe(before);
  expect(changes).toBe(0);
  fixture.controller.dispose();
});
