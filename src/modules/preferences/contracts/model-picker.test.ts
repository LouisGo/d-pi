import { expect, it } from "vitest";
import {
  ModelPickerPreferenceChangeSchema,
  ModelPickerPreferencesSchema,
  PreferencesSchema,
} from "./public";

it("keeps legacy snapshots valid while rejecting unbounded or malformed picker preferences", () => {
  const legacy = { theme: "light", density: "normal", locale: "system" };
  expect(PreferencesSchema.parse(legacy)).toEqual(legacy);
  const preferences = {
    favorites: ["unknown-but-retained"],
    hidden: [],
    order: [],
  };
  expect(ModelPickerPreferencesSchema.parse(preferences)).toEqual(preferences);
  expect(
    ModelPickerPreferencesSchema.safeParse({ ...preferences, favorites: [""] })
      .success,
  ).toBe(false);
  expect(
    ModelPickerPreferencesSchema.safeParse({
      ...preferences,
      favorites: ["x".repeat(2049)],
    }).success,
  ).toBe(false);
  expect(
    ModelPickerPreferencesSchema.safeParse({
      ...preferences,
      favorites: Array.from({ length: 10_001 }, (_, index) => `key-${index}`),
    }).success,
  ).toBe(false);
  expect(
    ModelPickerPreferencesSchema.safeParse({ ...preferences, unexpected: true })
      .success,
  ).toBe(false);
  expect(
    ModelPickerPreferencesSchema.safeParse({ ...preferences, order: [null] })
      .success,
  ).toBe(false);
});

it("accepts only bounded, explicit preference intentions", () => {
  expect(
    ModelPickerPreferenceChangeSchema.safeParse({
      kind: "order",
      keys: ["a", "b"],
    }).success,
  ).toBe(true);
  expect(
    ModelPickerPreferenceChangeSchema.safeParse({
      kind: "order",
      keys: Array.from({ length: 10_001 }, (_, index) => `key-${index}`),
    }).success,
  ).toBe(false);
  expect(
    ModelPickerPreferenceChangeSchema.safeParse({
      kind: "visibility",
      key: "model",
      value: true,
    }).success,
  ).toBe(true);
  expect(
    ModelPickerPreferenceChangeSchema.safeParse({
      kind: "move",
      key: "model",
      before: null,
    }).success,
  ).toBe(true);
  expect(
    ModelPickerPreferenceChangeSchema.safeParse({
      kind: "favorite",
      key: "model",
      before: null,
    }).success,
  ).toBe(false);
  expect(
    ModelPickerPreferenceChangeSchema.safeParse({
      kind: "move",
      key: "model",
      before: "",
    }).success,
  ).toBe(false);
  expect(
    ModelPickerPreferenceChangeSchema.safeParse({
      kind: "favorite",
      key: "x".repeat(2049),
      value: true,
    }).success,
  ).toBe(false);
});
