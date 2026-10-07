import type { IpcRenderer } from "electron";
import { expect, it, vi } from "vitest";
import { createProjectReadBridge } from "./project-reads";

it("accepts correlated read envelopes and rejects another operation's completed reply", async () => {
  const invoke = vi.fn();
  const bridge = createProjectReadBridge({ invoke } as unknown as IpcRenderer);
  if (!bridge.files) throw Error("Missing file bridge");
  const command = {
    kind: "read" as const,
    path: "a.ts",
    threadId: crypto.randomUUID(),
    operationId: crypto.randomUUID(),
    traceId: crypto.randomUUID(),
  };
  const response = {
    kind: "completed",
    operationId: command.operationId,
    traceId: command.traceId,
    reply: { kind: "unavailable", reason: "missing" },
  };
  invoke.mockResolvedValueOnce(response);
  await expect(bridge.files.request(command)).resolves.toEqual(response);
  invoke.mockResolvedValueOnce({
    ...response,
    operationId: crypto.randomUUID(),
  });
  await expect(bridge.files.request(command)).rejects.toMatchObject({
    code: "invalid-reply",
  });
});
