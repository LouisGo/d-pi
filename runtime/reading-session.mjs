import { createHash } from "node:crypto";
import { setImmediate as yieldTurn } from "node:timers/promises";

const PAGE_BYTES = 1024 * 1024 - 16384;
const RECORD_BYTES = 32 * 1024 * 1024;

/** Reading annotations belong to the App wrapper, never to native messages. */
export function createReadingSession(session, { coldResume = true } = {}) {
  let snapshotOpen = coldResume;
  let events = Promise.resolve();
  const subscribe = (listener) => {
    let closed = false;
    const unsubscribe = session.subscribe((event) => {
      const sessionId = session.sessionManager.getSessionId();
      const sessionFile = session.sessionManager.getSessionFile();
      events = events
        .catch(() => {})
        .then(async () => {
          if (closed) return;
          let display = event;
          if (event.type === "message_end") {
            // The SDK queues synchronous append work in a promise tail before
            // emitting. Yield the turn, then certify the actual object identity;
            // time/order/text alone never certify a native record.
            await yieldTurn();
            if (closed) return;
            display = {
              ...event,
              message: { ...event.message, dPiIdentityUnknown: true },
            };
            if (
              sessionId === session.sessionManager.getSessionId() &&
              sessionFile === session.sessionManager.getSessionFile()
            ) {
              const entry = session.sessionManager
                .getBranch()
                .find(
                  (entry) =>
                    entry.type === "message" && entry.message === event.message,
                );
              if (entry && typeof entry.id === "string")
                display = {
                  ...event,
                  message: { ...event.message, dPiRecordId: entry.id },
                };
            }
          }
          listener(display);
        });
      return events;
    });
    return () => {
      closed = true;
      unsubscribe();
    };
  };
  const proxy = new Proxy(session, {
    get(target, property) {
      if (property === "subscribe") return subscribe;
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return {
    session: proxy,
    flushEvents: () => events,
    closeSnapshot: () => {
      snapshotOpen = false;
    },
    page(command) {
      if (!snapshotOpen) throw Error("reading-phase-closed");
      if (
        session.isStreaming ||
        session.isCompacting ||
        session.hasPendingAsyncWork?.() ||
        session.hasAdmittedSubmission ||
        session.queuedMessageCount > 0 ||
        session.getAsyncJobSnapshot?.()?.running.length > 0
      )
        throw Error("reading-session-busy");
      const entries = session.sessionManager
        .getBranch()
        .filter((entry) => entry.type === "message");
      const source = createHash("sha256")
        .update(
          JSON.stringify([
            session.sessionManager.getSessionId(),
            session.sessionManager.getSessionFile(),
            session.sessionManager.getLeafId(),
            entries.map((entry) => entry.id),
          ]),
        )
        .digest("hex");
      let offset = 0;
      if (command.cursor !== undefined) {
        if (typeof command.cursor !== "string" || command.cursor.length > 4096)
          throw Error("reading-page-invalid");
        let cursor;
        try {
          cursor = JSON.parse(
            Buffer.from(command.cursor, "base64url").toString("utf8"),
          );
        } catch {
          throw Error("reading-page-invalid");
        }
        if (!cursor || cursor.source !== source)
          throw Error("reading-source-changed");
        if (
          !Number.isSafeInteger(cursor.offset) ||
          cursor.offset < 0 ||
          cursor.offset > entries.length
        )
          throw Error("reading-page-invalid");
        offset = cursor.offset;
      }
      const limit = command.limit ?? 100;
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
        throw Error("reading-page-invalid");
      const messages = [];
      let bytes = 0;
      while (offset < entries.length && messages.length < limit) {
        const entry = entries[offset];
        const message = {
          ...entry.message,
          dPiRecordId: entry.id,
          dPiRestored: true,
        };
        const size = Buffer.byteLength(JSON.stringify(message));
        if (size > RECORD_BYTES) throw Error("reading-record-too-large");
        if (messages.length && bytes + size > PAGE_BYTES) break;
        messages.push(message);
        bytes += size;
        offset++;
      }
      if (offset === entries.length) snapshotOpen = false;
      return {
        messages,
        totalMessages: entries.length,
        ...(offset < entries.length
          ? {
              nextCursor: Buffer.from(
                JSON.stringify({ source, offset }),
              ).toString("base64url"),
            }
          : {}),
      };
    },
  };
}
