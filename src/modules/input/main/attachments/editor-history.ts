import { randomUUID } from "node:crypto";
import type { AttachmentReply } from "../../contracts/public";
import { isDetachedImage } from "../../core/attachments/attachment-kind";
import type { ContentManifest } from "./content-lifecycle";

type Lease = {
  owner: string;
  threadId: string;
  epoch: string;
  version: number;
  digests: Map<string, number>;
  sourceDigests: Map<string, Map<string, number>>;
  ids: Set<string>;
};
export class EditorHistoryLimitError extends Error {
  constructor(readonly attachmentId?: string) {
    super("editor-history-limit");
  }
}
/** Bounded, document-owned transient authority. Only Main manifests grant pins. */
export class EditorHistoryLeases {
  private readonly leases = new Map<string, Lease>();
  constructor(
    private readonly options: {
      manifest: (threadId: string, id: string) => ContentManifest | null;
      objectBytes: (digest: string) => number;
      pin: (id: string, digests: Set<string> | null) => void;
      limits?: { epochs: number; ids: number; bytes: number };
    },
  ) {}
  private get limits() {
    return (
      this.options.limits ?? { epochs: 9, ids: 128, bytes: 256 * 1024 * 1024 }
    );
  }
  open(owner: string, threadId: string, epoch: string): AttachmentReply {
    for (const [leaseId, lease] of this.leases) {
      if (
        lease.owner === owner &&
        lease.threadId === threadId &&
        lease.epoch === epoch
      )
        return { kind: "history-lease", leaseId, version: lease.version };
    }
    if (
      [...this.leases.values()].filter((lease) => lease.owner === owner)
        .length >= this.limits.epochs
    )
      return { kind: "history-limit" };
    const leaseId = randomUUID();
    this.leases.set(leaseId, {
      owner,
      threadId,
      epoch,
      version: 0,
      digests: new Map(),
      sourceDigests: new Map(),
      ids: new Set(),
    });
    return { kind: "history-lease", leaseId, version: 0 };
  }
  update(
    owner: string,
    threadId: string,
    leaseId: string,
    version: number,
    ids: string[],
  ): AttachmentReply {
    const lease = this.leases.get(leaseId);
    if (!lease || lease.owner !== owner || lease.threadId !== threadId)
      return { kind: "unavailable", reason: "reference-denied" };
    if (version <= lease.version)
      return { kind: "history-lease", leaseId, version: lease.version };
    const sourceIds = new Set([...lease.ids, ...ids]);
    const sourceDigests = new Map(lease.sourceDigests);
    for (const id of sourceIds) {
      const manifest = this.options.manifest(threadId, id);
      if (manifest && isDetachedImage(manifest.attachment)) {
        sourceIds.delete(id);
        sourceDigests.delete(id);
      }
    }
    if (sourceIds.size > this.limits.ids) return { kind: "history-limit" };
    for (const id of ids) {
      const manifest = this.options.manifest(threadId, id);
      if (!manifest)
        return { kind: "unavailable", reason: "attachment-not-found" };
      if (isDetachedImage(manifest.attachment)) continue;
      const versions = new Map(sourceDigests.get(id));
      for (const hash of [
        manifest.attachment.inputDigest,
        manifest.derivedDigest,
      ]) {
        if (hash)
          versions.set(
            hash,
            this.options.objectBytes(hash) || manifest.attachment.byteLength,
          );
      }
      sourceDigests.set(id, versions);
    }
    const digests = this.combineDigests(sourceDigests);
    if (!this.withinBudget(owner, new Map([[leaseId, digests]])))
      return { kind: "history-limit" };
    lease.ids = sourceIds;
    lease.digests = digests;
    lease.sourceDigests = sourceDigests;
    lease.version = version;
    // This is synchronous and outside the serialized maintenance lane: it must
    // invalidate an already-running GC while that collector awaits file reads.
    this.options.pin(leaseId, new Set(digests.keys()));
    return { kind: "history-lease", leaseId, version };
  }
  private combineDigests(
    sources: Map<string, Map<string, number>>,
  ): Map<string, number> {
    const digests = new Map<string, number>();
    for (const versions of sources.values())
      for (const [hash, bytes] of versions)
        digests.set(hash, Math.max(digests.get(hash) ?? 0, bytes));
    return digests;
  }
  private withinBudget(
    owner: string,
    changes: Map<string, Map<string, number>>,
  ): boolean {
    const total = new Map<string, number>();
    for (const [id, entry] of this.leases) {
      if (entry.owner !== owner) continue;
      for (const [hash, bytes] of changes.get(id) ?? entry.digests)
        total.set(hash, Math.max(total.get(hash) ?? 0, bytes));
    }
    return (
      [...total.values()].reduce((sum, bytes) => sum + bytes, 0) <=
      this.limits.bytes
    );
  }
  /** Main-only manifest publication. No await may separate publication and pins. */
  publishManifest(manifest: ContentManifest, publish: () => void): boolean {
    const changes = new Map<string, Map<string, number>>();
    const sources = new Map<string, Map<string, Map<string, number>>>();
    const owners = new Set<string>();
    for (const [id, lease] of this.leases) {
      if (
        lease.threadId !== manifest.attachment.threadId ||
        !lease.ids.has(manifest.attachment.id)
      )
        continue;
      const sourceDigests = new Map(lease.sourceDigests);
      const versions = new Map(sourceDigests.get(manifest.attachment.id));
      for (const hash of [
        manifest.attachment.inputDigest,
        manifest.derivedDigest,
      ]) {
        if (hash)
          versions.set(
            hash,
            this.options.objectBytes(hash) || manifest.attachment.byteLength,
          );
      }
      if (isDetachedImage(manifest.attachment))
        sourceDigests.delete(manifest.attachment.id);
      else sourceDigests.set(manifest.attachment.id, versions);
      const digests = this.combineDigests(sourceDigests);
      changes.set(id, digests);
      sources.set(id, sourceDigests);
      owners.add(lease.owner);
    }
    for (const owner of owners)
      if (!this.withinBudget(owner, changes)) return false;
    // Preserve all previous digests: the same ID may refer to earlier undoable
    // representations. A rejected publish mutates neither SQL nor any owner.
    publish();
    for (const [id, digests] of changes) {
      const lease = this.leases.get(id);
      if (!lease) continue;
      lease.digests = digests;
      lease.sourceDigests = sources.get(id) ?? lease.sourceDigests;
      if (isDetachedImage(manifest.attachment))
        lease.ids.delete(manifest.attachment.id);
      this.options.pin(id, new Set(digests.keys()));
    }
    return true;
  }
  dependencyIds(owner: string, threadId: string, leaseId: string): string[] {
    const lease = this.leases.get(leaseId);
    return lease?.owner === owner && lease.threadId === threadId
      ? [...lease.ids]
      : [];
  }
  retains(threadId: string, id: string): boolean {
    return [...this.leases.values()].some(
      (lease) => lease.threadId === threadId && lease.ids.has(id),
    );
  }
  release(owner: string, threadId: string, leaseId: string): AttachmentReply {
    const lease = this.leases.get(leaseId);
    if (lease && (lease.owner !== owner || lease.threadId !== threadId))
      return { kind: "unavailable", reason: "reference-denied" };
    if (lease) {
      this.leases.delete(leaseId);
      this.options.pin(leaseId, null);
    }
    return { kind: "history-released" };
  }
  releaseOwner(owner: string): void {
    for (const [id, lease] of this.leases)
      if (lease.owner === owner) this.release(owner, lease.threadId, id);
  }
  dispose(): void {
    for (const [id, lease] of this.leases)
      this.release(lease.owner, lease.threadId, id);
  }
}
