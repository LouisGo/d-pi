import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useStore } from "zustand";
import { Button } from "@/components/ui/button";
import type {
  ConfigurationBridge,
  ConfigurationSnapshot,
} from "../../modules/configuration/contracts/public";
import { configurationSnapshotQuery } from "../../modules/configuration/renderer/public";
import { useI18n } from "../../modules/preferences/renderer/public";
import type { ThreadModel } from "./thread-model";
export function ModelControls({
  thread,
  bridge,
}: {
  thread: ThreadModel;
  bridge: ConfigurationBridge;
}) {
  const { t } = useI18n();
  const runtime = thread.runtime;
  const query = useQuery(configurationSnapshotQuery(bridge, thread.key));
  const [search, setSearch] = useState("");
  const [showUnavailable, setShowUnavailable] = useState(false);
  const [selected, setSelected] = useState("");
  const [level, setLevel] = useState<
    "off" | "low" | "medium" | "high" | "xhigh" | "max"
  >("off");
  const models =
    query.data?.models.filter(
      (m) =>
        (m.available || showUnavailable) &&
        `${m.provider}/${m.id} ${m.name}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    ) ?? [];
  const target = models.find(
    (m) => JSON.stringify([m.provider, m.id]) === selected,
  );
  if (!runtime) return null;
  return (
    <ModelSelectionState
      thread={thread}
      runtime={runtime}
      models={models.slice(0, 200)}
      target={target}
      selected={selected}
      select={setSelected}
      level={level}
      setLevel={setLevel}
      search={search}
      setSearch={setSearch}
      loading={query.isFetching}
      failed={query.isError || !!query.data?.catalogError}
      showUnavailable={showUnavailable}
      setShowUnavailable={setShowUnavailable}
      refresh={() => void query.refetch()}
      t={t}
    />
  );
}
function ModelSelectionState({
  runtime,
  models,
  target,
  selected,
  select,
  level,
  setLevel,
  search,
  setSearch,
  loading,
  failed,
  refresh,
  showUnavailable,
  setShowUnavailable,
  t,
}: {
  thread: ThreadModel;
  runtime: NonNullable<ThreadModel["runtime"]>;
  models: ConfigurationSnapshot["models"];
  target: ConfigurationSnapshot["models"][number] | undefined;
  selected: string;
  select: (value: string) => void;
  level: "off" | "low" | "medium" | "high" | "xhigh" | "max";
  setLevel: (
    value: "off" | "low" | "medium" | "high" | "xhigh" | "max",
  ) => void;
  search: string;
  setSearch: (value: string) => void;
  loading: boolean;
  failed: boolean;
  refresh: () => void;
  showUnavailable: boolean;
  setShowUnavailable: (value: boolean) => void;
  t: ReturnType<typeof useI18n>["t"];
}) {
  const view = useStore(runtime.stateStore, (state) => state.view);
  const disabled =
    !!view?.busy ||
    !!view?.modelChanging ||
    view?.phase === "starting" ||
    view?.phase === "interrupted";
  return (
    <section className="model-controls" aria-label={t("model.heading")}>
      <p>
        {t("model.active")}: {view?.model ?? t("model.none")}{" "}
        {view?.thinkingLevel ?? ""}
      </p>
      {view?.selectedModel && !view.model && (
        <p className="muted">
          {t("model.next")}: {view.selectedModel.provider}/
          {view.selectedModel.modelId} · {view.selectedModel.thinkingLevel}
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
            {models.map((m) => (
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
            disabled={disabled || !target?.reasoning}
            value={level}
            onChange={(e) => {
              const value = e.target.value;
              if (
                value === "off" ||
                value === "low" ||
                value === "medium" ||
                value === "high" ||
                value === "xhigh" ||
                value === "max"
              )
                setLevel(value);
            }}
          >
            {["off", "low", "medium", "high", "xhigh", "max"].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <Button
          disabled={!target?.available || disabled}
          onClick={() => {
            if (target?.available)
              void runtime.selectModel({
                provider: target.provider,
                modelId: target.id,
                thinkingLevel: target.reasoning ? level : "off",
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
    </section>
  );
}
