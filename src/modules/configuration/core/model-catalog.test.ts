import { expect, it } from "vitest";
import type { ConfigurationSnapshot } from "../contracts/public";
import { catalogModelKey, filterModelCatalog } from "./model-catalog";

type Model = ConfigurationSnapshot["models"][number];
const model = (provider: string, id: string, available = true): Model => ({
  provider,
  id,
  name: id === "moon" ? "Moon Reasoner" : id,
  available,
  reason: available ? null : "authentication-required",
  reasoning: true,
  input: ["text"],
  thinking: {
    efforts: ["low", "high"],
    adjustable: true,
    requiresEffort: false,
    defaultEffort: "high",
    defaultLevel: "high",
  },
});
it("keeps favorite provider/model pairs distinct and sorts by device order without changing the native catalog", () => {
  const a = model("one", "shared"),
    b = model("two", "shared"),
    c = model("one", "third");
  const native = [a, c, b];
  expect(
    filterModelCatalog(native, {
      favorites: [catalogModelKey(b)],
      order: [catalogModelKey(c), catalogModelKey(a)],
    }),
  ).toEqual([b, c, a]);
  expect(
    filterModelCatalog(native, {
      favoritesOnly: true,
      favorites: [catalogModelKey(b)],
    }),
  ).toEqual([b]);
  expect(native).toEqual([a, c, b]);
});
it("keeps a hidden current choice reachable within its provider, without crossing a search or favorites filter", () => {
  const current = model("one", "hidden");
  const filter = {
    hidden: [catalogModelKey(current)],
    currentKey: catalogModelKey(current),
  };
  expect(filterModelCatalog([current], filter)).toEqual([current]);
  expect(filterModelCatalog([current], { ...filter, provider: "two" })).toEqual(
    [],
  );
  expect(filterModelCatalog([current], { ...filter, query: "other" })).toEqual(
    [],
  );
  expect(
    filterModelCatalog([current], { ...filter, favoritesOnly: true }),
  ).toEqual([]);
});
it("separates native model kinds and treats legacy summaries as chat, without guessing from model brands", () => {
  const chat = { ...model("one", "ordinary"), kind: "chat" };
  const image = { ...model("one", "gpt-image"), kind: "image" };
  const legacy = model("one", "older");
  expect(filterModelCatalog([image, legacy, chat], { kind: "chat" })).toEqual([
    legacy,
    chat,
  ]);
  expect(filterModelCatalog([image, legacy, chat], { kind: "image" })).toEqual([
    image,
  ]);
});
it("searches provider, native model ID and name together, while respecting availability and hidden preferences", () => {
  const moon = model("native", "moon");
  const unavailable = model("native", "moon-older", false);
  const hidden = model("native", "moon-hidden");
  const other = model("other", "moon");
  expect(
    filterModelCatalog([unavailable, hidden, other, moon], {
      query: "NATIVE moon",
      availableOnly: true,
      hidden: [catalogModelKey(hidden)],
    }),
  ).toEqual([moon]);
});

it("limits session choices to native selectable models while keeping an unavailable current identity visible", () => {
  const current = model("offline", "current", false);
  const eligible = model("ready", "eligible");
  const excluded = { ...model("ready", "excluded"), sessionSelectable: false };
  const missing = model("other", "needs-key", false);
  expect(
    filterModelCatalog([current, eligible, excluded, missing], {
      availableOnly: true,
      sessionSelectableOnly: true,
      currentKey: catalogModelKey(current),
    }),
  ).toEqual([current, eligible]);
});
