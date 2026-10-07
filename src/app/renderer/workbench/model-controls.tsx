import { useQuery } from "@tanstack/react-query";
import { type Ref, useState } from "react";
import { useStore } from "zustand";
import type {
  ConfigurationBridge,
  ConfigurationSnapshot,
  ThinkingSelection,
} from "../../../modules/configuration/contracts/public";
import { configurationSnapshotQuery } from "../../../modules/configuration/renderer/public";
import { useI18n } from "../../../modules/preferences/renderer/public";
import { Button } from "../../../modules/ui/renderer/public";
import type { ThreadModel } from "../wiring/thread-model";

type ThinkingChoice =
  | "default"
  | "off"
  | Extract<ThinkingSelection, { kind: "effort" }>["effort"];
function thinkingLabel(
  thinking: ThinkingSelection | undefined,
  t: ReturnType<typeof useI18n>["t"],
) {
  return thinking?.kind === "effort"
    ? thinking.effort
    : thinking?.kind === "default"
      ? t("model.defaultThinking")
      : (thinking?.kind ?? "");
}
export function ModelControls({
  thread,
  bridge,
  disclosureRef,
}: {
  thread: ThreadModel;
  bridge: ConfigurationBridge;
  disclosureRef?: Ref<HTMLDetailsElement>;
}) {
  const { t } = useI18n();
  const runtime = thread.runtime;
  const query = useQuery(
    configurationSnapshotQuery(bridge, {
      kind: "thread",
      threadId: thread.context.threadId,
      workingDirectoryId: thread.context.workingDirectoryId,
    }),
  );
  const [search, setSearch] = useState("");
  const [showUnavailable, setShowUnavailable] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [level, setLevel] = useState<ThinkingChoice | null>(null);
  const models =
    query.data?.models.filter(
      (m) =>
        (m.available || showUnavailable) &&
        `${m.provider}/${m.id} ${m.name}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    ) ?? [];
  if (!runtime) return null;
  return (
    <ModelSelectionState
      thread={thread}
      disclosureRef={disclosureRef}
      runtime={runtime}
      models={models.slice(0, 200)}
      catalog={query.data?.models ?? []}
      selected={selected}
      select={(value) => {
        setSelected(value);
        setLevel("default");
      }}
      level={level}
      setLevel={setLevel}
      search={search}
      setSearch={setSearch}
      loading={query.isFetching}
      failed={query.isError || !!query.data?.catalogError}
      showUnavailable={showUnavailable}
      setShowUnavailable={setShowUnavailable}
      refresh={() => void query.refetch()}
      defaultModel={query.data?.defaultModel ?? null}
      t={t}
    />
  );
}
function ModelSelectionState({
  runtime,
  disclosureRef,
  models,
  catalog,
  selected: chosen,
  select,
  level: chosenLevel,
  setLevel,
  search,
  setSearch,
  loading,
  failed,
  refresh,
  showUnavailable,
  setShowUnavailable,
  defaultModel,
  t,
}: {
  thread: ThreadModel;
  disclosureRef: Ref<HTMLDetailsElement> | undefined;
  runtime: NonNullable<ThreadModel["runtime"]>;
  models: ConfigurationSnapshot["models"];
  catalog: ConfigurationSnapshot["models"];
  selected: string | null;
  select: (value: string) => void;
  level: ThinkingChoice | null;
  setLevel: (value: ThinkingChoice) => void;
  search: string;
  setSearch: (value: string) => void;
  loading: boolean;
  failed: boolean;
  refresh: () => void;
  defaultModel: string | null;
  showUnavailable: boolean;
  setShowUnavailable: (value: boolean) => void;
  t: ReturnType<typeof useI18n>["t"];
}) {
  const view = useStore(runtime.stateStore, (state) => state.view);
  const inherited =
    view?.model ??
    (view?.selectedModel
      ? `${view.selectedModel.provider}/${view.selectedModel.modelId}`
      : view?.phase === "interrupted"
        ? null
        : defaultModel);
  const current = catalog.find((m) => `${m.provider}/${m.id}` === inherited);
  const selected =
    chosen ?? (current ? JSON.stringify([current.provider, current.id]) : "");
  const target = catalog.find(
    (m) => JSON.stringify([m.provider, m.id]) === selected,
  );
  const visibleModels =
    target && !models.includes(target) ? [target, ...models] : models;
  const intent = view?.selectedModel?.thinking;
  const effective = view?.thinkingLevel;
  const level: ThinkingChoice =
    chosenLevel ??
    (effective === "off" ||
    target?.thinking.efforts.some((effort) => effort === effective)
      ? (effective as ThinkingChoice)
      : intent?.kind === "effort"
        ? intent.effort
        : intent?.kind === "off"
          ? "off"
          : "default");
  const disabled =
    !!view?.busy ||
    !!view?.modelChanging ||
    view?.phase === "starting" ||
    view?.phase === "interrupted";
  const validThinking =
    level === "default" ||
    (level === "off"
      ? !!target?.thinking.adjustable && !target.thinking.requiresEffort
      : !!target?.thinking.efforts.includes(level));
  return (
    <details
      ref={disclosureRef}
      className="model-controls"
      aria-label={t("model.heading")}
    >
      <summary>
        {t(
          view?.phase === "interrupted"
            ? "model.readOnly"
            : view?.model
              ? "model.active"
              : "model.next",
        )}
        : {inherited ?? t("model.none")} · {t("model.thinking")}:{" "}
        {view?.thinkingLevel ??
          thinkingLabel(
            view?.selectedModel?.thinking ?? { kind: "default" },
            t,
          )}{" "}
        · {t("model.change")}
      </summary>
      {view?.phase === "interrupted" && (
        <p role="status" className="muted">
          {t("model.readOnlyNotice")}
        </p>
      )}
      {view?.selectedModel && !view.model && (
        <p className="muted">
          {t("model.next")}: {view.selectedModel.provider}/
          {view.selectedModel.modelId} ·{" "}
          {thinkingLabel(view.selectedModel.thinking, t)}
        </p>
      )}
      <label>
        <input
          type="checkbox"
          checked={showUnavailable}
          onChange={(e) => setShowUnavailable(e.target.checked)}
        />
        {t("model.showUnavailable")}
      </label>
      <div className="model-fields">
        <label>
          {t("model.search")}
          <input value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <label>
          {t("model.heading")}
          <select
            value={selected}
            disabled={disabled || loading}
            onChange={(e) => select(e.target.value)}
          >
            <option value="">{t("model.choose")}</option>
            {visibleModels.map((m) => (
              <option
                key={JSON.stringify([m.provider, m.id])}
                value={JSON.stringify([m.provider, m.id])}
                disabled={!m.available}
              >
                {m.provider} / {m.name}
                {m.reason ? ` · ${t(`model.reason.${m.reason}`)}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("model.thinking")}
          <select
            disabled={disabled || !target?.thinking.adjustable}
            value={level}
            onChange={(e) => {
              const value = e.target.value;
              if (
                value === "default" ||
                value === "off" ||
                target?.thinking.efforts.some((effort) => effort === value)
              )
                setLevel(value as ThinkingChoice);
            }}
          >
            <option value="default">{t("model.defaultThinking")}</option>
            {target?.thinking.adjustable && !target.thinking.requiresEffort && (
              <option value="off">{t("model.offThinking")}</option>
            )}
            {target?.thinking.efforts.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <Button
          disabled={!target?.available || disabled || loading || !validThinking}
          onClick={() => {
            if (target?.available && validThinking)
              void runtime.selectModel({
                provider: target.provider,
                modelId: target.id,
                thinking:
                  level === "default"
                    ? { kind: "default" }
                    : level === "off"
                      ? { kind: "off" }
                      : { kind: "effort", effort: level },
              });
          }}
        >
          {t("model.apply")}
        </Button>
        <Button variant="ghost" disabled={loading} onClick={refresh}>
          {t("config.refresh")}
        </Button>
      </div>
      {loading && <p role="status">{t("config.loading")}</p>}
      {failed && (
        <p role="alert" className="failure">
          {t("config.failed")}
        </p>
      )}
      {!loading && !models.length && <p>{t("model.noAvailable")}</p>}
      <p className="muted">{t("model.notice")}</p>
    </details>
  );
}
