import { expect, it } from "vitest";
import { emptySidebarPreferences } from "../../modules/preferences/core/public";
import { CommandSchema, parseDesktopReply } from "./desktop-bridge";

it("bounds and validates sidebar commands and correlates acknowledgements to the initiating trace", () => {
  const traceId = crypto.randomUUID();
  const command = CommandSchema.parse({
    kind: "sidebar-change",
    traceId,
    change: {
      kind: "pin",
      item: { kind: "project", id: crypto.randomUUID() },
      value: true,
    },
  });
  const reply = {
    kind: "sidebar",
    traceId,
    snapshot: { revision: 3, value: emptySidebarPreferences() },
  };
  expect(parseDesktopReply(command, reply)).toEqual(reply);
  expect(() =>
    parseDesktopReply(command, { ...reply, traceId: crypto.randomUUID() }),
  ).toThrow();
  expect(() =>
    parseDesktopReply(command, {
      ...reply,
      snapshot: { ...reply.snapshot, revision: -1 },
    }),
  ).toThrow();
  expect(() =>
    CommandSchema.parse({
      ...command,
      change: {
        kind: "pin",
        item: { kind: "project", id: "directory-string" },
        value: true,
      },
    }),
  ).toThrow();
});
