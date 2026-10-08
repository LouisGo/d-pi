import { expect, it } from "vitest";
import {
  EMPTY_MODEL_PICKER_PREFERENCES,
  modelKey,
  updateModelPickerPreferences,
} from "./public";

it("adds and removes favorites without duplicate keys or losing temporarily absent identities", () => {
  const current = {
    favorites: ["offline", "offline"],
    hidden: ["missing", "missing"],
    order: ["missing", "offline", "offline"],
  };
  const result = updateModelPickerPreferences(current, {
    kind: "favorite",
    key: "selected",
    value: true,
  });
  expect(result).toEqual({
    favorites: ["offline", "selected"],
    hidden: ["missing"],
    order: ["missing", "offline"],
  });
  expect(current.favorites).toEqual(["offline", "offline"]);
  expect(
    updateModelPickerPreferences(result, {
      kind: "favorite",
      key: "selected",
      value: true,
    }).favorites,
  ).toEqual(["offline", "selected"]);
  expect(
    updateModelPickerPreferences(result, {
      kind: "favorite",
      key: "offline",
      value: false,
    }).favorites,
  ).toEqual(["selected"]);
  expect(
    updateModelPickerPreferences(undefined, {
      kind: "favorite",
      key: "first",
      value: true,
    }),
  ).toEqual({ favorites: ["first"], hidden: [], order: [] });
});

it("replaces the complete ordering with unique keys without losing favorites or visibility preferences", () => {
  const current = {
    favorites: ["favorite"],
    hidden: ["hidden"],
    order: ["a", "b", "other-provider", "offline"],
  };
  const keys = ["b", "a", "other-provider", "offline", "a"];
  expect(
    updateModelPickerPreferences(current, { kind: "order", keys }),
  ).toEqual({
    favorites: ["favorite"],
    hidden: ["hidden"],
    order: ["b", "a", "other-provider", "offline"],
  });
  expect(keys).toEqual(["b", "a", "other-provider", "offline", "a"]);
  expect(
    updateModelPickerPreferences(undefined, {
      kind: "order",
      keys: ["b", "a"],
    }),
  ).toEqual({
    favorites: [],
    hidden: [],
    order: ["b", "a"],
  });
  expect(
    updateModelPickerPreferences(current, { kind: "order", keys: [] }),
  ).toEqual({
    favorites: ["favorite"],
    hidden: ["hidden"],
    order: [],
  });
});

it("encodes provider and model without delimiter collisions and keeps empty defaults stable and read-only", () => {
  expect(modelKey("provider/model", "id")).toBe('["provider/model","id"]');
  expect(modelKey("provider", "model/id")).not.toBe(
    modelKey("provider/model", "id"),
  );
  expect(Object.isFrozen(EMPTY_MODEL_PICKER_PREFERENCES)).toBe(true);
  expect(Object.isFrozen(EMPTY_MODEL_PICKER_PREFERENCES.favorites)).toBe(true);
});

it("treats visibility true as visible while retaining favorites and model ordering", () => {
  const current = {
    favorites: ["favorite"],
    hidden: ["hidden"],
    order: ["hidden"],
  };
  const visible = updateModelPickerPreferences(current, {
    kind: "visibility",
    key: "hidden",
    value: true,
  });
  expect(visible).toEqual({
    favorites: ["favorite"],
    hidden: [],
    order: ["hidden"],
  });
  const hidden = updateModelPickerPreferences(visible, {
    kind: "visibility",
    key: "favorite",
    value: false,
  });
  expect(hidden).toEqual({
    favorites: ["favorite"],
    hidden: ["favorite"],
    order: ["hidden"],
  });
  expect(
    updateModelPickerPreferences(hidden, {
      kind: "visibility",
      key: "favorite",
      value: false,
    }),
  ).toEqual(hidden);
});

it("moves before a named model or to the end, retaining absent identities and handling missing/self anchors", () => {
  const current = {
    favorites: ["favorite"],
    hidden: ["hidden"],
    order: ["a", "b", "c", "b"],
  };
  expect(
    updateModelPickerPreferences(current, {
      kind: "move",
      key: "c",
      before: "a",
    }),
  ).toEqual({
    favorites: ["favorite"],
    hidden: ["hidden"],
    order: ["c", "a", "b"],
  });
  expect(
    updateModelPickerPreferences(current, {
      kind: "move",
      key: "a",
      before: null,
    }).order,
  ).toEqual(["b", "c", "a"]);
  expect(
    updateModelPickerPreferences(current, {
      kind: "move",
      key: "offline",
      before: "b",
    }).order,
  ).toEqual(["a", "offline", "b", "c"]);
  expect(
    updateModelPickerPreferences(current, {
      kind: "move",
      key: "a",
      before: "unknown",
    }).order,
  ).toEqual(["b", "c", "a"]);
  expect(
    updateModelPickerPreferences(current, {
      kind: "move",
      key: "b",
      before: "b",
    }).order,
  ).toEqual(["a", "b", "c"]);
  expect(current.order).toEqual(["a", "b", "c", "b"]);
});
