import { type KeyboardEvent, type Ref, useRef, useState } from "react";
import { useI18n } from "../../preferences/renderer/public";
import {
  Button,
  CheckIcon,
  ModelBrandIcon,
  ProviderBrandIcon,
  SearchIcon,
  StarIcon,
  TextInput,
} from "../../ui/renderer/public";
import type { ConfigurationSnapshot } from "../contracts/public";
import { catalogModelKey, filterModelCatalog } from "../core/public";

type Model = ConfigurationSnapshot["models"][number];
type PickerPreferences = {
  favorites: readonly string[];
  hidden: readonly string[];
  order: readonly string[];
};
export function ModelMetadata({ model }: { model: Model }) {
  const { t } = useI18n();
  const compact = (value: number) =>
    value >= 1000 ? `${Math.round(value / 1000)}k` : String(value);
  return (
    <span className="model-metadata">
      {model.contextWindow != null && (
        <span>
          {t("models.context", { value: compact(model.contextWindow) })}
        </span>
      )}
      {model.reasoning && <span>{t("models.reasoning")}</span>}
      {model.input.includes("image") && <span>{t("models.vision")}</span>}
      {model.pricingStatus && model.pricingStatus !== "fixed" && (
        <span>{t(`models.pricing.${model.pricingStatus}`)}</span>
      )}
    </span>
  );
}

