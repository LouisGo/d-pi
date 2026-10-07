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

it("refreshes same-ID digests for every owning epoch on Main publication without changing client versions, and rejects budget overflow atomically", () => {
  const threadId = crypto.randomUUID(),
    id = crypto.randomUUID();
  const input = "a".repeat(64),
    derived = "b".repeat(64),
    replacement = "c".repeat(64);
  let manifest = {
    attachment: AttachmentSchema.parse({
      schemaVersion: 1,
      id,
      threadId,
      token: `[[dpi-attachment:${id}]]`,
      name: "retry.pdf",
      mimeType: "application/pdf",
      byteLength: 4,
      capturedAt: new Date().toISOString(),
      source: "paste",
      status: "ready",
      representation: "pdf-text",
      coverageGaps: [],
      textOnly: false,
      inputDigest: input,
    }),
    derivedDigest: undefined as string | undefined,
  };
  const pins = new Map<string, Set<string>>();
  const leases = new EditorHistoryLeases({
    manifest: () => manifest,
    objectBytes: () => 4,
    pin: (id, digests) => {
      if (digests) pins.set(id, digests);
      else pins.delete(id);
    },
    limits: { epochs: 3, ids: 2, bytes: 8 },
  });
  const open = (owner: string) => {
    const lease = leases.open(owner, threadId, crypto.randomUUID());
    if (lease.kind !== "history-lease") throw Error("not opened");
    expect(
      leases.update(owner, threadId, lease.leaseId, 1, [id]),
    ).toMatchObject({ kind: "history-lease", version: 1 });
    return lease.leaseId;
  };
  const first = open("one"),
    cached = open("one"),
    second = open("two");
  const updated = { ...manifest, derivedDigest: derived };
  expect(
    leases.publishManifest(updated, () => {
      manifest = updated;
    }),
  ).toBe(true);
  for (const lease of [first, cached, second])
    expect(pins.get(lease)).toEqual(new Set([input, derived]));
  // Publication must not consume Renderer sequence numbers or replace old pins.
  expect(leases.update("one", threadId, first, 2, [id])).toMatchObject({
    kind: "history-lease",
    version: 2,
  });
  let published = false;
  expect(
    leases.publishManifest({ ...updated, derivedDigest: replacement }, () => {
      published = true;
    }),
  ).toBe(false);
  expect(published).toBe(false);
  expect(
    leases.publishManifest(
      {
        ...updated,
        attachment: { ...updated.attachment, inputDigest: replacement },
      },
      () => {
        published = true;
      },
    ),
  ).toBe(false);
  expect(published).toBe(false);
  expect(manifest.derivedDigest).toBe(derived);
  for (const lease of [first, cached, second])
    expect(pins.get(lease)).toEqual(new Set([input, derived]));
  leases.releaseOwner("one");
  leases.releaseOwner("two");
  const released = { ...updated, derivedDigest: replacement };
  expect(
    leases.publishManifest(released, () => {
      manifest = released;
    }),
  ).toBe(true);
  expect(pins.size).toBe(0);
});
