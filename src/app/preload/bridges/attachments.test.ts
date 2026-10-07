import { expect, it } from "vitest";
import { ThreadIdSchema } from "../../../shared/identity";
import { createAttachmentBridge } from "./attachments";

it("rejects unknown clipboard fields and foreign imported asset replies at the actual preload boundary", async () => {
  const threadId = ThreadIdSchema.parse(crypto.randomUUID()),
    id = crypto.randomUUID();
  const ticket = {
    version: 1 as const,
    instanceId: crypto.randomUUID(),
    handleId: crypto.randomUUID(),
    expiresAt: Date.now() + 10000,
  };
  const command = {
    kind: "clipboard-import" as const,
    threadId,
    traceId: crypto.randomUUID(),
    ticket,
  };
  const bridge = createAttachmentBridge({
    invoke: async () => ({
      kind: "clipboard-imported",
      text: "selected",
      degraded: false,
      items: [
        {
          schemaVersion: 1,
          id,
          threadId: crypto.randomUUID(),
          token: `[[dpi-attachment:${id}]]`,
          name: "private.png",
          mimeType: "image/png",
          byteLength: 1,
          capturedAt: new Date().toISOString(),
          source: "paste",
          status: "ready",
          representation: "image",
          coverageGaps: [],
          textOnly: false,
        },
      ],
    }),
  }).attachments;
  await expect(bridge.request(command)).rejects.toThrow(
    "Foreign attachment reply",
  );
  const forged = { ...command, ticket: { ...ticket, path: "/secret" } };
  await expect(bridge.request(forged)).rejects.toThrow();
});
