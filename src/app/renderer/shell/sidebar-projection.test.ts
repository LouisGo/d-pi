import { expect, it } from "vitest";
import {
  emptySidebarPreferences,
  reconcileSidebar,
  updateSidebar,
} from "../../../modules/preferences/core/public";
import {
  ProjectContextSchema,
  ThreadContextSchema,
} from "../../../modules/threads/contracts/public";
import { projectSidebar } from "./sidebar-projection";

const p = "00000000-0000-4000-8000-000000000001";
const q = "00000000-0000-4000-8000-000000000002";
const rows = [11, 12, 13].map((i) =>
  ThreadContextSchema.parse({
    threadId: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    workingDirectoryId: p,
    directory: "/one/project",
    title: `Thread ${i}`,
  }),
);
const projects = [
  ProjectContextSchema.parse({
    workingDirectoryId: p,
    directory: "/one/project",
  }),
  ProjectContextSchema.parse({
    workingDirectoryId: q,
    directory: "/two/project",
  }),
];
it("renders pins once and unpin restores the original project and manual order without hiding same-name/empty projects", () => {
  const a = rows[0],
    b = rows[1],
    c = rows[2];
  if (!a || !b || !c) throw Error("fixture");
  let value = reconcileSidebar(emptySidebarPreferences(), {
    projects: [p, q],
    threads: rows,
  });
  value = updateSidebar(value, {
    kind: "move-thread",
    projectId: p,
    id: c.threadId,
    before: a.threadId,
  });
  value = updateSidebar(value, {
    kind: "pin",
    item: { kind: "project", id: p },
    value: true,
  });
  value = updateSidebar(value, {
    kind: "pin",
    item: { kind: "thread", id: a.threadId },
    value: true,
  });
  let result = projectSidebar(projects, rows, value);
  expect(result.pins.map((e) => e.item.kind)).toEqual(["project", "thread"]);
  const group = result.pins[0];
  expect(group?.kind).toBe("project");
  if (group?.kind !== "project") throw Error("fixture");
  expect(group.group.threads.map((t) => t.threadId)).toEqual([
    c.threadId,
    b.threadId,
  ]);
  expect(result.projects).toHaveLength(1);
  expect(result.projects[0]?.label).toBe("project");
  value = updateSidebar(value, {
    kind: "pin",
    item: { kind: "thread", id: a.threadId },
    value: false,
  });
  result = projectSidebar(projects, [...rows].reverse(), value);
  const restored = result.pins[0];
  if (restored?.kind !== "project") throw Error("fixture");
  expect(restored.group.threads.map((t) => t.threadId)).toEqual([
    c.threadId,
    a.threadId,
    b.threadId,
  ]);
});
