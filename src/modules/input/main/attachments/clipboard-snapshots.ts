import { randomUUID } from "node:crypto";
import type { ClipboardFailure, ClipboardTicket } from "../../contracts/public";

export type ClipboardSnapshot<T> = {
  text: string;
  records: T[];
  digests: Set<string>;
  bytes: number;
  degraded: boolean;
};
type Entry<T> = {
  ticket: ClipboardTicket;
  owner: string;
  threadId: string;
  state: "reserved" | "pending" | "ready";
  snapshot?: ClipboardSnapshot<T>;
  timer: ReturnType<typeof setTimeout>;
  released: Promise<ClipboardFailure>;
  release(reason: ClipboardFailure): void;
  waiters: Map<(reason?: ClipboardFailure) => void, string>;
};
const unavailable = (reason: ClipboardFailure) =>
  ({ kind: "clipboard-unavailable", reason }) as const;
/** Opaque, process-local capabilities. Pins are independent of mutable source drafts. */
export class ClipboardSnapshots<T> {
  private readonly instanceId = randomUUID();
  private readonly entries = new Map<string, Entry<T>>();
  private readonly documents = new Map<string, object>();
  private waiting = 0;
  private closed = false;
  constructor(
    private readonly options: {
      capture(
        threadId: string,
        text: string,
        ids: string[],
      ): ClipboardSnapshot<T>;
      verify(snapshot: ClipboardSnapshot<T>): Promise<void>;
      pin(id: string, digests: Set<string> | null): void;
      limits?: {
        ttlMs: number;
        waitMs: number;
        tickets: number;
        ownerTickets: number;
        bytes: number;
      };
    },
  ) {}
  private get limits() {
    return (
      this.options.limits ?? {
        ttlMs: 120000,
        waitMs: 3000,
        tickets: 32,
        ownerTickets: 8,
        bytes: 128 * 1024 * 1024,
      }
    );
  }
  reserve(owner: string, threadId: string) {
    if (this.closed) return unavailable("invalid");
    if (
      this.entries.size + 2 > this.limits.tickets ||
      [...this.entries.values()].filter((e) => e.owner === owner).length + 2 >
        this.limits.ownerTickets
    )
      return unavailable("busy");
    this.documents.set(owner, this.documents.get(owner) ?? {});
    const tickets: ClipboardTicket[] = [];
    for (let i = 0; i < 2; i++) {
      const ticket = {
        version: 1 as const,
        instanceId: this.instanceId,
        handleId: randomUUID(),
        expiresAt: Date.now() + this.limits.ttlMs,
      };
      const timer = setTimeout(
        () => this.remove(ticket.handleId, "expired"),
        this.limits.ttlMs,
      );
      timer.unref();
      let release!: (reason: ClipboardFailure) => void;
      const released = new Promise<ClipboardFailure>((resolve) => {
        release = resolve;
      });
      this.entries.set(ticket.handleId, {
        ticket,
        owner,
        threadId,
        state: "reserved",
        timer,
        released,
        release,
        waiters: new Map(),
      });
      tickets.push(ticket);
    }
    return { kind: "clipboard-tickets", tickets } as const;
  }
  private entry(ticket: ClipboardTicket): Entry<T> | undefined {
    if (this.closed || ticket.instanceId !== this.instanceId) return undefined;
    const entry = this.entries.get(ticket.handleId);
    if (!entry || ticket.expiresAt !== entry.ticket.expiresAt) return undefined;
    if (Date.now() >= entry.ticket.expiresAt) {
      this.remove(ticket.handleId, "expired");
      return undefined;
    }
    return entry;
  }
  async export(
    owner: string,
    threadId: string,
    ticket: ClipboardTicket,
    text: string,
    ids: string[] = [],
  ) {
    const entry = this.entry(ticket);
    if (
      !entry ||
      entry.owner !== owner ||
      entry.threadId !== threadId ||
      entry.state !== "reserved"
    )
      return unavailable("invalid");
    try {
      const snapshot = this.options.capture(threadId, text, ids);
      if (
        snapshot.records.length > 32 ||
        snapshot.bytes > 64 * 1024 * 1024 ||
        [...this.entries.values()].reduce(
          (sum, item) => sum + (item.snapshot?.bytes ?? 0),
          snapshot.bytes,
        ) > this.limits.bytes
      ) {
        this.remove(ticket.handleId, "busy");
        return unavailable("busy");
      }
      entry.snapshot = snapshot;
      entry.state = "pending";
      this.options.pin(ticket.handleId, snapshot.digests);
      const verification = this.options.verify(snapshot).then(
        () => null,
        () => "failed" as const,
      );
      const failure = await Promise.race([verification, entry.released]);
      if (failure) {
        this.remove(ticket.handleId, failure);
        return unavailable(failure);
      }
      if (this.entry(ticket) !== entry) return unavailable("expired");
      entry.state = "ready";
      for (const finish of [...entry.waiters.keys()]) finish();
      return {
        kind: "clipboard-exported",
        degraded: snapshot.degraded,
      } as const;
    } catch {
      this.remove(ticket.handleId, "failed");
      return unavailable("failed");
    }
  }
  async acquire(
    ticket: ClipboardTicket,
    owner = "local",
  ): Promise<
    | { kind: "snapshot"; snapshot: ClipboardSnapshot<T>; valid: () => boolean }
    | ReturnType<typeof unavailable>
  > {
    const document = this.documents.get(owner) ?? {};
    this.documents.set(owner, document);
    const currentDocument = () =>
      !this.closed && this.documents.get(owner) === document;
    const entry = this.entry(ticket);
    if (!entry)
      return unavailable(
        ticket.instanceId === this.instanceId && Date.now() >= ticket.expiresAt
          ? "expired"
          : "invalid",
      );
    if (entry.state !== "ready") {
      if (entry.waiters.size >= 4 || this.waiting >= 16)
        return unavailable("busy");
      const failure = await new Promise<ClipboardFailure | undefined>(
        (resolve) => {
          this.waiting++;
          const timer = setTimeout(() => finish("expired"), this.limits.waitMs);
          timer.unref();
          const finish = (reason?: ClipboardFailure) => {
            clearTimeout(timer);
            entry.waiters.delete(finish);
            this.waiting--;
            resolve(reason);
          };
          entry.waiters.set(finish, owner);
        },
      );
      if (failure) return unavailable(failure);
    }
    if (!currentDocument() || this.entry(ticket) !== entry || !entry.snapshot)
      return unavailable("expired");
    return {
      kind: "snapshot",
      snapshot: entry.snapshot,
      valid: () => currentDocument() && this.entry(ticket) === entry,
    };
  }
  releaseReserved(
    owner: string,
    threadId: string,
    tickets: ClipboardTicket[],
  ): void {
    for (const ticket of tickets) {
      const entry = this.entry(ticket);
      if (
        entry?.owner === owner &&
        entry.threadId === threadId &&
        entry.state === "reserved"
      )
        this.remove(ticket.handleId, "invalid");
    }
  }
  private remove(id: string, reason: ClipboardFailure): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    this.entries.delete(id);
    entry.release(reason);
    clearTimeout(entry.timer);
    this.options.pin(id, null);
    for (const finish of [...entry.waiters.keys()]) finish(reason);
  }
  releaseOwner(owner: string): void {
    this.documents.delete(owner);
    for (const [id, entry] of this.entries) {
      if (entry.owner === owner) this.remove(id, "invalid");
      else
        for (const [finish, waitingOwner] of entry.waiters)
          if (waitingOwner === owner) finish("invalid");
    }
  }
  close(): void {
    this.closed = true;
    this.documents.clear();
    for (const id of this.entries.keys()) this.remove(id, "invalid");
  }
}
