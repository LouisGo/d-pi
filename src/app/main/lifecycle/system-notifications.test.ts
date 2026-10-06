import { EventEmitter } from "node:events";
import { expect, it, vi } from "vitest";

const native = vi.hoisted(() => ({
  instance: undefined as
    | undefined
    | {
        emit: (event: string) => boolean;
        listenerCount: (event: string) => number;
        close: ReturnType<typeof vi.fn>;
        show: ReturnType<typeof vi.fn>;
      },
  supported: vi.fn(() => true),
}));
vi.mock("electron", () => ({
  Notification: class extends EventEmitter {
    static isSupported = native.supported;
    close = vi.fn();
    show = vi.fn();
    constructor() {
      super();
      native.instance = this;
    }
  },
}));

import { ElectronSystemNotifications } from "./system-notifications";

it("releases native listeners after failure and keeps explicit callback; disposal is idempotent", () => {
  const adapter = new ElectronSystemNotifications();
  expect(adapter.supported()).toBe(true);
  const failed = vi.fn(),
    click = vi.fn(),
    closed = vi.fn();
  const release = adapter.show(
    { title: "d-pi", body: "Thread abcd" },
    { failed, click, closed },
  );
  native.instance?.emit("failed");
  expect(failed).toHaveBeenCalledTimes(1);
  expect(native.instance?.listenerCount("click")).toBe(0);
  release();
  release();
  expect(native.instance?.close).toHaveBeenCalledTimes(1);
});
it("native close releases without claiming a question was handled; click is explicit", () => {
  const click = vi.fn(),
    closed = vi.fn();
  const release = new ElectronSystemNotifications().show(
    { title: "d-pi", body: "Thread abcd" },
    { failed: vi.fn(), click, closed },
  );
  native.instance?.emit("click");
  expect(click).toHaveBeenCalledTimes(1);
  native.instance?.emit("close");
  expect(closed).toHaveBeenCalledTimes(1);
  expect(native.instance?.listenerCount("failed")).toBe(0);
  release();
  expect(native.instance?.close).toHaveBeenCalledTimes(1);
});
it("resource release remains idempotent even when native close fails", () => {
  const release = new ElectronSystemNotifications().show(
    { title: "d-pi", body: "Thread abcd" },
    { failed: vi.fn(), click: vi.fn(), closed: vi.fn() },
  );
  native.instance?.close.mockImplementation(() => {
    throw Error("closed transport");
  });
  expect(() => release()).not.toThrow();
  expect(() => release()).not.toThrow();
  expect(native.instance?.listenerCount("click")).toBe(0);
});
