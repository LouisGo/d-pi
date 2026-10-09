import { afterEach, expect, it, vi } from "vitest";
import { HostScope } from "./host-scope";

afterEach(() => vi.useRealTimers());

it("closing one Host cancels only its read signal and timers, refuses new work and never attributes local cancellation as an execution failure", async () => {
  vi.useFakeTimers();
  const failures = vi.fn();
  const a = new HostScope(failures);
  const b = new HostScope(failures);
  let signal: AbortSignal | undefined;
  let late!: () => void;
  const aRead = a.run((value) => {
    signal = value;
    return new Promise<void>((resolve) => {
      late = resolve;
    });
  });
  const cancelled = expect(aRead).rejects.toThrow("Host wait interrupted");
  const aDeadline = vi.fn();
  const bDeadline = vi.fn();
  a.deadline(100, aDeadline, true);
  b.deadline(100, bDeadline, true);
  const closing = a.close();
  expect(a.close()).toBe(closing);
  await closing;
  await cancelled;
  expect(signal?.aborted).toBe(true);
  late();
  await expect(a.run(async () => true)).rejects.toThrow(
    "Host wait interrupted",
  );
  a.deadline(100, aDeadline);
  await vi.advanceTimersByTimeAsync(100);
  expect(aDeadline).not.toHaveBeenCalled();
  expect(bDeadline).toHaveBeenCalledOnce();
  expect(failures).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
  await expect(b.run(async () => "other-owner-readable")).resolves.toBe(
    "other-owner-readable",
  );
  await b.close();
});

it("keeps the previous Node ref/unref policy and removes both cancelled and completed deadlines", async () => {
  vi.useFakeTimers();
  const timers = vi.spyOn(globalThis, "setTimeout");
  const tasks = new HostScope(vi.fn());
  const called = vi.fn();
  const cancelled = tasks.deadline(100, called, true);
  expect(timers.mock.results.at(-1)?.value.hasRef()).toBe(false);
  tasks.deadline(100, called);
  expect(timers.mock.results.at(-1)?.value.hasRef()).toBe(true);
  cancelled.cancel();
  await vi.advanceTimersByTimeAsync(100);
  expect(called).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
  await tasks.close();
  expect(called).toHaveBeenCalledOnce();
  timers.mockRestore();
});

it("reports a failed scheduled operation once without suppressing other deadlines", async () => {
  vi.useFakeTimers();
  const failure = Error("local defect");
  const failed = vi.fn();
  const succeeded = vi.fn();
  const tasks = new HostScope(failed);
  tasks.deadline(1, async () => {
    throw failure;
  });
  tasks.deadline(1, succeeded);
  await vi.advanceTimersByTimeAsync(1);
  expect(failed).toHaveBeenCalledExactlyOnceWith(failure);
  expect(succeeded).toHaveBeenCalledOnce();
  await tasks.close();
});

it.each(["cancel", "close"])(
  "propagates %s to an already running deadline operation",
  async (action) => {
    vi.useFakeTimers();
    const failures = vi.fn();
    const tasks = new HostScope(failures);
    let signal: AbortSignal | undefined;
    const scheduled = tasks.deadline(10, (value) => {
      signal = value;
      return new Promise<void>((resolve) => {
        value.addEventListener("abort", () => resolve(), { once: true });
      });
    });
    await vi.advanceTimersByTimeAsync(10);
    expect(signal?.aborted).toBe(false);
    if (action === "cancel") scheduled.cancel();
    else await tasks.close();
    await vi.advanceTimersByTimeAsync(0);
    expect(signal?.aborted).toBe(true);
    expect(failures).not.toHaveBeenCalled();
    await tasks.close();
  },
);
