import type { ConfigurationSnapshot } from "../contracts/public";

type Model = ConfigurationSnapshot["models"][number];
type Provider = NonNullable<ConfigurationSnapshot["providers"]>[number];
export function orderProviderCatalog(
  providers: readonly Provider[],
): Provider[] {
  const rank = (provider: Provider) =>
    provider.disabled
      ? 2
      : provider.authState === "configured" || provider.authState === "keyless"
        ? 0
        : 1;
  return providers.toSorted((a, b) => rank(a) - rank(b));
}
export type CatalogFilter = {
  provider?: string;
  query?: string;
  kind?: string;
  availableOnly?: boolean;
  sessionSelectableOnly?: boolean;
  favoritesOnly?: boolean;
  favorites?: readonly string[];
  hidden?: readonly string[];
  order?: readonly string[];
  currentKey?: string | null;
};
export function catalogModelKey(model: Pick<Model, "provider" | "id">): string {
  return JSON.stringify([model.provider, model.id]);
}
// OMP exposes revisions and recommendation priority, not release dates.
// Compare versions within each provider; never compare unrelated vendors'
// version numbers as if they were timestamps. Preserve unclassified entries.
function compareModelRecency(a: Model, b: Model): number {
  const newlyReleased = Number(b.isNew === true) - Number(a.isNew === true);
  if (newlyReleased) return newlyReleased;
  // Renderer-only refreshes may still receive the previous summary format.
  // Use the displayed version as a fallback, never synthesize a release date.
  const revisionOf = (model: Model) =>
    model.catalogRevision ??
    model.name
      .match(/(?:^|[^\d])(\d{1,3}(?:[.-]\d{1,3})*)(?!\d)/u)?.[1]
      ?.replaceAll("-", ".");
  const aRevision = revisionOf(a);
  const bRevision = revisionOf(b);
  if (aRevision && bRevision) {
    const revision = bRevision.localeCompare(aRevision, "en", {
      numeric: true,
    });
    if (revision) return revision;
  } else if (aRevision || bRevision) {
    return aRevision ? -1 : 1;
  }
  // Dated snapshots of the same family/version use their advertised ID date.
  if (a.catalogFamily && a.catalogFamily === b.catalogFamily) {
    const aDate = a.id.match(/(?:^|[-_.])((?:19|20)\d{6})(?:$|[-_.:])/u)?.[1];
    const bDate = b.id.match(/(?:^|[-_.])((?:19|20)\d{6})(?:$|[-_.:])/u)?.[1];
    if (aDate && bDate && aDate !== bDate) return bDate.localeCompare(aDate);
  }
  return (
    (a.catalogPriority ?? Number.MAX_SAFE_INTEGER) -
    (b.catalogPriority ?? Number.MAX_SAFE_INTEGER)
  );
}

export function orderModelCatalog(
  models: readonly Model[],
  deviceOrder: readonly string[] = [],
): Model[] {
  const positions = new Map(deviceOrder.map((key, index) => [key, index]));
  const providers = new Map(
    [...new Set(models.map((model) => model.provider))].map(
      (provider, index) => [provider, index],
    ),
  );
  return models.toSorted((a, b) => {
    const manualRank =
      (positions.get(catalogModelKey(a)) ?? Number.MAX_SAFE_INTEGER) -
      (positions.get(catalogModelKey(b)) ?? Number.MAX_SAFE_INTEGER);
    if (manualRank) return manualRank;
    const providerRank =
      (providers.get(a.provider) ?? 0) - (providers.get(b.provider) ?? 0);
    return providerRank || compareModelRecency(a, b);
  });
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
  return orderModelCatalog(
    models.filter((model) => {
      const key = catalogModelKey(model);
      const kind = model.kind ?? "chat";
      if (filter.kind && filter.kind !== "all" && kind !== filter.kind)
        return false;
      if (filter.provider && model.provider !== filter.provider) return false;
      if (filter.availableOnly && !model.available && key !== filter.currentKey)
        return false;
      if (
        filter.sessionSelectableOnly &&
        model.sessionSelectable === false &&
        key !== filter.currentKey
      )
        return false;
      if (filter.favoritesOnly && !favorites.has(key)) return false;
      if (hidden.has(key) && key !== filter.currentKey) return false;
      const text =
        `${model.provider} ${model.id} ${model.name}`.toLocaleLowerCase(
          "en-US",
        );
      return terms.every((term) => text.includes(term));
    }),
    filter.order,
  );
}
