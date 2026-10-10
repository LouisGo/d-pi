import { expect, it, vi } from "vitest";
import { ThreadContextSchema } from "../../../modules/threads/contracts/public";
import { ThreadCommands } from "./thread-commands";

const thread = ThreadContextSchema.parse({
  threadId: "00000000-0000-4000-8000-000000000001",
  workingDirectoryId: "00000000-0000-4000-8000-000000000002",
  directory: "/project",
  title: "Original",
});
it("announces completion only after confirmed success and keeps late dismissals from clearing newer feedback", async () => {
  let finish: (value: {
    kind: "applied";
    selection: { kind: "empty" };
  }) => void = () => {};
  const mutate = vi.fn(
    () =>
      new Promise<{ kind: "applied"; selection: { kind: "empty" } }>(
        (resolve) => {
          finish = resolve;
        },
      ),
  );
  const commands = new ThreadCommands({
    sidebar: { change: vi.fn() },
    newThread: vi.fn(),
    selectThread: vi.fn(),
    manageThread: mutate,
  });
  const complete = commands.execute({
    kind: "mutate",
    threadId: thread.threadId,
    mutation: { kind: "complete", value: true },
  });
  expect(commands.stateStore.getState()).toMatchObject({ success: null });
  finish({ kind: "applied", selection: { kind: "empty" } });
  await complete;
  const first = commands.stateStore.getState().success;
  expect(first?.kind).toBe("completed");
  const reopen = commands.execute({
    kind: "mutate",
    threadId: thread.threadId,
    mutation: { kind: "complete", value: false },
  });
  finish({ kind: "applied", selection: { kind: "empty" } });
  await reopen;
  commands.dismissSuccess(first?.id ?? -1);
  expect(commands.stateStore.getState().success?.kind).toBe("reopened");
  mutate.mockRejectedValueOnce(Error("Lost acknowledgement"));
  await commands.execute({
    kind: "mutate",
    threadId: thread.threadId,
    mutation: { kind: "complete", value: true },
  });
  expect(commands.stateStore.getState()).toMatchObject({
    success: null,
    failed: true,
  });
});
it("all presentations share the mutation owner, serialize clicks and keep failed prompts for recovery", async () => {
  let finish: (value: {
    kind: "applied";
    selection: { kind: "empty" };
  }) => void = () => {};
  const mutate = vi.fn(
    () =>
      new Promise<{ kind: "applied"; selection: { kind: "empty" } }>(
        (resolve) => {
          finish = resolve;
        },
      ),
  );
  const commands = new ThreadCommands({
    sidebar: { change: vi.fn() },
    newThread: vi.fn(),
    selectThread: vi.fn(),
    manageThread: mutate,
  });
  await commands.execute({ kind: "request-rename", thread });
  const pending = commands.execute({
    kind: "mutate",
    threadId: thread.threadId,
    mutation: { kind: "rename", title: "New" },
  });
  await commands.execute({
    kind: "mutate",
    threadId: thread.threadId,
    mutation: { kind: "delete" },
  });
  commands.closePrompt();
  expect(mutate).toHaveBeenCalledTimes(1);
  expect(commands.stateStore.getState().prompt?.kind).toBe("rename");
  finish({ kind: "applied", selection: { kind: "empty" } });
  await pending;
  expect(commands.stateStore.getState()).toMatchObject({
    prompt: null,
    pending: false,
    failed: false,
  });
  mutate.mockRejectedValueOnce(Error("Transport"));
  await commands.execute({ kind: "request-delete", thread });
  await commands.execute({
    kind: "mutate",
    threadId: thread.threadId,
    mutation: { kind: "delete" },
  });
  expect(commands.stateStore.getState()).toMatchObject({
    prompt: { kind: "delete" },
    failed: true,
    pending: false,
  });
});
