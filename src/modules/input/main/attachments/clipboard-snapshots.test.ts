import { expect, it, vi } from "vitest";
import { ClipboardSnapshots } from "./clipboard-snapshots";

it("atomically admits asynchronously expanded bytes and releases a rejected final snapshot", async () => {
  const pins = new Map<string, Set<string>>();
  const manager = new ClipboardSnapshots({
    capture: (_thread, text) => ({
      text,
      records: [text],
      bytes: 1,
      digests: new Set<string>(),
      degraded: false,
    }),
    verify: async (snapshot, commit) => {
      commit({ ...snapshot, bytes: 20, digests: new Set([snapshot.text]) });
    },
    pin: (id, value) => {
      if (value) pins.set(id, value);
      else pins.delete(id);
    },
    limits: {
      ttlMs: 1000,
      waitMs: 100,
      tickets: 8,
      ownerTickets: 4,
      bytes: 30,
    },
  });
  try {
    const first = manager.reserve("source", "thread"),
      second = manager.reserve("other", "thread");
    if (
      first.kind !== "clipboard-tickets" ||
      second.kind !== "clipboard-tickets" ||
      !first.tickets[0] ||
      !second.tickets[0]
    )
      throw Error("tickets");
    expect(
      await manager.export("source", "thread", first.tickets[0], "one"),
    ).toMatchObject({ kind: "clipboard-exported" });
    expect(
      await manager.export("other", "thread", second.tickets[0], "two"),
    ).toMatchObject({ reason: "busy" });
    expect([...pins.values()].map((value) => [...value])).toEqual([["one"]]);
    expect(await manager.acquire(second.tickets[0])).toMatchObject({
      reason: "invalid",
    });
  } finally {
    manager.close();
  }
});

it.each(["TTL", "document"])(
  "does not resurrect a frozen snapshot or its derived pins after %s release",
  async (kind) => {
    vi.useFakeTimers();
    let finish!: () => void;
    const pins = new Map<string, Set<string>>();
    const manager = new ClipboardSnapshots({
      capture: (_thread, text) => ({
        text,
        records: [text],
        bytes: 1,
        digests: new Set(["original"]),
        degraded: false,
      }),
      verify: async (snapshot, commit) => {
        await new Promise<void>((resolve) => {
          finish = resolve;
        });
        commit({
          ...snapshot,
          bytes: 2,
          digests: new Set(["original", "derived"]),
        });
      },
      pin: (id, value) => {
        if (value) pins.set(id, value);
        else pins.delete(id);
      },
      limits: { ttlMs: 20, waitMs: 10, tickets: 4, ownerTickets: 2, bytes: 30 },
    });
    try {
      const reserved = manager.reserve("source", "thread");
      if (reserved.kind !== "clipboard-tickets" || !reserved.tickets[0])
        throw Error("tickets");
      const pending = manager.export(
        "source",
        "thread",
        reserved.tickets[0],
        "one",
      );
      if (kind === "TTL") await vi.advanceTimersByTimeAsync(21);
      else manager.releaseOwner("source");
      expect(await pending).toMatchObject({
        reason: kind === "TTL" ? "expired" : "invalid",
      });
      finish();
      await Promise.resolve();
      await Promise.resolve();
      expect(pins.size).toBe(0);
      expect(await manager.acquire(reserved.tickets[0])).toMatchObject({
        kind: "clipboard-unavailable",
      });
    } finally {
      manager.close();
      vi.useRealTimers();
    }
  },
);

