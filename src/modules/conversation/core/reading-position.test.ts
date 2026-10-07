import { expect, it } from "vitest";
import {
  captureReadingAnchor,
  ReadingPositions,
  readingSourceKey,
  resolveReadingAnchor,
} from "./reading-position";

const source = readingSourceKey({
  kind: "live",
  threadId: "a",
  generation: "one",
});
it("keeps the same row offset through resize and streaming while following only the previous end", () => {
  const anchor = captureReadingAnchor(
    { scrollTop: 230, clientHeight: 200, scrollHeight: 1000 },
    { id: "row", top: 200, height: 150 },
  );
  expect(anchor).toMatchObject({
    rowId: "row",
    offsetWithinRow: 30,
    atEnd: false,
  });
  expect(
    resolveReadingAnchor(
      anchor,
      { clientHeight: 180, scrollHeight: 1500 },
      { id: "row", top: 350, height: 160 },
    ),
  ).toBe(380);
  const end = captureReadingAnchor(
    { scrollTop: 800, clientHeight: 200, scrollHeight: 1000 },
    { id: "last", top: 750, height: 250 },
  );
  expect(
    resolveReadingAnchor(
      end,
      { clientHeight: 180, scrollHeight: 1500 },
      { id: "last", top: 750, height: 750 },
    ),
  ).toBe(1320);
});

it("uses a bounded fallback when a row disappears and clamps offsets after a shrink", () => {
  const anchor = captureReadingAnchor(
    { scrollTop: 260, clientHeight: 200, scrollHeight: 1000 },
    { id: "row", top: 200, height: 150 },
  );
  expect(
    resolveReadingAnchor(
      anchor,
      { clientHeight: 200, scrollHeight: 400 },
      null,
    ),
  ).toBe(200);
  expect(
    resolveReadingAnchor(
      anchor,
      { clientHeight: 200, scrollHeight: 700 },
      { id: "row", top: 200, height: 20 },
    ),
  ).toBe(219);
});

it("isolates generations, native sessions/source versions and pages while retaining A to B to A", () => {
  const positions = new ReadingPositions();
  const anchor = captureReadingAnchor(
    { scrollTop: 230, clientHeight: 200, scrollHeight: 1000 },
    { id: "row", top: 200, height: 150 },
  );
  positions.remember(source, anchor);
  expect(
    positions.get(
      readingSourceKey({ kind: "live", threadId: "a", generation: "two" }),
    ),
  ).toBeUndefined();
  const native = {
    kind: "native" as const,
    threadId: "a",
    sessionKey: "session",
    source: "version",
    pageOffset: 0,
  };
  positions.remember(readingSourceKey(native), anchor);
  expect(
    positions.get(readingSourceKey({ ...native, pageOffset: 100 })),
  ).toBeUndefined();
  expect(
    positions.get(readingSourceKey({ ...native, source: "changed" })),
  ).toBeUndefined();
  expect(
    positions.get(readingSourceKey({ ...native, sessionKey: "other" })),
  ).toBeUndefined();
  expect(positions.get(source)).toEqual(anchor);
});

it("bounds source/body positions and releases them when the Thread is disposed", () => {
  const positions = new ReadingPositions();
  const anchor = captureReadingAnchor(
    { scrollTop: 30, clientHeight: 200, scrollHeight: 1000 },
    null,
  );
  for (let i = 0; i < 40; i++) positions.remember(`${i}`, anchor);
  expect(positions.stateStore.getState().anchors.size).toBe(32);
  expect(positions.get("0")).toBeUndefined();
  for (let i = 0; i < 140; i++)
    positions.rememberBody(`${i}`, { page: i, scrollTop: i });
  expect(positions.stateStore.getState().bodies.size).toBe(128);
  expect(positions.body("139")).toEqual({ page: 139, scrollTop: 139 });
  const oversized = "x".repeat(4097);
  positions.remember(oversized, anchor);
  positions.rememberBody(oversized, { page: 0, scrollTop: 0 });
  expect(positions.get(oversized)).toBeUndefined();
  expect(positions.body(oversized)).toBeUndefined();
  positions.dispose();
  positions.remember("late", anchor);
  positions.rememberBody("late", { page: 0, scrollTop: 0 });
  expect(positions.stateStore.getState().anchors.size).toBe(0);
  expect(positions.stateStore.getState().bodies.size).toBe(0);
});
