import { expect, it } from "vitest";
import { movedBefore } from "./sidebar-sortable";

it("computes the insertion anchor for both directions and preserves hidden children after the five visible rows", () => {
  expect(movedBefore(["a", "b", "c"], "a", "b")).toBe("c");
  expect(movedBefore(["a", "b", "c"], "c", "a")).toBe("a");
  expect(movedBefore(["a", "b", "c"], "a", "c", "hidden")).toBe("hidden");
  expect(movedBefore(["a", "b"], "a", "missing")).toBeUndefined();
  expect(movedBefore(["a", "b"], "a", "a")).toBeUndefined();
});
