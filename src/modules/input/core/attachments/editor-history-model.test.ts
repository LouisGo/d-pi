import { expect, it, vi } from "vitest";
import { ThreadIdSchema } from "../../../../shared/identity";
import type {
  AttachmentReply,
  AttachmentRequest,
} from "../../contracts/public";
import { EditorHistoryModel } from "./editor-history-model";

const threadId = ThreadIdSchema.parse("f9b0037d-1b8b-4f82-988c-7ca64f9da922");

it("reacquires a revoked lease on explicit retry and retains the actual failure trace", async () => {
  const first = crypto.randomUUID(),
    next = crypto.randomUUID(),
    id = crypto.randomUUID();
  let opens = 0,
    revoked = false;
  const commands: AttachmentRequest[] = [];
  const model = new EditorHistoryModel(
    {
      request: async (command) => {
        commands.push(command);
        if (command.kind === "history-open")
          return {
            kind: "history-lease",
            leaseId: ++opens === 1 ? first : next,
            version: 0,
          };
        if (command.kind === "history-update")
          return revoked && command.leaseId === first
            ? { kind: "unavailable", reason: "history-lease-expired" }
            : {
                kind: "history-lease",
                leaseId: command.leaseId,
                version: command.version,
              };
        return { kind: "history-released" };
      },
    },
    threadId,
    () => {},
  );
  model.observe([id]);
  expect(await model.ensure()).toBe(true);
  revoked = true;
  model.observe([crypto.randomUUID()]);
  expect(await model.ensure()).toBe(false);
  const failed = commands.at(-1);
  expect(model.failure()).toMatchObject({
    traceId: failed?.traceId,
    causeCode: "history-lease-expired",
  });
  model.observe([]);
  expect(model.failure()?.traceId).toBe(failed?.traceId);
  expect(await model.retry()).toBe(true);
  expect(opens).toBe(2);
  expect(model.failure()).toBeUndefined();
  expect(commands.at(-1)).toMatchObject({
    kind: "history-update",
    leaseId: next,
    ids: expect.arrayContaining([id]),
  });
});

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
  const leaseId = crypto.randomUUID(),
    id = crypto.randomUUID();
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
  model.observe([id]);
  await Promise.resolve();
  model.reset([id]);
  model.reset();
  finish({ kind: "history-lease", leaseId, version: 0 });
  expect(await model.ensure()).toBe(true);
  expect(commands.map((command) => command.kind)).toEqual([
    "history-open",
    "history-release",
    "history-release",
  ]);
  expect(commands.at(-1)).toMatchObject({
    kind: "history-release",
    releaseIds: [id],
    retainIds: [],
  });
  model.dispose();
});

it("clears and visibly marks the bounded epoch before accepting a draft that exceeds the 128 source budget", async () => {
  let model: EditorHistoryModel;
  const clear = vi.fn(() => model.reset());
  model = new EditorHistoryModel(
    {
      request: async (command) => {
        if (command.kind === "history-release")
          return { kind: "history-released" };
        throw Error("must not transport oversized history update");
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

it("keeps current clone candidates across repeated resets and awaits an explicit failed-release retry", async () => {
  const id = crypto.randomUUID(),
    leaseId = crypto.randomUUID();
  let failing = true;
  const commands: AttachmentRequest[] = [];
  const model = new EditorHistoryModel(
    {
      request: async (command) => {
        commands.push(command);
        if (command.kind === "history-open")
          return { kind: "history-lease", leaseId, version: 0 };
        if (command.kind === "history-update")
          return { kind: "history-lease", leaseId, version: command.version };
        if (failing)
          return { kind: "unavailable", reason: "storage-unavailable" };
        return { kind: "history-released" };
      },
    },
    threadId,
    () => {},
  );
  model.observe([id]);
  expect(await model.ensure()).toBe(true);
  model.reset([id]);
  expect(await model.ensure()).toBe(false);
  expect(model.ready()).toBe(false);
  failing = false;
  expect(await model.retry()).toBe(true);
  model.reset([id]);
  expect(await model.ensure()).toBe(true);
  model.reset();
  expect(await model.ensure()).toBe(true);
  expect(commands.at(-1)).toMatchObject({
    kind: "history-release",
    releaseIds: [id],
    retainIds: [],
  });
  model.dispose();
});

it("keeps a failed late Main lease release through another reset and retries its actual lease ID", async () => {
  const leaseId = crypto.randomUUID(),
    id = crypto.randomUUID();
  let opened!: (reply: AttachmentReply) => void,
    fail = true;
  const requests: AttachmentRequest[] = [];
  const model = new EditorHistoryModel(
    {
      request: async (command) => {
        requests.push(command);
        if (command.kind === "history-open")
          return new Promise((resolve) => {
            opened = resolve;
          });
        if (command.kind === "history-release" && command.leaseId && fail)
          return { kind: "unavailable", reason: "storage-unavailable" };
        return { kind: "history-released" };
      },
    },
    threadId,
    () => {},
  );
  model.observe([id]);
  await Promise.resolve();
  model.reset();
  opened({ kind: "history-lease", leaseId, version: 0 });
  expect(await model.ensure()).toBe(false);
  model.reset();
  expect(await model.ensure()).toBe(false);
  fail = false;
  expect(await model.retry()).toBe(true);
  expect(
    requests.filter(
      (cmd) => cmd.kind === "history-release" && cmd.leaseId === leaseId,
    ),
  ).toHaveLength(3);
  expect(model.stateStore.getState()).toMatchObject({
    pending: false,
    failed: false,
  });
});
