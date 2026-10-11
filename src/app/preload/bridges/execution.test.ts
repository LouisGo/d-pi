import type { IpcRenderer } from "electron";
import { expect, it, vi } from "vitest";
import { ThreadIdSchema } from "../../../shared/identity";
import { createExecutionBridge } from "./execution";

it("keeps the answer history request trace and rejects a reply for another Thread, including empty history", async () => {
  const threadId = ThreadIdSchema.parse(crypto.randomUUID());
  const request = { threadId, traceId: crypto.randomUUID(), cursor: null };
  const page = { threadId, source: "app-observed", entries: [], cursor: null };
  const invoke = vi.fn().mockResolvedValue(page);
  const bridge = createExecutionBridge({
    invoke,
  } as unknown as IpcRenderer).answerHistory;
  expect(await bridge!.request(request)).toEqual(page);
  expect(invoke).toHaveBeenCalledWith("runtime:answer-history", request);
  invoke.mockResolvedValue({ ...page, threadId: crypto.randomUUID() });
  await expect(bridge!.request(request)).rejects.toThrow(
    "Foreign answer history reply",
  );
});
