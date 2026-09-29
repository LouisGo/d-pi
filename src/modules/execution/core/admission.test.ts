import { expect, it } from "vitest";
import { DraftSchema } from "../../input/contracts/public";
import type { RuntimeGrant } from "../../workspace/contracts/public";
import { RuntimeAdmission } from "./admission";

it("browse never starts; an explicit grant starts only the same physical directory", async () => {
  const draft = DraftSchema.parse({
    schemaVersion: 1,
    threadId: crypto.randomUUID(),
    workspaceId: crypto.randomUUID(),
    directory: "/project",
    revision: 0,
    text: "draft",
  });
  let grant: RuntimeGrant | null = null;
  let inode = "10";
  let starts = 0;
  const admission = new RuntimeAdmission(
    {
      threadContext: () => draft,
      executionGrant: () => grant,
      grantExecution: (value) => {
        grant = value;
      },
      revokeExecution: () => {
        grant = null;
      },
    },
    async () => ({ directory: draft.directory, device: "1", inode }),
    async () => {
      starts++;
    },
  );
  expect(await admission.start(draft.threadId)).toEqual({
    kind: "denied",
    reason: "browse",
  });
  expect(starts).toBe(0);
  expect(await admission.allow(draft.threadId)).toEqual({ kind: "allowed" });
  expect(starts).toBe(0);
  expect(await admission.start(draft.threadId)).toEqual({ kind: "started" });
  inode = "11";
  expect(await admission.start(draft.threadId)).toEqual({
    kind: "denied",
    reason: "directory-changed",
  });
  expect(starts).toBe(1);
});
