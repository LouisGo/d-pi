import { afterEach, expect, it, vi } from "vitest";
import { QuitCoordinator } from "./quit";

afterEach(() => vi.useRealTimers());
it("coalesces Quit and completes graceful shutdown once", async () => {
  const shutdown = vi.fn(async () => {}),
    finish = vi.fn();
  const quit = new QuitCoordinator(shutdown, finish);
  quit.request();
  quit.request();
  await Promise.resolve();
  await Promise.resolve();
  expect(shutdown).toHaveBeenCalledOnce();
  await vi.waitFor(() =>
    expect(finish).toHaveBeenCalledExactlyOnceWith("clean"),
  );
});
it("honors Quit at the deadline even when saving or native cleanup never resolves", async () => {
  vi.useFakeTimers();
  let resolve: (() => void) | undefined;
  const shutdown = vi.fn(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    ),
    finish = vi.fn();
  const quit = new QuitCoordinator(shutdown, finish);
  quit.request();
  await vi.advanceTimersByTimeAsync(7999);
  expect(finish).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(finish).toHaveBeenCalledExactlyOnceWith("timeout");
  resolve?.();
  await Promise.resolve();
  await Promise.resolve();
  expect(finish).toHaveBeenCalledOnce();
});
it("cleanup failure does not reopen the app or cancel a requested quit", async () => {
  const finish = vi.fn();
  const quit = new QuitCoordinator(async () => {
    throw Error("unconfirmed");
  }, finish);
  quit.request();
  await vi.waitFor(() =>
    expect(finish).toHaveBeenCalledExactlyOnceWith("failed"),
  );
});
