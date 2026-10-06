import { expect, it, vi } from "vitest";
import { createDiagnosticBridge } from "./diagnostics";

const command = {
  kind: "query" as const,
  traceId: crypto.randomUUID(),
  filter: {
    since: "2026-10-01T00:00:00.000Z",
    until: "2026-10-07T00:00:00.000Z",
    limit: 100,
  },
};
it("rejects foreign trace, wrong reply kind, and foreign query scope", async () => {
  const invoke = vi.fn();
  const { diagnostics } = createDiagnosticBridge({ invoke });
  invoke.mockResolvedValueOnce({
    kind: "cancelled",
    traceId: crypto.randomUUID(),
  });
  await expect(
    diagnostics.request({ ...command, kind: "export" }),
  ).rejects.toMatchObject({ code: "invalid-reply", traceId: command.traceId });
  invoke.mockResolvedValueOnce({
    kind: "exported",
    traceId: command.traceId,
    fileName: "diagnostics.json",
  });
  await expect(diagnostics.request(command)).rejects.toMatchObject({
    code: "invalid-reply",
  });
  invoke.mockResolvedValueOnce({
    kind: "snapshot",
    traceId: command.traceId,
    snapshot: {
      sampledAt: command.filter.until,
      filter: { ...command.filter, limit: 1 },
      records: [],
      coverage: {
        files: 0,
        bytes: 0,
        lines: 0,
        malformed: 0,
        redacted: 0,
        unreadable: 0,
        truncated: false,
      },
      writer: { degraded: false, dropped: 0 },
    },
  });
  await expect(diagnostics.request(command)).rejects.toMatchObject({
    code: "invalid-reply",
  });
});