export function ModelPickerPanel({
  models,
  currentKey,
  preferences,
  disabled = false,
  loading = false,
  failed = false,
  onSelect,
  onPreference,
  onManage,
  onRetry,
  searchRef,
}: {
  models: readonly Model[];
  currentKey: string | null;
  preferences: PickerPreferences;
  disabled?: boolean;
  loading?: boolean;
  failed?: boolean;
  onSelect: (model: Model) => void;
  onPreference: (change: {
    kind: "favorite";
    key: string;
    value: boolean;
  }) => void;
  onManage: () => void;
  onRetry?: () => void;
  searchRef?: Ref<HTMLInputElement>;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [provider, setProvider] = useState<string | null>(null);
  const [limit, setLimit] = useState(100);
  const list = useRef<HTMLDivElement>(null);
  const chatModels = filterModelCatalog(models, {
    ...preferences,
    kind: "chat",
    availableOnly: true,
    sessionSelectableOnly: true,
    currentKey,
  });
  const providers = [...new Set(chatModels.map((m) => m.provider))].sort(
    (a, b) => a.localeCompare(b),
  );
  const visible = filterModelCatalog(models, {
    ...preferences,
    query,
    ...(provider && provider !== "favorites" ? { provider } : {}),
    favoritesOnly: provider === "favorites",
    kind: "chat",
    availableOnly: true,
    sessionSelectableOnly: true,
    currentKey,
  });
  const navigate = (event: KeyboardEvent<HTMLElement>) => {
    if (
      event.currentTarget.tagName === "INPUT" &&
      !["ArrowDown", "ArrowUp"].includes(event.key)
    )
      return;
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const buttons = [
      ...(list.current?.querySelectorAll<HTMLButtonElement>(
        "[data-model-id]:not(:disabled)",
      ) ?? []),
    ];
    if (!buttons.length) return;
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? buttons.length - 1
          : event.key === "ArrowDown"
            ? Math.min(index + 1, buttons.length - 1)
            : Math.max(index - 1, 0);
    event.preventDefault();
    buttons[next]?.focus();
  };
  const changeProvider = (value: string | null) => {
    setProvider(value);
    setLimit(100);
  };
  return (
    <div className="model-picker">
      <div className="model-picker-body">
        <nav className="model-picker-rail" aria-label={t("providers.title")}>
          <Button
            variant="ghost"
            size="icon"
            title={t("providers.all")}
            aria-label={t("providers.all")}
            aria-pressed={provider === null}
            onClick={() => changeProvider(null)}
          >
            <SearchIcon size={20} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title={t("providers.favorites")}
            aria-label={t("providers.favorites")}
            aria-pressed={provider === "favorites"}
            onClick={() => changeProvider("favorites")}
          >
            <StarIcon size={20} />
          </Button>
          <div className="model-picker-rail-separator" />
          {providers.map((id) => (
            <Button
              key={id}
              variant="ghost"
              size="icon"
              title={id}
              aria-label={id}
              aria-pressed={provider === id}
              onClick={() => changeProvider(id)}
            >
              <ProviderBrandIcon provider={id} size={24} />
            </Button>
          ))}
        </nav>
        <div className="model-picker-main">
          <div className="model-picker-search">
            <SearchIcon size={18} />
            <TextInput
              ref={searchRef}
              aria-label={t("models.search")}
              placeholder={t("models.search")}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setLimit(100);
              }}
              onKeyDown={navigate}
            />
          </div>
          <div className="model-picker-list" ref={list} onKeyDown={navigate}>
            {loading && (
              <p className="model-picker-empty" role="status">
                {t("config.loading")}
              </p>
            )}
            {failed && (
              <div className="model-picker-empty">
                <p className="failure" role="alert">
                  {t("config.failed")}
                </p>
                {onRetry && (
                  <Button
                    variant="secondary"
                    disabled={loading}
                    onClick={onRetry}
                  >
                    {t("app.retry")}
                  </Button>
                )}
              </div>
            )}
            {!loading && !failed && !visible.length && (
              <p className="model-picker-empty">
                {t(
                  provider === "favorites"
                    ? "models.noFavorites"
                    : !chatModels.length
                      ? "models.noAvailable"
                      : "models.noResults",
                )}
              </p>
            )}
            {visible.slice(0, limit).map((model) => {
              const key = catalogModelKey(model),
                favorite = preferences.favorites.includes(key),
                current = key === currentKey;
              return (
                <div
                  className="model-picker-row"
                  key={key}
                  data-current={current || undefined}
                >
                  <Button
                    variant="navigation"
                    className="model-picker-choice"
                    data-model-id={model.id}
                    aria-current={current ? "true" : undefined}
                    disabled={
                      disabled ||
                      !model.available ||
                      model.sessionSelectable === false
                    }
                    onClick={() => onSelect(model)}
                  >
                    <ModelBrandIcon
                      provider={model.provider}
                      modelId={model.id}
                      size={24}
                    />
                    <span className="model-picker-copy">
                      <span className="model-picker-name">{model.name}</span>
                      <span className="model-picker-provider">
                        <ProviderBrandIcon provider={model.provider} />
                        {model.provider}
                      </span>
                      <ModelMetadata model={model} />
                      {!model.available && model.reason && (
                        <span className="model-picker-reason">
                          {t(`model.reason.${model.reason}`)}
                        </span>
                      )}
                      {model.available && model.sessionSelectable === false && (
                        <span className="model-picker-reason">
                          {t("models.nativeExcluded")}
                        </span>
                      )}
                      {current && preferences.hidden.includes(key) && (
                        <span className="model-picker-reason">
                          {t("models.hiddenCurrent")}
                        </span>
                      )}
                    </span>
                    {current && <CheckIcon size={16} />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="model-picker-favorite"
                    aria-label={t(
                      favorite ? "models.unfavorite" : "models.favorite",
                      { name: model.name },
                    )}
                    aria-pressed={favorite}
                    onClick={() =>
                      onPreference({ kind: "favorite", key, value: !favorite })
                    }
                  >
                    <StarIcon size={16} />
                  </Button>
                </div>
              );
            })}
            {limit < visible.length && (
              <Button variant="ghost" onClick={() => setLimit((n) => n + 100)}>
                {t("models.more")}
              </Button>
            )}
          </div>
        </div>
      </div>
      <div className="model-picker-footer">
        <span>
          {t(disabled ? "models.busy" : "models.count", {
            count: visible.length,
          })}
        </span>
        <Button variant="ghost" onClick={onManage}>
          {t("models.manage")}
        </Button>
      </div>
    </div>
  );
}
