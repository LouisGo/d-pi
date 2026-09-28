import { expect, it } from "vitest";
import { DraftSchema } from "../draft/contracts";
import { DraftController } from "../draft/controller";
import { SubmissionReceiptSchema, type SubmissionReply } from "./contracts";
import { SubmissionModel } from "./model";

it("freezes A before dispatch, consumes only its unchanged edit sequence, and deduplicates ACK", async () => {
  const draft = DraftSchema.parse({
    schemaVersion: 1,
    threadId: crypto.randomUUID(),
    workspaceId: crypto.randomUUID(),
    directory: "/p",
    revision: 1,
    text: "A",
  });
  const c = new DraftController(
    draft,
    async (revision) => ({
      kind: "saved",
      threadId: draft.threadId,
      revision: revision + 1,
    }),
    () => {
      throw Error("save failed");
    },
  );
  let receive: (r: SubmissionReply) => void = () => {};
  let receipt: ReturnType<typeof SubmissionReceiptSchema.parse>;
  const m = new SubmissionModel(
    {
      subscribe(cb) {
        receive = cb;
        return () => {};
      },
      async request(command) {
        if (command.kind === "list") return { kind: "list", receipts: [] };
        if (command.kind === "prepare") {
          const { kind: _kind, ...value } = command;
          receipt = SubmissionReceiptSchema.parse({
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
        }
        return { kind: "receipt", receipt };
      },
    },
    draft.threadId,
    c,
  );
  let clears = 0;
  m.replace = () => {
    clears++;
    return true;
  };
  await m.send();
  c.edit("B");
  receive({
    kind: "receipt",
    receipt: { ...receipt!, state: "acknowledged", acknowledgedAt: "now" },
  });
  expect(clears).toBe(0);
  expect(m.getSnapshot().receipts[0]?.text).toBe("A");
  m.dispose();
  c.dispose();
});
