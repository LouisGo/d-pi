import { useMemo, useRef, useState } from "react";
import type {
  ModelPickerPreferenceChange,
  ModelPickerPreferences,
} from "../../../preferences/contracts/public";
import { useI18n } from "../../../preferences/renderer/public";
import {
  Button,
  ChevronDownIcon,
  ChevronUpIcon,
  ModelBrandIcon,
  SearchIcon,
  Select,
  StarIcon,
  Switch,
  TextInput,
} from "../../../ui/renderer/public";
import type {
  ConfigurationScope,
  ConfigurationSnapshot,
} from "../../contracts/public";
import { orderModelCatalog } from "../../core/public";
import { CustomModelForm } from "./custom-model-form";
import { SettingsModelMetadata } from "./model-metadata";
import type { useConfigurationWrite } from "./use-configuration-write";

type Model = ConfigurationSnapshot["models"][number];
export type SettingsModelPickerPreferences = {
  readonly [K in keyof ModelPickerPreferences]: readonly string[];
};
export type ModelPreferencesProps = {
  modelPicker?: SettingsModelPickerPreferences | undefined;
  onModelPreference?:
    | ((change: ModelPickerPreferenceChange) => Promise<void>)
    | undefined;
};
const keyOf = (model: Model) => JSON.stringify([model.provider, model.id]);
const kindKeys = {
  chat: "models.kind.chat",
  tiny: "models.kind.tiny",
  image: "models.kind.image",
  tts: "models.kind.tts",
  stt: "models.kind.stt",
  search: "models.kind.search",
  judge: "models.kind.judge",
  embedding: "models.kind.embedding",
  rerank: "models.kind.rerank",
  video: "models.kind.video",
} as const;

