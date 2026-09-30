import { expect, it, vi } from "vitest";
import type { NativeFrame } from "../../../platform/omp/protocol/public";
import { createConversationHost } from "./scope";

function message(text: string): NativeFrame {
  return {
    type: "message_end",
    message: { role: "assistant", content: text },
  };
}

it("retains the projection independently of port attachment", () => {
  const scope = createConversationHost();
  const first = { start: vi.fn(), close: vi.fn(), postMessage: vi.fn() };
  const second = { start: vi.fn(), close: vi.fn(), postMessage: vi.fn() };
  const connectionGeneration = crypto.randomUUID();

  scope.start(connectionGeneration);
  scope.attach(first);
  scope.accept(message("retained output"));
  scope.attach(second);

  expect(first.close).toHaveBeenCalledOnce();
  expect(second.start).toHaveBeenCalledOnce();
  expect(second.postMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: "snapshot",
      connectionGeneration,
      items: [expect.objectContaining({ text: "retained output" })],
    }),
  );

  scope.dispose();
  expect(second.close).toHaveBeenCalledOnce();
});
