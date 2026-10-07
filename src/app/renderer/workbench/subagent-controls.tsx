import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { match } from "ts-pattern";
import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";
import type {
  ConfigurationBridge,
  SubagentConfigurationCommand,
  ThinkingSelection,
} from "../../../modules/configuration/contracts/public";
import { configurationSnapshotQuery } from "../../../modules/configuration/renderer/public";
import { useI18n } from "../../../modules/preferences/renderer/public";
import { Button, Select } from "../../../modules/ui/renderer/public";
import type { ThreadModel } from "../wiring/thread-model";

type ThinkingChoice =
  | "default"
  | "off"
  | Extract<ThinkingSelection, { kind: "effort" }>["effort"];

export function SubagentControls({
  thread,
  bridge,
}: {
  thread: ThreadModel;
  bridge: ConfigurationBridge;
}) {
  if (!thread.runtime) return null;
  return (
    <LiveSubagentControls
      thread={thread}
      bridge={bridge}
      runtime={thread.runtime}
    />
  );
}

function LiveSubagentControls({
  thread,
  bridge,
  runtime,
}: {
  thread: ThreadModel;
  bridge: ConfigurationBridge;
  runtime: NonNullable<ThreadModel["runtime"]>;
}) {
  const { t } = useI18n();
  const { phase, trusted, connection, agents, operation } = useStore(
    runtime.stateStore,
    useShallow((state) => ({
      phase: state.view?.phase,
      trusted: state.view?.trusted,
      connection: state.view?.connectionGeneration,
      agents: state.view?.subagents?.agents,
      operation: state.view?.subagentOperation,
    })),
  );
  const query = useQuery(
    configurationSnapshotQuery(bridge, {
      kind: "thread",
      threadId: thread.context.threadId,
      workingDirectoryId: thread.context.workingDirectoryId,
    }),
  );
  const [chosenAgent, setChosenAgent] = useState<string | null>(null);
  const [choice, setChoice] = useState<{
    agent: string;
    model: string;
    thinking: ThinkingChoice;
  } | null>(null);
  const agent =
    agents?.find((item) => item.name === chosenAgent) ?? agents?.[0];
  const draft = choice?.agent === agent?.name ? choice : null;
  const override = agent?.override;
  const selected =
    draft?.model ??
    (override ? JSON.stringify([override.provider, override.modelId]) : "");
  const target = query.data?.models.find(
    (model) => JSON.stringify([model.provider, model.id]) === selected,
  );
  const level: ThinkingChoice =
    draft?.thinking ??
    (override?.thinking.kind === "effort"
      ? override.thinking.effort
      : (override?.thinking.kind ?? "default"));
  const validThinking =
    level === "default" ||
    (level === "off"
      ? !!target?.thinking.adjustable && !target.thinking.requiresEffort
      : !!target?.thinking.efforts.includes(level));
  const available = phase === "ready" && trusted && !!connection;
  const unreconciled = operation?.status === "unknown" && !operation.reconciled;
  const disabled =
    !available || operation?.status === "pending" || unreconciled;
  const submit = async (command: SubagentConfigurationCommand) => {
    if (disabled) return;
    await runtime.configureSubagent(command);
    if (runtime.getSnapshot()?.subagentOperation?.status === "acknowledged")
      setChoice(null);
  };
  return (
    <details className="model-controls" aria-label={t("subagent.heading")}>
      <summary>{t("subagent.heading")}</summary>
      <p className="muted">{t("subagent.notice")}</p>
      {!available && <p role="status">{t("subagent.unavailable")}</p>}
      {!agent ? (
        <p>{t("subagent.none")}</p>
      ) : (
        <>
          <div className="model-fields">
            <label>
              {t("subagent.agent")}
              <Select
                name="subagent-agent"
                value={agent.name}
                disabled={disabled}
                aria-label={t("subagent.agent")}
                onValueChange={(value) => {
                  setChosenAgent(value);
                  setChoice(null);
                }}
                options={
                  agents?.map((item) => ({
                    value: item.name,
                    label: item.name,
                  })) ?? []
                }
              />
            </label>
          </div>
          <p className="break-words">{agent.description}</p>
          <p className="muted">
            {t("subagent.sharedDefault")}:{" "}
            {agent.effectivePatterns.join(", ") || t("subagent.noPatterns")}
          </p>
          <p>
            {t("subagent.instanceOverride")}:{" "}
            {override
              ? `${override.provider}/${override.modelId} · ${override.thinking.kind === "effort" ? override.thinking.effort : override.thinking.kind === "off" ? t("model.offThinking") : t("model.defaultThinking")}`
              : t("subagent.inherited")}
          </p>
          <div className="model-fields">
            <label>
              {t("model.heading")}
              <Select
                name="subagent-model"
                value={selected}
                disabled={disabled || query.isFetching}
                aria-label={t("model.heading")}
                search={{
                  label: t("model.search"),
                  empty: t("model.noAvailable"),
                }}
                onValueChange={(value) =>
                  setChoice({
                    agent: agent.name,
                    model: value,
                    thinking: "default",
                  })
                }
                options={[
                  { value: "", label: t("model.choose") },
                  ...(query.data?.models.map((model) => ({
                    value: JSON.stringify([model.provider, model.id]),
                    label: `${model.provider} / ${model.name}${model.reason ? ` · ${t(`model.reason.${model.reason}`)}` : ""}`,
                    searchText: model.id,
                    disabled: !model.available,
                  })) ?? []),
                ]}
              />
            </label>
            <label>
              {t("model.thinking")}
              <Select<ThinkingChoice>
                name="subagent-thinking"
                value={level}
                disabled={disabled || !target?.thinking.adjustable}
                aria-label={t("model.thinking")}
                onValueChange={(value) =>
                  setChoice({
                    agent: agent.name,
                    model: selected,
                    thinking: value,
                  })
                }
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
              data-action="apply"
              onClick={() => {
                if (target?.available && validThinking && !query.isFetching)
                  void submit({
                    kind: "set",
                    agent: agent.name,
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
              disabled={
                disabled ||
                query.isFetching ||
                !target?.available ||
                !validThinking
              }
            >
              {t("subagent.apply")}
            </Button>
            <Button
              data-action="clear"
              onClick={() => {
                if (override) void submit({ kind: "clear", agent: agent.name });
              }}
              variant="ghost"
              disabled={disabled || !override}
            >
              {t("subagent.clear")}
            </Button>
            <Button
              variant="ghost"
              disabled={query.isFetching || operation?.status === "pending"}
              onClick={() => {
                void Promise.all([runtime.act("inspect"), query.refetch()]);
              }}
            >
              {t("config.refresh")}
            </Button>
          </div>
        </>
      )}
      {operation &&
        match(operation.status)
          .with("pending", () => <p role="status">{t("subagent.pending")}</p>)
          .with("acknowledged", () => (
            <p role="status">{t("subagent.acknowledged")}</p>
          ))
          .with("failed", () => (
            <p role="alert" className="failure">
              {t("subagent.failed")}
            </p>
          ))
          .with("unknown", () => (
            <p
              role={unreconciled ? "alert" : "status"}
              className={unreconciled ? "failure" : "muted"}
            >
              {t(unreconciled ? "subagent.unknown" : "subagent.reconciled")}
            </p>
          ))
          .exhaustive()}
      {agent &&
        !query.isFetching &&
        query.data &&
        !query.data.models.some((model) => model.available) && (
          <p>{t("model.noAvailable")}</p>
        )}
      {query.isFetching && <p role="status">{t("config.loading")}</p>}
      {(query.isError || query.data?.catalogError) && (
        <p role="alert" className="failure">
          {t("config.failed")}
        </p>
      )}
    </details>
  );
}
