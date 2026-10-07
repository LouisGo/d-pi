import { execFile, spawn } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { GitReadRunner } from "./git-read-runner";

it("measures the same real Git burst before and after the shared child budget", async () => {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "d-pi-read-budget-")),
  );
  const command = (args: string[]) =>
    new Promise<void>((resolve, reject) =>
      execFile("git", args, { cwd: root }, (error) =>
        error ? reject(error) : resolve(),
      ),
    );
  try {
    await command(["init", "-q"]);
    await mkdir(join(root, "files"));
    await Promise.all(
      Array.from({ length: 200 }, (_, i) =>
        writeFile(join(root, "files", `${i}.txt`), "fixture"),
      ),
    );
    const args = [
      "-c",
      "core.fsmonitor=false",
      "-C",
      root,
      "status",
      "--porcelain=v1",
      "-z",
      "--untracked-files=all",
    ];
    let beforeActive = 0;
    let beforePeak = 0;
    const startedBefore = performance.now();
    const before = await Promise.all(
      Array.from(
        { length: 24 },
        () =>
          new Promise<Buffer>((resolve, reject) => {
            beforeActive++;
            beforePeak = Math.max(beforePeak, beforeActive);
            const child = execFile(
              "git",
              args,
              {
                encoding: "buffer",
                timeout: 10_000,
                maxBuffer: 5 * 1024 * 1024,
              },
              (error, stdout) => (error ? reject(error) : resolve(stdout)),
            );
            child.once("close", () => beforeActive--);
          }),
      ),
    );
    const beforeMs = performance.now() - startedBefore;
    const runner = new GitReadRunner();
    const startedAfter = performance.now();
    const after = await Promise.all(
      Array.from({ length: 24 }, () =>
        runner.run({ cwd: root, args, maxOutputBytes: 5 * 1024 * 1024 }),
      ),
    );
    const afterMs = performance.now() - startedAfter;
    expect(
      after.every((result) => result.ok && result.data.equals(before[0]!)),
    ).toBe(true);
    const measured = runner.snapshot();
    expect(beforePeak).toBe(24);
    expect(measured).toMatchObject({
      peakActive: 4,
      peakQueued: 20,
      active: 0,
      queued: 0,
      spawned: 24,
    });
    await runner.close();
    console.info(
      "READ_BUDGET_BENCHMARK",
      JSON.stringify({
        commands: 24,
        files: 200,
        before: { peakActive: beforePeak, durationMs: beforeMs },
        after: { ...measured, durationMs: afterMs },
        equalOutput: true,
      }),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("measures releasing a stale real child instead of waiting for its full duration", async () => {
  const script = "process.stdout.write('ready'); setTimeout(() => {}, 250)";
  const beforeStart = performance.now();
  await new Promise<void>((resolve, reject) =>
    execFile(process.execPath, ["-e", script], { timeout: 10_000 }, (error) =>
      error ? reject(error) : resolve(),
    ),
  );
  const beforeMs = performance.now() - beforeStart;
  let ready: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    ready = resolve;
  });
  const runner = new GitReadRunner({
    spawn: (_command, _args, options) => {
      const child = spawn(process.execPath, ["-e", script], options);
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
  await gate;
  const cancelStart = performance.now();
  controller.abort();
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  const cancelToCloseMs = performance.now() - cancelStart;
  expect(runner.snapshot().active).toBe(0);
  expect(cancelToCloseMs).toBeLessThan(beforeMs);
  await runner.close();
  console.info(
    "READ_CANCEL_BENCHMARK",
    JSON.stringify({
      beforeFullDurationMs: beforeMs,
      cancelToCloseMs,
      remainingChildren: 0,
    }),
  );
});
