import { afterEach, expect, it, vi } from "vitest";
import { QuitCoordinator } from "./quit";

afterEach(() => vi.useRealTimers());
it("stop-and-quit requests stop once and retains the app until queued/background work is safe", async () => {
  vi.useFakeTimers();
  let active = true;
  const stop = vi.fn(async () => {}),
    finish = vi.fn();
  const quit = new QuitCoordinator(() => active, stop, finish);
  quit.request("stop");
  await vi.advanceTimersByTimeAsync(1000);
  expect(stop).toHaveBeenCalledTimes(1);
  expect(finish).not.toHaveBeenCalled();
  active = false;
  await vi.advanceTimersByTimeAsync(250);
  expect(finish).toHaveBeenCalledTimes(1);
  quit.dispose();
});
it("cancelled waiting cannot quit later and waiting does not send a stop", async () => {
  vi.useFakeTimers();
  let active = true;
  const stop = vi.fn(async () => {}),
    finish = vi.fn();
  const quit = new QuitCoordinator(() => active, stop, finish);
  quit.request("wait");
  quit.request("cancel");
  active = false;
  await vi.advanceTimersByTimeAsync(500);
  expect(stop).not.toHaveBeenCalled();
  expect(finish).not.toHaveBeenCalled();
});
