// @vitest-environment happy-dom
import { expect, it, vi } from "vitest";
import { AttachmentImports } from "./attachment-imports";

it("keeps all multi-file failures in its Thread-owned projection and retries only the explicit item", async () => {
  const prepare = vi
    .fn()
    .mockRejectedValueOnce(Error("transport disconnected"))
    .mockResolvedValue([]);
  const model = new AttachmentImports(prepare);
  const one = new File(["first"], "first.txt", { type: "text/plain" });
  const two = new File(["second"], "second.txt", { type: "text/plain" });
  model.importFiles([one, two], "drop");
  expect(model.stateStore.getState().pending).toBe(2);
  await vi.waitFor(() => expect(model.stateStore.getState().pending).toBe(0));
  expect(prepare).toHaveBeenCalledTimes(2);
  expect(
    model.stateStore.getState().failures.map((item) => item.file.name),
  ).toEqual(["first.txt"]);
  const failure = model.stateStore.getState().failures[0];
  if (!failure) throw Error("missing failure");
  model.retry(failure.id);
  await vi.waitFor(() => expect(model.stateStore.getState().pending).toBe(0));
  expect(prepare).toHaveBeenCalledTimes(3);
  expect(model.stateStore.getState().failures).toEqual([]);
  expect(prepare.mock.calls[0]?.[0]).toMatchObject({
    name: "first.txt",
    dataBase64: "Zmlyc3Q=",
    source: "drop",
  });
});
it("finishes private imports after detaching a view without delivering a late insert to another Thread", async () => {
  let finish: (items: []) => void = () => {};
  const model = new AttachmentImports(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const oldView = vi.fn();
  const otherView = vi.fn();
  const detach = model.subscribeCompleted(oldView);
  const other = new AttachmentImports(async () => []);
  other.subscribeCompleted(otherView);
  model.importFiles([new File(["body"], "source.txt")], "paste");
  await vi.waitFor(() => expect(model.stateStore.getState().pending).toBe(1));
  detach();
  await new Promise((resolve) => setTimeout(resolve, 10));
  finish([]);
  await vi.waitFor(() => expect(model.stateStore.getState().pending).toBe(0));
  expect(oldView).not.toHaveBeenCalled();
  expect(otherView).not.toHaveBeenCalled();
  expect(model.stateStore.getState().completion).toBe(1);
});
it("retains oversized source handles for explicit removal and never reads or transports them", async () => {
  const prepare = vi.fn();
  const model = new AttachmentImports(prepare);
  const source = new File(["contents"], "large.png");
  Object.defineProperty(source, "size", { value: 25 * 1024 * 1024 + 1 });
  model.importFiles([source], "drop");
  expect(model.stateStore.getState().pending).toBe(0);
  expect(model.stateStore.getState().failures[0]).toMatchObject({
    file: source,
    reason: "source-too-large",
  });
  expect(prepare).not.toHaveBeenCalled();
});
