import type { ConfigurationSnapshot } from "../contracts/public";

type Model = ConfigurationSnapshot["models"][number];
export type CatalogFilter = {
  provider?: string;
  query?: string;
  kind?: string;
  availableOnly?: boolean;
  favoritesOnly?: boolean;
  favorites?: readonly string[];
  hidden?: readonly string[];
  order?: readonly string[];
  currentKey?: string | null;
};
export function catalogModelKey(model: Pick<Model, "provider" | "id">): string {
  return JSON.stringify([model.provider, model.id]);
}
export function filterModelCatalog(
  models: readonly Model[],
  filter: CatalogFilter,
): Model[] {
  const terms = (filter.query ?? "")
    .toLocaleLowerCase("en-US")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const hidden = new Set(filter.hidden);
  const favorites = new Set(filter.favorites);
  const order = new Map(filter.order?.map((key, index) => [key, index]));
  return models
    .filter((model) => {
      const key = catalogModelKey(model);
      const kind = model.kind ?? "chat";
      if (filter.kind && filter.kind !== "all" && kind !== filter.kind)
        return false;
      if (filter.provider && model.provider !== filter.provider) return false;
      if (filter.availableOnly && !model.available) return false;
      if (filter.favoritesOnly && !favorites.has(key)) return false;
      if (hidden.has(key) && key !== filter.currentKey) return false;
      const text =
        `${model.provider} ${model.id} ${model.name}`.toLocaleLowerCase(
          "en-US",
        );
      return terms.every((term) => text.includes(term));
    })
    .sort((a, b) => {
      const aKey = catalogModelKey(a),
        bKey = catalogModelKey(b);
      const favoriteRank =
        Number(favorites.has(bKey)) - Number(favorites.has(aKey));
      if (favoriteRank) return favoriteRank;
      return (
        (order.get(aKey) ?? Number.MAX_SAFE_INTEGER) -
        (order.get(bKey) ?? Number.MAX_SAFE_INTEGER)
      );
    });
}
