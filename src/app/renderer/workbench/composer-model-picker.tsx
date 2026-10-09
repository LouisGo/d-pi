import { useQuery } from "@tanstack/react-query";
import { useContext, useRef, useState } from "react";
import { useStore } from "zustand";
import type {
  ConfigurationSnapshot,
  ThinkingSelection,
} from "../../../modules/configuration/contracts/public";
import { catalogModelKey } from "../../../modules/configuration/core/public";
import {
  configurationSnapshotQuery,
  ModelPickerPanel,
  providerDisplayName,
} from "../../../modules/configuration/renderer/public";
import { EMPTY_MODEL_PICKER_PREFERENCES } from "../../../modules/preferences/core/public";
import { useI18n } from "../../../modules/preferences/renderer/public";
import {
  Button,
  ChevronDownIcon,
  ModelBrandIcon,
  Popover,
  Select,
} from "../../../modules/ui/renderer/public";
import { ConversationVisibilityContext } from "../shell/layout/conversation-visibility";
import type { AppModel } from "../wiring/model";
import type { ThreadModel } from "../wiring/thread-model";

type ThinkingChoice =
  | "default"
  | "off"
  | Extract<ThinkingSelection, { kind: "effort" }>["effort"];
export function ComposerModelPicker({
  thread,
  model,
  runtime,
}: {
  thread: ThreadModel;
  model: AppModel;
  runtime: NonNullable<ThreadModel["runtime"]>;
}) {
  const { t, formatMessage } = useI18n();
  const [open, setOpen] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const applying = useRef(false);
  const search = useRef<HTMLInputElement>(null);
  const { openProviders, visible: conversationVisible } = useContext(
    ConversationVisibilityContext,
  );
  const view = useStore(runtime.stateStore, (state) => state.view);
  const preferences = useStore(model.stateStore, (state) =>
    state.kind === "ready"
      ? (state.preferences.modelPicker ?? EMPTY_MODEL_PICKER_PREFERENCES)
      : EMPTY_MODEL_PICKER_PREFERENCES,
  );
  const notice = useStore(model.stateStore, (state) =>
    state.kind === "ready" ? state.notice : null,
  );
  const query = useQuery({
    ...configurationSnapshotQuery(model.configuration, {
      kind: "thread",
      threadId: thread.context.threadId,
      workingDirectoryId: thread.context.workingDirectoryId,
    }),
    enabled: (open || conversationVisible) && !!model.configuration,
  });
  const models = query.data?.models ?? [];
  const current = models.find((m) =>
    view?.model
      ? `${m.provider}/${m.id}` === view.model
      : view?.selectedModel?.provider === m.provider &&
        view.selectedModel.modelId === m.id,
  );
  const currentKey = current ? catalogModelKey(current) : null;
  const modelId =
    current?.id ??
    view?.model?.slice(view.model.indexOf("/") + 1) ??
    view?.selectedModel?.modelId ??
    "";
  const provider =
    current?.provider ??
    view?.model?.slice(0, view.model.indexOf("/")) ??
    view?.selectedModel?.provider ??
    "";
  const providerLabel = providerDisplayName(
    provider,
    query.data?.providers?.find((entry) => entry.id === provider)?.name,
  );
  const disabled =
    pending ||
    !!view?.busy ||
    !!view?.modelChanging ||
    view?.phase === "starting" ||
    view?.phase === "interrupted";
  const apply = async (
    target: ConfigurationSnapshot["models"][number],
    thinking: ThinkingSelection,
  ) => {
    if (
      disabled ||
      applying.current ||
      !target.available ||
      target.sessionSelectable === false
    )
      return;
    applying.current = true;
    setPending(true);
    setFailure(null);
    try {
      const readback = await runtime.selectModel({
        provider: target.provider,
        modelId: target.id,
        thinking,
      });
      if (runtime.stateStore.getState().disposed) return;
      const applied =
        readback?.threadId === thread.context.threadId &&
        !readback.modelChanging &&
        readback.modelOperation?.traceId === readback.traceId &&
        readback.modelOperation.status === "acknowledged" &&
        JSON.stringify(readback.selectedModel?.thinking) ===
          JSON.stringify(thinking) &&
        readback.phase !== "interrupted" &&
        readback.phase !== "failed" &&
        (readback.model === `${target.provider}/${target.id}` ||
          (!readback.model &&
            readback.selectedModel?.provider === target.provider &&
            readback.selectedModel.modelId === target.id));
      if (applied) setOpen(false);
      else {
        setFailure(
          readback ? formatMessage(readback.message) : t("config.failed"),
        );
        setOpen(true);
      }
    } catch {
      setFailure(t("config.failed"));
      setOpen(true);
    } finally {
      applying.current = false;
      setPending(false);
    }
  };
  const intent = view?.selectedModel?.thinking;
  const thinking: ThinkingChoice =
    intent?.kind === "effort" ? intent.effort : (intent?.kind ?? "default");
  return (
    <div className="composer-model-picker">
      <Popover
        open={open}
        onOpenChange={(value) => {
          setOpen(value);
          if (value) setFailure(null);
        }}
        initialFocus={search}
        label={t("models.select")}
        variant="flush"
        trigger={
          <Button
            variant="ghost"
            aria-label={t("models.select")}
            title={`${providerLabel} / ${current?.name ?? modelId}`}
          >
            <ModelBrandIcon provider={provider} modelId={modelId} size={18} />
            <span className="composer-model-identity">
              <span className="composer-toolbar-label">
                {current?.name ?? (modelId || t("model.none"))}
              </span>
              <span className="composer-model-provider">{providerLabel}</span>
            </span>
            <ChevronDownIcon />
          </Button>
        }
      >
        <ModelPickerPanel
          models={models}
          providers={query.data?.providers}
          currentKey={currentKey}
          currentProvider={provider}
          preferences={preferences}
          disabled={disabled}
          loading={query.isFetching}
          failed={query.isError || !!query.data?.catalogError}
          onRetry={() => void query.refetch()}
          searchRef={search}
          onSelect={(target) => void apply(target, { kind: "default" })}
          onPreference={(change) => void model.modelPreference(change)}
          onManage={() => {
            setOpen(false);
            openProviders?.();
          }}
        />
        {(failure || notice) && (
          <p role="alert" className="model-picker-empty failure">
            {failure ?? (notice && formatMessage(notice.message))}
          </p>
        )}
      </Popover>
      {current?.thinking.adjustable && (
        <div
          className="composer-thinking-select"
          title={
            view?.thinkingLevel
              ? t("models.nativeValue", { value: view.thinkingLevel })
              : undefined
          }
        >
          <Select<ThinkingChoice>
            aria-label={t("model.thinking")}
            value={thinking}
            disabled={disabled}
            onValueChange={(value) =>
              void apply(
                current,
                value === "default"
                  ? { kind: "default" }
                  : value === "off"
                    ? { kind: "off" }
                    : { kind: "effort", effort: value },
              )
            }
            options={[
              { value: "default", label: t("models.thinkingDefault") },
              ...(!current.thinking.requiresEffort
                ? [{ value: "off" as const, label: t("model.offThinking") }]
                : []),
              ...current.thinking.efforts.map((value) => ({
                value,
                label: value,
              })),
            ]}
          />
        </div>
      )}
    </div>
  );
}
