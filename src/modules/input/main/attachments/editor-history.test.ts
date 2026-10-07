import { expect, it } from "vitest";
import { AttachmentSchema } from "../../contracts/public";
import { EditorHistoryLeases } from "./editor-history";

it("enforces distinct-object byte and cumulative source budgets without releasing the previously protected epoch", () => {
  const threadId = crypto.randomUUID(),
    first = crypto.randomUUID(),
    second = crypto.randomUUID();
  const make = (id: string, hash: string) => ({
    attachment: AttachmentSchema.parse({
      schemaVersion: 1,
      id,
      threadId,
      token: `[[dpi-attachment:${id}]]`,
      name: "source",
      mimeType: "text/plain",
      byteLength: 6,
      capturedAt: new Date().toISOString(),
      source: "paste",
      status: "ready",
      representation: "text",
      coverageGaps: [],
      textOnly: false,
      inputDigest: hash,
    }),
  });
  const manifests: Map<string, ReturnType<typeof make>> = new Map([
    [first, make(first, "a".repeat(64))],
    [second, make(second, "b".repeat(64))],
  ]);
  const pins = new Map<string, Set<string>>();
  const leases = new EditorHistoryLeases({
    manifest: (_thread, id) => manifests.get(id) ?? null,
    objectBytes: () => 6,
    pin: (id, hashes) => {
      if (hashes) pins.set(id, hashes);
      else pins.delete(id);
    },
    limits: { epochs: 2, ids: 2, bytes: 10 },
  });
  const opened = leases.open("window", threadId, crypto.randomUUID());
  if (opened.kind !== "history-lease") throw Error("not opened");
  expect(
    leases.update("window", threadId, opened.leaseId, 1, [first]),
  ).toMatchObject({ kind: "history-lease", version: 1 });
  expect(
    leases.update("window", threadId, opened.leaseId, 2, [second]),
  ).toEqual({ kind: "history-limit" });
  expect(pins.get(opened.leaseId)).toEqual(new Set(["a".repeat(64)]));
  expect(
    leases.update("window", threadId, opened.leaseId, 3, [
      first,
      second,
      crypto.randomUUID(),
    ]),
  ).toEqual({ kind: "history-limit" });
  leases.releaseOwner("window");
  expect(pins.size).toBe(0);
});
