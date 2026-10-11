import { expect, it, vi } from "vitest";
import {
  type ActivityMember,
  ActivityReadModel,
  reportedChangeCount,
} from "./activity";
import { decodeToolSemantic } from "./tool-semantic";

const member = (
  key: string,
  parent?: string,
  state: ActivityMember["state"] = "complete",
): ActivityMember => ({
  key,
  state,
  ...(parent ? { relation: { kind: "native-call-batch", id: parent } } : {}),
});
it("groups only proven associations and retains each failure in an incremental summary", () => {
  const model = new ActivityReadModel();
  model.reconcile([
    member("a", "parent"),
    member("b", "parent", "failed"),
    member("unknown"),
  ]);
  const initial = model.stateStore.getState();
  expect(initial.rows.map((row) => row.kind)).toEqual(["group", "member"]);
  const group = initial.rows[0];
  if (group?.kind !== "group") throw Error("Missing group");
  expect(initial.groups.get(group.id)).toMatchObject({
    count: 2,
    failed: 1,
    running: 0,
  });
  const rowsChanged = vi.fn();
  model.stateStore.subscribe((state) => state.rows, rowsChanged);
  model.update(member("a", "parent", "streaming"));
  expect(model.stateStore.getState().groups.get(group.id)).toMatchObject({
    failed: 1,
    running: 1,
  });
  expect(rowsChanged).not.toHaveBeenCalled();
  expect(initial.groups.get(group.id)).toMatchObject({ running: 0 });
  model.setExpanded(group.id, true);
  expect(model.stateStore.getState().rows.slice(1, 3)).toEqual([
    { kind: "member", key: "a" },
    { kind: "member", key: "b" },
  ]);
});
it("keeps the visible group through prepend merge, preserves expanded state and aliases", () => {
  const model = new ActivityReadModel();
  model.reconcile([
    member("a", "left"),
    member("b", "left"),
    member("c", "right"),
    member("d", "right"),
  ]);
  const groups = model.stateStore
    .getState()
    .rows.filter((row) => row.kind === "group");
  const left = groups[0],
    right = groups[1];
  if (!left || !right) throw Error("Missing groups");
  model.setExpanded(right.id, true);
  model.setReadingAnchor("c", right.id);
  model.reconcile([
    member("prepended", "joined"),
    ...["a", "b", "c", "d"].map((key) => member(key, "joined")),
  ]);
  expect(model.stateStore.getState().rows[0]).toEqual(right);
  expect(model.resolveGroup(left.id)).toBe(right.id);
  expect(model.stateStore.getState().groups.get(right.id)?.expanded).toBe(true);
  model.reconcile([
    member("a", "other"),
    member("b", "other"),
    member("c", "split"),
    member("d", "split"),
  ]);
  expect(model.groupFor("c")).toBe(right.id);
});
it("defers structural regrouping while a member owns selection or focus, but updates its status", () => {
  const model = new ActivityReadModel();
  model.reconcile([
    member("a", "left"),
    member("b", "left"),
    member("c", "right"),
    member("d", "right"),
  ]);
  const rows = model.stateStore.getState().rows;
  model.setProtected(new Set(["b"]));
  model.reconcile([
    member("a", "joined"),
    member("b", "joined", "failed"),
    member("c", "joined"),
    member("d", "joined"),
  ]);
  expect(model.stateStore.getState().rows).toBe(rows);
  expect(
    model.stateStore.getState().groups.get(model.groupFor("b") ?? -1)?.failed,
  ).toBe(1);
  model.update(member("a", "joined", "streaming"));
  model.setProtected(new Set());
  expect(model.stateStore.getState().rows).toHaveLength(1);
  expect(
    model.stateStore.getState().groups.get(model.groupFor("b") ?? -1)?.failed,
  ).toBe(1);
  expect(
    model.stateStore.getState().groups.get(model.groupFor("a") ?? -1)?.running,
  ).toBe(1);
});
it("keeps protected groups stable while publishing unrelated appended and prepended rows", () => {
  const model = new ActivityReadModel();
  model.reconcile([
    member("a", "left"),
    member("b", "left"),
    member("c", "right"),
    member("d", "right"),
  ]);
  const group = model.groupFor("b");
  model.setProtected(new Set(["b"]));
  model.reconcile([
    member("before"),
    ...["a", "b", "c", "d"].map((key) => member(key, "joined")),
    member("new-reply"),
    member("new-tool", "next"),
    member("other-tool", "next"),
  ]);
  expect(model.groupFor("b")).toBe(group);
  expect(
    model.stateStore
      .getState()
      .rows.map((row) => (row.kind === "member" ? row.key : "group")),
  ).toEqual(["before", "group", "group", "new-reply", "group"]);
  model.setProtected(new Set());
  expect(model.stateStore.getState().rows.map((row) => row.kind)).toEqual([
    "member",
    "group",
    "member",
    "group",
  ]);
});
it("counts only successful native result paths, never intent, progress or failed results", () => {
  const intent = decodeToolSemantic(
    "write",
    { path: "/a" },
    undefined,
    "intent",
  );
  expect(reportedChangeCount(intent)).toBe(0);
  const result = decodeToolSemantic(
    "write",
    { path: "/a" },
    { details: { path: "/a", diff: "patch" } },
    "result",
  );
  expect(reportedChangeCount(result)).toBe(1);
  expect(reportedChangeCount({ ...result, phase: "progress" })).toBe(0);
  const failed = decodeToolSemantic(
    "write",
    { path: "/a" },
    { details: { path: "/a", diff: "patch" } },
    "result",
    true,
  );
  expect(reportedChangeCount(failed)).toBe(0);
});