it("bounds reserved/pending tickets, waiters and bytes, expires pending exports and releases all waits/pins on close", async () => {
  vi.useFakeTimers();
  let finish!: () => void;
  const pins = new Map<string, Set<string>>();
  const manager = new ClipboardSnapshots({
    capture: (_thread, text) => ({
      text,
      records: [text],
      digests: new Set([text]),
      bytes: 6,
      degraded: false,
    }),
    verify: () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    pin: (id, value) => {
      if (value) pins.set(id, value);
      else pins.delete(id);
    },
    limits: { ttlMs: 100, waitMs: 50, tickets: 4, ownerTickets: 2, bytes: 10 },
  });
  try {
    const reserve = manager.reserve("owner", "thread");
    if (reserve.kind !== "clipboard-tickets" || !reserve.tickets[0])
      throw Error("no ticket");
    const ticket = reserve.tickets[0];
    expect(manager.reserve("owner", "thread")).toMatchObject({
      reason: "busy",
    });
    const exporting = manager.export("owner", "thread", ticket, "digest");
    expect(pins.size).toBe(1);
    const other = manager.reserve("other", "thread");
    if (other.kind !== "clipboard-tickets" || !other.tickets[0])
      throw Error("no other ticket");
    expect(manager.reserve("third", "thread")).toMatchObject({
      reason: "busy",
    });
    expect(
      await manager.export("other", "thread", other.tickets[0], "second"),
    ).toMatchObject({ reason: "busy" });
    expect(pins.size).toBe(1);
    const waits = Array.from({ length: 4 }, () => manager.acquire(ticket));
    expect(await manager.acquire(ticket)).toMatchObject({ reason: "busy" });
    await vi.advanceTimersByTimeAsync(51);
    expect(await Promise.all(waits)).toEqual(
      Array.from({ length: 4 }, () => ({
        kind: "clipboard-unavailable",
        reason: "expired",
      })),
    );
    const waiting = manager.acquire(ticket);
    await vi.advanceTimersByTimeAsync(50);
    expect(await waiting).toMatchObject({ reason: "expired" });
    expect(pins.size).toBe(0);
    finish();
    expect(await exporting).toMatchObject({ reason: "expired" });
    const next = manager.reserve("owner", "thread");
    if (next.kind !== "clipboard-tickets" || !next.tickets[0])
      throw Error("no next");
    const closing = manager.acquire(next.tickets[0]);
    manager.close();
    expect(await closing).toMatchObject({ reason: "invalid" });
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    manager.close();
    vi.useRealTimers();
  }
});

it("releases a target document while it waits for another document's pending copy", async () => {
  const manager = new ClipboardSnapshots({
    capture: (_thread, text) => ({
      text,
      records: [],
      digests: new Set<string>(),
      bytes: text.length,
      degraded: false,
    }),
    verify: async () => {},
    pin: () => {},
  });
  try {
    const reserved = manager.reserve("source", "thread");
    if (reserved.kind !== "clipboard-tickets" || !reserved.tickets[0])
      throw Error("no ticket");
    const pending = manager.acquire(reserved.tickets[0], "target");
    manager.releaseOwner("target");
    expect(await pending).toMatchObject({
      kind: "clipboard-unavailable",
      reason: "invalid",
    });
    expect(
      await manager.export("source", "thread", reserved.tickets[0], "source"),
    ).toMatchObject({ kind: "clipboard-exported" });
  } finally {
    manager.close();
  }
});

it("ends a pending export immediately when its document closes even if verification has not returned", async () => {
  const pins = new Map<string, Set<string>>();
  const manager = new ClipboardSnapshots({
    capture: (_thread, text) => ({
      text,
      records: [],
      digests: new Set(["hash"]),
      bytes: 1,
      degraded: false,
    }),
    verify: () => new Promise<void>(() => {}),
    pin: (id, value) => {
      if (value) pins.set(id, value);
      else pins.delete(id);
    },
  });
  const reserved = manager.reserve("source", "thread");
  if (reserved.kind !== "clipboard-tickets" || !reserved.tickets[0])
    throw Error("no ticket");
  const pending = manager.export(
    "source",
    "thread",
    reserved.tickets[0],
    "copy",
  );
  manager.releaseOwner("source");
  try {
    expect(await pending).toMatchObject({ reason: "invalid" });
    expect(pins.size).toBe(0);
  } finally {
    manager.close();
  }
}, 1000);
