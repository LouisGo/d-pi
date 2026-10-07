import { expect, it } from "vitest";
import { solveGeometry } from "./geometry";

const constraints = {
  rail: 52,
  separator: 1,
  sidebarMin: 220,
  sidebarMax: 420,
  conversationMin: 480,
  workspaceMin: 320,
  workspaceMax: 800,
  bottomMin: 140,
  conversationMinHeight: 480,
};
const intent = {
  sidebar: { open: true, size: 280 },
  workspace: { open: true, size: 416 },
  bottom: { open: true, size: 220 },
};
it("protects conversation space at 720x540 and restores automatic hidden panels without losing intent", () => {
  const small = solveGeometry(
    { width: 720, height: 540 },
    intent,
    constraints,
    { workspace: true, bottom: true },
  );
  expect(small.sidebar.visible).toBe(false);
  expect(small.workspace.visible).toBe(false);
  expect(small.bottom.visible).toBe(false);
  expect(small.bottom.temporary).toBe(true);
  const large = solveGeometry(
    { width: 1440, height: 900 },
    intent,
    constraints,
    { workspace: true, bottom: true },
  );
  expect(large.sidebar.visible).toBe(true);
  expect(large.workspace.size).toBe(416);
  expect(large.sidebar.size).toBe(280);
});
it("hides left before right and never displays empty production hosts", () => {
  const mid = solveGeometry({ width: 1000, height: 700 }, intent, constraints, {
    workspace: true,
    bottom: true,
  });
  expect(mid.sidebar.visible).toBe(false);
  expect(mid.workspace.visible).toBe(true);
  const empty = solveGeometry(
    { width: 1600, height: 900 },
    intent,
    constraints,
    { workspace: false, bottom: false },
  );
  expect(empty.workspace.visible).toBe(false);
  expect(empty.bottom.visible).toBe(false);
});
it("does not reopen a manually closed panel and clamps an oversized preference only in the projection", () => {
  const manual = {
    ...intent,
    sidebar: { open: false, size: 300 },
    workspace: { open: true, size: 790 },
  };
  const result = solveGeometry(
    { width: 1000, height: 480 },
    manual,
    constraints,
    { workspace: true, bottom: true },
  );
  expect(result.sidebar.visible).toBe(false);
  expect(result.workspace.size).toBeLessThanOrEqual(467);
  expect(result.bottom.visible).toBe(false);
  expect(manual.workspace.size).toBe(790);
});
