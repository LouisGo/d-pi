import { expect, it } from "vitest";
import { SidebarPreferencesSchema } from "../contracts/public";
import {
  emptySidebarPreferences,
  reconcileSidebar,
  sidebarItemKey,
  updateSidebar,
} from "./sidebar";

const p = "00000000-0000-4000-8000-000000000001";
const q = "00000000-0000-4000-8000-000000000002";
const a = "00000000-0000-4000-8000-000000000011";
const b = "00000000-0000-4000-8000-000000000012";
const c = "00000000-0000-4000-8000-000000000013";
const catalog = {
  projects: [p, q],
  threads: [
    { threadId: a, workingDirectoryId: p },
    { threadId: b, workingDirectoryId: p },
  ],
};
it("keeps mixed pins flat and remembers a thread's original position after unpin", () => {
  let value = reconcileSidebar(emptySidebarPreferences(), catalog);
  value = updateSidebar(value, {
    kind: "pin",
    item: { kind: "project", id: p },
    value: true,
  });
  value = updateSidebar(value, {
    kind: "pin",
    item: { kind: "thread", id: a },
    value: true,
  });
  value = updateSidebar(value, {
    kind: "pin",
    item: { kind: "thread", id: a },
    value: true,
  });
  expect(value.pins.map(sidebarItemKey)).toEqual([
    `project:${p}`,
    `thread:${a}`,
  ]);
  value = updateSidebar(value, {
    kind: "pin",
    item: { kind: "thread", id: a },
    value: false,
  });
  expect(value.threadOrder[p]).toEqual([a, b]);
});
it("retains manual order across changed discovery order, partial indexing and later arrivals", () => {
  let value = reconcileSidebar(emptySidebarPreferences(), catalog);
  value = updateSidebar(value, {
    kind: "move-thread",
    projectId: p,
    id: b,
    before: a,
  });
  const next = reconcileSidebar(value, {
    projects: [q, p],
    threads: [
      { threadId: c, workingDirectoryId: p },
      ...catalog.threads,
    ].reverse(),
  });
  expect(next.projectOrder).toEqual([p, q]);
  expect(next.threadOrder[p]).toEqual([b, a, c]);
  expect(reconcileSidebar(next, { projects: [], threads: [] })).toEqual(next);
});
it("moves mixed pins and persists independent collapse and five-item expansion preferences", () => {
  let value = reconcileSidebar(emptySidebarPreferences(), catalog);
  for (const item of [
    { kind: "project" as const, id: p },
    { kind: "thread" as const, id: a },
  ])
    value = updateSidebar(value, { kind: "pin", item, value: true });
  value = updateSidebar(value, {
    kind: "move-pin",
    item: { kind: "thread", id: a },
    before: { kind: "project", id: p },
  });
  value = updateSidebar(value, {
    kind: "collapse-project",
    id: p,
    value: true,
  });
  value = updateSidebar(value, { kind: "expand-project", id: p, value: true });
  value = updateSidebar(value, {
    kind: "collapse-section",
    section: "pins",
    value: true,
  });
  expect(value.pins[0]).toEqual({ kind: "thread", id: a });
  expect(value.collapsedProjects).toEqual([p]);
  expect(value.expandedProjects).toEqual([p]);
  expect(value.collapsedSections).toEqual(["pins"]);
  expect(SidebarPreferencesSchema.parse(value)).toEqual(value);
  expect(() =>
    SidebarPreferencesSchema.parse({ ...value, projectOrder: [p, p] }),
  ).toThrow();
});
