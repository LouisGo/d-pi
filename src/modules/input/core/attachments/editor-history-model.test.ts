import { expect, it, vi } from "vitest";
import { ThreadIdSchema } from "../../../../shared/identity";
import type {
  AttachmentReply,
  AttachmentRequest,
} from "../../contracts/public";
import { EditorHistoryModel } from "./editor-history-model";

const threadId = ThreadIdSchema.parse("f9b0037d-1b8b-4f82-988c-7ca64f9da922");

it("retains failed dependency protection for explicit retry and releases the current Main lease when history ends", async () => {
  const leaseId = crypto.randomUUID(),
    id = crypto.randomUUID();
  let failure = true;
  const request = vi.fn(
    async (command: AttachmentRequest): Promise<AttachmentReply> => {
      if (command.kind === "history-open")
        return { kind: "history-lease", leaseId, version: 0 };
      if (command.kind === "history-update")
        return failure
          ? { kind: "unavailable", reason: "storage-unavailable" }
          : { kind: "history-lease", leaseId, version: command.version };
      return { kind: "history-released" };
    },
  );
  const clear = vi.fn();
  const model = new EditorHistoryModel({ request }, threadId, clear);
  model.observe([id]);
  expect(model.ready()).toBe(false);
  expect(await model.ensure()).toBe(false);
  expect(model.stateStore.getState()).toMatchObject({ failed: true });
  expect(clear).not.toHaveBeenCalled();
  failure = false;
  expect(await model.retry()).toBe(true);
  expect(
    request.mock.calls.some(
      ([command]) =>
        command.kind === "history-update" &&
        command.ids.includes(id) &&
        command.version === 2,
    ),
  ).toBe(true);
  model.reset();
  await model.ensure();
  expect(request.mock.calls.at(-1)?.[0]).toMatchObject({
    kind: "history-release",
    leaseId,
  });
  model.dispose();
});

it("releases a late Main open after its history epoch has been replaced, without reviving old IDs", async () => {
  const leaseId = crypto.randomUUID();
  let finish: (reply: AttachmentReply) => void = () => {};
  const commands: AttachmentRequest[] = [];
  const model = new EditorHistoryModel(
    {
      request: async (command) => {
        commands.push(command);
        if (command.kind === "history-open")
          return new Promise((resolve) => {
            finish = resolve;
          });
        return { kind: "history-released" };
      },
    },
    threadId,
    () => {},
  );
  model.observe([crypto.randomUUID()]);
  await Promise.resolve();
  model.reset();
  finish({ kind: "history-lease", leaseId, version: 0 });
  expect(await model.ensure()).toBe(true);
  expect(commands.map((command) => command.kind)).toEqual([
    "history-open",
    "history-release",
  ]);
  model.dispose();
});

it("clears and visibly marks the bounded epoch before accepting a draft that exceeds the 128 source budget", async () => {
  let model: EditorHistoryModel;
  const clear = vi.fn(() => model.reset());
  model = new EditorHistoryModel(
    {
      request: async () => {
        throw Error("must not transport oversized history");
      },
    },
    threadId,
    clear,
  );
  model.observe(Array.from({ length: 129 }, () => crypto.randomUUID()));
  expect(clear).toHaveBeenCalledOnce();
  expect(await model.ensure()).toBe(true);
  expect(model.stateStore.getState()).toMatchObject({
    limited: true,
    failed: false,
    pending: false,
  });
  model.dispose();
});
