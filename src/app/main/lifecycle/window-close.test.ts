import { afterEach, expect, it, vi } from "vitest";
import { WindowCloseGuard } from "./window-close";

afterEach(() => vi.useRealTimers());
function fixture() {
  const send = vi.fn(),
    approve = vi.fn();
  let dismiss: (() => void) | undefined;
  const blocked = vi.fn(
    () =>
      new Promise<void>((done) => {
        dismiss = done;
      }),
  );
  const guard = new WindowCloseGuard({ send, approve, blocked });
  return { guard, send, approve, blocked, dismiss: () => dismiss?.() };
}
it("closes a window which has never received an editable restore without a false save warning", () => {
  const f = fixture();
  f.guard.request();
  expect(f.approve).toHaveBeenCalledOnce();
  expect(f.send).not.toHaveBeenCalled();
  expect(f.blocked).not.toHaveBeenCalled();
});
it("requires matching save confirmation after initialization and honors an unsaved close after warning", async () => {
  const f = fixture();
  f.guard.markEditable();
  f.guard.request();
  const token = f.send.mock.calls[0]?.[0];
  f.guard.resolve("stale", true);
  expect(f.approve).not.toHaveBeenCalled();
  f.guard.resolve(token, false);
  expect(f.blocked).toHaveBeenCalledWith("unsaved");
  expect(f.approve).toHaveBeenCalledOnce();
  f.guard.dispose();
});
it("coalesces close requests during timeout recovery and ignores late save results", async () => {
  vi.useFakeTimers();
  const f = fixture();
  f.guard.markEditable();
  f.guard.request();
  const token = f.send.mock.calls[0]?.[0];
  f.guard.request();
  await vi.advanceTimersByTimeAsync(5000);
  expect(f.blocked).toHaveBeenCalledExactlyOnceWith("unconfirmed");
  f.guard.request();
  await vi.advanceTimersByTimeAsync(10000);
  expect(f.send).toHaveBeenCalledOnce();
  expect(f.blocked).toHaveBeenCalledOnce();
  expect(f.approve).toHaveBeenCalledOnce();
  f.guard.resolve(token, true);
  expect(f.approve).toHaveBeenCalledOnce();
  f.guard.dispose();
});
it("disposes the window's pending timer and does not let an old window approve a new one", async () => {
  vi.useFakeTimers();
  const f = fixture();
  f.guard.markEditable();
  f.guard.request();
  f.guard.dispose();
  await vi.advanceTimersByTimeAsync(5000);
  f.guard.resolve(f.send.mock.calls[0]?.[0], true);
  expect(f.blocked).not.toHaveBeenCalled();
  expect(f.approve).not.toHaveBeenCalled();
});
