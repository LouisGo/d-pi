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
import {
  Button,
  Checkbox,
  Disclosure,
  DisclosureTrigger,
  Select,
} from "../../../modules/ui/renderer/public";
import type { ThreadModel } from "../wiring/thread-model";

import { displayedModel, modelSelectionMode } from "./model-selection";

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
  const [showUnavailable, setShowUnavailable] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [level, setLevel] = useState<ThinkingChoice | null>(null);
  const models =
    query.data?.models.filter((m) => m.available || showUnavailable) ?? [];
  if (!runtime) return null;
  return (
    <ModelSelectionState
      thread={thread}
      disclosureRef={disclosureRef}
      runtime={runtime}
      models={models}
      catalog={query.data?.models ?? []}
      selected={selected}
      select={(value) => {
        setSelected(value);
        setLevel("default");
      }}
      level={level}
      setLevel={setLevel}
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
  loading: boolean;
  failed: boolean;
  refresh: () => void;
  defaultModel: string | null;
  showUnavailable: boolean;
  setShowUnavailable: (value: boolean) => void;
  t: ReturnType<typeof useI18n>["t"];
}) {
  const view = useStore(runtime.stateStore, (state) => state.view);
  const mode = modelSelectionMode(view);
  const inherited =
    displayedModel(view) ??
    (view?.phase === "interrupted" ? null : defaultModel);
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
  const disabled = mode === "blocked";
  const validThinking =
    level === "default" ||
    (level === "off"
      ? !!target?.thinking.adjustable && !target.thinking.requiresEffort
      : !!target?.thinking.efforts.includes(level));
  return (
    <div className="model-controls">
      <Disclosure ref={disclosureRef} aria-label={t("model.heading")}>
        <DisclosureTrigger>
          {t(
            view?.phase === "interrupted" && mode === "blocked"
              ? "model.readOnly"
              : mode === "live" && view?.model
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
        </DisclosureTrigger>
        {view?.phase === "interrupted" && (
          <p role="status" className="muted">
            {t(
              mode === "next-start"
                ? "models.recoverySelect"
                : "models.recoveryBlocked",
            )}
          </p>
        )}
        {view?.selectedModel && mode === "next-start" && (
          <p className="muted">
            {t("models.nextStart")}: {view.selectedModel.provider}/
            {view.selectedModel.modelId} ·{" "}
            {thinkingLabel(view.selectedModel.thinking, t)}
          </p>
        )}
        <label>
          <Checkbox
            checked={showUnavailable}
            onChange={(e) => setShowUnavailable(e.target.checked)}
          />
          {t("model.showUnavailable")}
        </label>
        <div className="model-fields">
          <label>
            {t("model.heading")}
            <Select
              value={selected}
              disabled={disabled || loading}
              onValueChange={select}
              aria-label={t("model.heading")}
              search={{
                label: t("model.search"),
                empty: t("model.noAvailable"),
              }}
              options={[
                { value: "", label: t("model.choose") },
                ...visibleModels.map((m) => ({
                  value: JSON.stringify([m.provider, m.id]),
                  label: `${m.provider} / ${m.name}${m.reason ? ` · ${t(`model.reason.${m.reason}`)}` : ""}`,
                  searchText: m.id,
                  disabled: !m.available,
                })),
              ]}
            />
          </label>
          <label>
            {t("model.thinking")}
            <Select<ThinkingChoice>
              disabled={disabled || !target?.thinking.adjustable}
              value={level}
              aria-label={t("model.thinking")}
              onValueChange={setLevel}
              options={[
                { value: "default", label: t("model.defaultThinking") },
                ...(target?.thinking.adjustable &&
                !target.thinking.requiresEffort
                  ? [{ value: "off" as const, label: t("model.offThinking") }]
                  : []),
                ...(target?.thinking.efforts.map((value) => ({
                  value,
                  label: value,
                })) ?? []),
              ]}
            />
          </label>
          <Button
            disabled={
              !target?.available || disabled || loading || !validThinking
            }
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
      </Disclosure>
    </div>
  );
}