export function ProviderModels({
  provider,
  snapshot,
  scope,
  disabled,
  write,
  modelPicker,
  onModelPreference,
}: ModelPreferencesProps & {
  provider: string;
  snapshot: ConfigurationSnapshot;
  scope: ConfigurationScope;
  disabled: boolean;
  write: ReturnType<typeof useConfigurationWrite>;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("");
  const [limit, setLimit] = useState(100);
  const [editor, setEditor] = useState<{ model?: Model } | null>(null);
  const [deleting, setDeleting] = useState<{
    id: string;
    revision: string;
  } | null>(null);
  const [preferenceBusy, setPreferenceBusy] = useState(false);
  const [preferenceFailed, setPreferenceFailed] = useState(false);
  const pendingPreference = useRef(false);
  const draggedKey = useRef<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    key: string;
    before: boolean;
  } | null>(null);
  const favorites = new Set(modelPicker?.favorites);
  const hidden = new Set(modelPicker?.hidden);
  const ordered = useMemo(
    () =>
      orderModelCatalog(
        snapshot.models.filter((model) => model.provider === provider),
        modelPicker?.order,
      ),
    [snapshot.models, provider, modelPicker?.order],
  );
  const kinds = [
    ...new Set(
      ordered
        .map((model) => model.kind)
        .filter((value): value is string => !!value),
    ),
  ];
  const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  const filtered = ordered.filter(
    (model) =>
      (!kind || model.kind === kind) &&
      terms.every((term) =>
        `${model.id} ${model.name} ${model.provider}`
          .toLocaleLowerCase()
          .includes(term),
      ),
  );
  const preference = async (change: ModelPickerPreferenceChange) => {
    if (!onModelPreference || pendingPreference.current) return;
    pendingPreference.current = true;
    setPreferenceBusy(true);
    setPreferenceFailed(false);
    try {
      await onModelPreference(change);
    } catch {
      setPreferenceFailed(true);
    } finally {
      pendingPreference.current = false;
      setPreferenceBusy(false);
    }
  };
  const preferencesDisabled = disabled || preferenceBusy || !onModelPreference;
  const saveOrder = (keys: string[]) => {
    const providerKeys = new Set(keys);
    void preference({
      kind: "order",
      keys: [
        ...(modelPicker?.order.filter((key) => !providerKeys.has(key)) ?? []),
        ...keys,
      ],
    });
  };
  const move = (key: string, direction: -1 | 1) => {
    if (preferencesDisabled) return;
    const keys = ordered.map(keyOf);
    const from = keys.indexOf(key);
    const to = from + direction;
    const neighbor = keys[to];
    if (from < 0 || neighbor === undefined) return;
    keys[from] = neighbor;
    keys[to] = key;
    saveOrder(keys);
  };
  const finishDrag = () => {
    draggedKey.current = null;
    setDragging(null);
    setDropTarget(null);
  };
  return (
    <section className="providers-detail-section providers-model-section">
      <div className="providers-section-heading">
        <div>
          <h4>{t("providers.models")}</h4>
          <p className="providers-hint">{t("models.deviceNotice")}</p>
        </div>
        <Button
          variant="secondary"
          disabled={disabled || !snapshot.revision}
          onClick={() => {
            setEditor({});
            setDeleting(null);
          }}
        >
          {t("models.addCustom")}
        </Button>
      </div>
      {editor && (
        <CustomModelForm
          key={editor.model?.id ?? "new"}
          provider={provider}
          model={editor.model}
          snapshot={snapshot}
          scope={scope}
          disabled={disabled}
          write={write}
          onClose={() => setEditor(null)}
        />
      )}
      <div className="providers-model-toolbar">
        <div className="providers-search">
          <SearchIcon />
          <TextInput
            aria-label={t("models.search")}
            placeholder={t("models.search")}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setLimit(100);
            }}
          />
        </div>
        <Select
          aria-label={t("models.kind")}
          value={kind}
          options={[
            { value: "", label: t("models.kind.all") },
            ...kinds.map((value) => ({
              value,
              label: Object.hasOwn(kindKeys, value)
                ? t(kindKeys[value as keyof typeof kindKeys])
                : value,
            })),
          ]}
          onValueChange={(value) => {
            setKind(value);
            setLimit(100);
          }}
        />
      </div>
      <p className="providers-hint providers-model-count">
        {t("models.count", { count: filtered.length })}
      </p>
      {preferenceFailed && (
        <p role="alert" className="failure">
          {t("providers.preferenceFailed")}
        </p>
      )}
      <div className="providers-model-list">
        {filtered.slice(0, limit).map((model) => {
          const key = keyOf(model);
          return (
            <div
              key={key}
              className="providers-model-row"
              data-settings-model={model.id}
              data-hidden={hidden.has(key) || undefined}
              data-dragging={dragging === key || undefined}
              data-drop={
                dropTarget?.key === key
                  ? dropTarget.before
                    ? "before"
                    : "after"
                  : undefined
              }
              onDragOver={(event) => {
                if (
                  preferencesDisabled ||
                  !draggedKey.current ||
                  draggedKey.current === key
                )
                  return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                const rect = event.currentTarget.getBoundingClientRect();
                setDropTarget({
                  key,
                  before: event.clientY < rect.top + rect.height / 2,
                });
              }}
              onDragLeave={(event) => {
                if (
                  !(event.relatedTarget instanceof Node) ||
                  !event.currentTarget.contains(event.relatedTarget)
                ) {
                  setDropTarget((target) =>
                    target?.key === key ? null : target,
                  );
                }
              }}
              onDrop={(event) => {
                const source = draggedKey.current;
                if (preferencesDisabled || !source || source === key) return;
                event.preventDefault();
                const previous = ordered.map(keyOf);
                if (!previous.includes(source)) {
                  finishDrag();
                  return;
                }
                const rect = event.currentTarget.getBoundingClientRect();
                const before = event.clientY < rect.top + rect.height / 2;
                const keys = previous.filter((entry) => entry !== source);
                const destination = keys.indexOf(key);
                keys.splice(destination + (before ? 0 : 1), 0, source);
                finishDrag();
                if (keys.some((entry, index) => entry !== previous[index]))
                  saveOrder(keys);
              }}
            >
              <Button
                variant="navigation"
                size="icon"
                className="providers-model-drag"
                aria-label={t("models.drag", { name: model.name })}
                title={t("models.drag", { name: model.name })}
                disabled={preferencesDisabled}
                draggable={!preferencesDisabled}
                onDragStart={(event) => {
                  if (preferencesDisabled) {
                    event.preventDefault();
                    return;
                  }
                  draggedKey.current = key;
                  setDragging(key);
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", key);
                }}
                onDragEnd={finishDrag}
              >
                <ModelBrandIcon
                  provider={model.provider}
                  modelId={model.id}
                  size={20}
                />
              </Button>
              <div className="providers-model-identity">
                <p>
                  <strong title={model.name}>{model.name}</strong>
                  {model.custom && (
                    <span className="providers-model-tag">
                      {t("models.custom")}
                    </span>
                  )}
                  {model.kind && (
                    <span className="providers-model-tag">
                      {Object.hasOwn(kindKeys, model.kind)
                        ? t(kindKeys[model.kind as keyof typeof kindKeys])
                        : model.kind}
                    </span>
                  )}
                </p>
                <div className="providers-model-summary">
                  {model.id.toLocaleLowerCase() !==
                    model.name.toLocaleLowerCase() && (
                    <span
                      className="providers-hint providers-model-id"
                      data-selectable
                      title={model.id}
                    >
                      {model.id}
                    </span>
                  )}
                  <SettingsModelMetadata model={model} />
                </div>
              </div>
              <div className="providers-model-actions">
                <Button
                  variant="navigation"
                  size="icon"
                  aria-label={t(
                    favorites.has(key)
                      ? "models.unfavorite"
                      : "models.favorite",
                    { name: model.name },
                  )}
                  aria-pressed={favorites.has(key)}
                  disabled={preferencesDisabled}
                  onClick={() =>
                    void preference({
                      kind: "favorite",
                      key,
                      value: !favorites.has(key),
                    })
                  }
                >
                  <StarIcon variant={favorites.has(key) ? "solid" : "stroke"} />
                </Button>
                <Button
                  variant="navigation"
                  size="icon"
                  aria-label={t("models.moveUp", { name: model.name })}
                  disabled={preferencesDisabled || ordered[0] === model}
                  onClick={() => move(key, -1)}
                >
                  <ChevronUpIcon />
                </Button>
                <Button
                  variant="navigation"
                  size="icon"
                  aria-label={t("models.moveDown", { name: model.name })}
                  disabled={preferencesDisabled || ordered.at(-1) === model}
                  onClick={() => move(key, 1)}
                >
                  <ChevronDownIcon />
                </Button>
                <Switch
                  aria-label={t("models.visible", { name: model.name })}
                  checked={!hidden.has(key)}
                  disabled={preferencesDisabled}
                  onCheckedChange={(visible) =>
                    void preference({ kind: "visibility", key, value: visible })
                  }
                />
              </div>
              {model.custom && (
                <div className="providers-custom-actions">
                  <Button
                    variant="ghost"
                    aria-label={t("models.editCustom", { name: model.name })}
                    disabled={disabled || !snapshot.revision}
                    onClick={() => {
                      setEditor({ model });
                      setDeleting(null);
                    }}
                  >
                    {t("models.editCustom", { name: model.name })}
                  </Button>
                  {deleting?.id === model.id ? (
                    <>
                      <Button
                        variant="destructive"
                        disabled={disabled || !snapshot.revision}
                        onClick={async () => {
                          if (!snapshot.revision) return;
                          if (
                            await write.request({
                              kind: "delete-custom-model",
                              scope,
                              providerId: model.provider,
                              modelId: model.id,
                              expectedRevision: deleting.revision,
                              traceId: crypto.randomUUID(),
                            })
                          )
                            setDeleting(null);
                        }}
                      >
                        {t("models.confirmDelete")}
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={disabled}
                        onClick={() => setDeleting(null)}
                      >
                        {t("providers.cancel")}
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="ghost"
                      aria-label={t("models.deleteCustom", {
                        name: model.name,
                      })}
                      disabled={disabled || !snapshot.revision}
                      onClick={() =>
                        snapshot.revision &&
                        setDeleting({
                          id: model.id,
                          revision: snapshot.revision,
                        })
                      }
                    >
                      {t("models.deleteCustom", { name: model.name })}
                    </Button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {!filtered.length && (
        <p className="providers-empty">{t("models.noResults")}</p>
      )}
      {filtered.length > limit && (
        <Button
          variant="ghost"
          onClick={() => setLimit((value) => value + 100)}
        >
          {t("models.more")}
        </Button>
      )}
    </section>
  );
}
