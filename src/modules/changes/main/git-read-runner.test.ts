import { spawn } from "node:child_process";
import { expect, it, vi } from "vitest";
import { ReadOperationError } from "../../../shared/read-operation";
import { GitReadRunner } from "./git-read-runner";

it("bounds real active children and queued commands; cancelling a queued command never spawns it", async () => {
  const runner = new GitReadRunner({
    maxActive: 2,
    maxQueued: 2,
    spawn: (_command, _args, options) =>
      spawn(process.execPath, ["-e", "setTimeout(() => {}, 150)"], options),
  });
  const controller = new AbortController();
  const input = { cwd: process.cwd(), args: [], maxOutputBytes: 1024 };
  const runs = [
    runner.run(input),
    runner.run(input),
    runner.run({ ...input, signal: controller.signal }),
    runner.run(input),
  ];
  const overflow = runner.run(input);
  await expect(overflow).rejects.toMatchObject({
    code: "busy",
    retryable: false,
  });
  controller.abort();
  await expect(runs[2]).rejects.toMatchObject({ name: "AbortError" });
  await Promise.all([runs[0], runs[1], runs[3]]);
  expect(runner.snapshot()).toMatchObject({
    active: 0,
    queued: 0,
    peakActive: 2,
    spawned: 3,
  });
  await runner.close();
  await expect(runner.run(input)).rejects.toMatchObject({
    code: "owner-released",
  });
});

it("retains its permit until a TERM-ignoring child physically closes", async () => {
  let ready: (() => void) | undefined;
  const started = new Promise<void>((resolve) => {
    ready = resolve;
  });
  const runner = new GitReadRunner({
    maxActive: 1,
    stopGraceMs: 80,
    spawn: (_command, _args, options) => {
      const child = spawn(
        process.execPath,
        [
          "-e",
          "process.on('SIGTERM', () => {}); process.stdout.write('ready'); setInterval(() => {}, 1000)",
        ],
        options,
      );
      child.stdout?.once("data", () => ready?.());
      return child;
    },
  });
  const controller = new AbortController();
  const pending = runner.run({
    cwd: process.cwd(),
    args: [],
    maxOutputBytes: 1024,
    signal: controller.signal,
  });
  await started;
  controller.abort();
  expect(runner.snapshot().active).toBe(1);
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  expect(runner.snapshot().active).toBe(0);
  await runner.close();
});

it("fails output overflow and timeout without releasing a child before close", async () => {
  const overflow = new GitReadRunner({
    spawn: (_command, _args, options) =>
      spawn(
        process.execPath,
        ["-e", "process.stdout.write('x'.repeat(2048))"],
        options,
      ),
  });
  await expect(
    overflow.run({ cwd: process.cwd(), args: [], maxOutputBytes: 16 }),
  ).rejects.toMatchObject({ stream: "stdout", maxBytes: 16 });
  expect(overflow.snapshot().active).toBe(0);
  await overflow.close();
  const timed = new GitReadRunner({
    timeoutMs: 30,
    spawn: (_command, _args, options) =>
      spawn(process.execPath, ["-e", "setTimeout(() => {}, 1000)"], options),
  });
  await expect(
    timed.run({ cwd: process.cwd(), args: [], maxOutputBytes: 1024 }),
  ).resolves.toMatchObject({
    ok: false,
    failure: { code: "timeout", retryable: true },
  });
  expect(timed.snapshot().active).toBe(0);
  await timed.close();
});

it("rechecks a queued owner before spawning and preserves the typed rejection", async () => {
  const spawnChild = vi.fn((_command, _args, options) =>
    spawn(process.execPath, ["-e", "setTimeout(() => {}, 100)"], options),
  );
  const runner = new GitReadRunner({ maxActive: 1, spawn: spawnChild });
  const input = { cwd: process.cwd(), args: [], maxOutputBytes: 1024 };
  const first = runner.run(input);
  const queued = runner.run({
    ...input,
    validate: () => {
      throw new ReadOperationError("foreign-thread");
    },
  });
  const rejected = expect(queued).rejects.toMatchObject({
    code: "foreign-thread",
    retryable: false,
  });
  await first;
  await rejected;
  expect(spawnChild).toHaveBeenCalledTimes(1);
  expect(runner.snapshot()).toMatchObject({ active: 0, queued: 0 });
  await runner.close();
});
