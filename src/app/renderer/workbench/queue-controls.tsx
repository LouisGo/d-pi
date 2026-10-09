import { useState } from "react";
import { useStore } from "zustand";
import type {
  QueueAction,
  QueueSnapshot,
} from "../../../modules/execution/contracts/public";
import { QueueTextSchema } from "../../../modules/execution/contracts/public";
import type { RuntimeModel } from "../../../modules/execution/renderer/public";
import { useI18n } from "../../../modules/preferences/renderer/public";
import {
  ActionGroup,
  Badge,
  Button,
  Checkbox,
  Disclosure,
  DisclosureTrigger,
  TextArea,
} from "../../../modules/ui/renderer/public";

export function QueueControls({
  model,
  hiddenEmpty = false,
  placement = "inspection",
}: {
  model: RuntimeModel;
  hiddenEmpty?: boolean;
  placement?: "inspection" | "composer";
}) {
  const { t } = useI18n();
  const queue = useStore(
    model.stateStore,
    (state) => state.view?.control?.queueState,
  );
  const operation = useStore(
    model.stateStore,
    (state) => state.view?.queueOperation,
  );
  const available = useStore(
    model.stateStore,
    (state) => state.view?.phase === "ready" && state.view.trusted,
  );
  const paused = useStore(
    model.stateStore,
    (state) => state.view?.control?.paused === true,
  );
  const stopping = useStore(
    model.stateStore,
    (state) => state.view?.control?.stopping === true,
  );
  if (
    !queue ||
    (hiddenEmpty &&
      !queue.items.length &&
      !queue.hiddenCount &&
      !queue.editing &&
      (!operation || operation.status === "acknowledged"))
  )
    return null;
  const pending = operation?.status === "pending";
  const unknown = operation?.status === "unknown";
  const unreconciled = unknown && !operation.reconciled;
  const locked = !available || pending || unreconciled;
  const send = (command: QueueAction) => {
    void model.manageQueue(command);
  };
  return (
    <div
      className={placement === "composer" ? "composer-queue" : "runtime-source"}
    >
      {placement === "composer" && paused && (
        <Button
          variant="ghost"
          aria-label={t("composer.resumeQueue")}
          disabled={!available || stopping || locked}
          onClick={() => void model.control("continue")}
        >
          {t("composer.resumeQueue")}
        </Button>
      )}
      <Disclosure
        variant={placement === "composer" ? "inline" : "plain"}
        aria-label={t("queue.heading")}
      >
        <DisclosureTrigger>
          {t("queue.heading")} · {queue.items.length + queue.hiddenCount}
        </DisclosureTrigger>
        <p className="muted">{t("queue.batchNotice")}</p>
        {pending && <p role="status">{t("queue.pending")}</p>}
        {unknown && (
          <p
            role={unreconciled ? "alert" : "status"}
            className={unreconciled ? "failure" : "muted"}
          >
            {t(unreconciled ? "queue.unknown" : "queue.reconciled")}
          </p>
        )}
        {operation?.status === "failed" && (
          <p role="alert" className="failure">
            {t("queue.failed", { code: operation.code ?? "unknown" })}
          </p>
        )}
        {(unknown || operation?.status === "failed") && (
          <Button variant="ghost" onClick={() => void model.act("inspect")}>
            {t("queue.inspect")}
          </Button>
        )}
        {queue.coverage === "limited" && (
          <p role="status" className="muted">
            {t("queue.limited")}
          </p>
        )}
        {queue.hiddenCount > 0 && (
          <p className="muted">
            {t("queue.hidden", { count: queue.hiddenCount })}
          </p>
        )}
        {!queue.items.length && <p>{t("queue.empty")}</p>}
        {queue.items.map((entry) => {
          const siblings = queue.items.filter(
            (item) => item.kind === entry.kind,
          );
          const index = siblings.findIndex((item) => item.id === entry.id);
          const editing =
            queue.editing?.entryId === entry.id ? queue.editing : null;
          const editActive = !!queue.editing;
          return (
            <section
              key={entry.id}
              data-queue-entry={entry.id}
              className="queue-entry"
            >
              <strong>
                {t(
                  entry.kind === "steering"
                    ? "queue.steering"
                    : "queue.followUp",
                )}{" "}
                · <Badge>{index + 1}</Badge>
              </strong>
              <p data-selectable className="whitespace-pre-wrap break-words">
                {entry.text}
              </p>
              {!!entry.imageCount && (
                <p className="muted">
                  {t("queue.images", { count: entry.imageCount })}
                </p>
              )}
              {entry.truncated && (
                <p className="muted">{t("queue.truncated")}</p>
              )}
              {!entry.editable && !entry.truncated && (
                <p className="muted">{t("queue.contentReadOnly")}</p>
              )}
              {editing ? (
                <QueueEditor
                  key={entry.id}
                  model={model}
                  entryId={entry.id}
                  revision={queue.revision}
                  draftText={editing.draftText}
                  images={entry.images ?? []}
                  retainedImageIds={editing.retainedImageIds}
                  disabled={locked}
                  inputDisabled={!available || unreconciled}
                />
              ) : (
                <ActionGroup>
                  <Button
                    data-queue-action="begin-edit"
                    variant="ghost"
                    disabled={locked || editActive || !entry.editable}
                    onClick={() =>
                      send({
                        action: "begin-edit",
                        entryId: entry.id,
                        revision: queue.revision,
                      })
                    }
                  >
                    {t("queue.edit")}
                  </Button>
                  <Button
                    data-queue-action="delete"
                    variant="destructive"
                    disabled={locked || editActive}
                    onClick={() =>
                      send({
                        action: "delete",
                        entryId: entry.id,
                        revision: queue.revision,
                      })
                    }
                  >
                    {t("queue.delete")}
                  </Button>
                  <Button
                    data-queue-action="move-up"
                    variant="ghost"
                    disabled={locked || editActive || index === 0}
                    onClick={() =>
                      send({
                        action: "move",
                        entryId: entry.id,
                        revision: queue.revision,
                        toIndex: index - 1,
                      })
                    }
                  >
                    {t("queue.up")}
                  </Button>
                  <Button
                    data-queue-action="move-down"
                    variant="ghost"
                    disabled={
                      locked ||
                      editActive ||
                      index === siblings.length - 1 ||
                      queue.hiddenCount > 0
                    }
                    onClick={() =>
                      send({
                        action: "move",
                        entryId: entry.id,
                        revision: queue.revision,
                        toIndex: index + 1,
                      })
                    }
                  >
                    {t("queue.down")}
                  </Button>
                </ActionGroup>
              )}
            </section>
          );
        })}
      </Disclosure>
    </div>
  );
}

function QueueEditor({
  model,
  entryId,
  revision,
  draftText,
  images,
  retainedImageIds,
  disabled,
  inputDisabled,
}: {
  model: RuntimeModel;
  entryId: string;
  revision: number;
  draftText: string;
  images: NonNullable<QueueSnapshot["items"][number]["images"]>;
  retainedImageIds: string[] | undefined;
  disabled: boolean;
  inputDisabled: boolean;
}) {
  const { t } = useI18n();
  // Immediate typing belongs to this input. Reopening initializes from the native
  // instance's acknowledged draft; delayed earlier acknowledgements do not undo typing.
  const [text, setText] = useState(draftText);
  const [retained, setRetained] = useState(
    retainedImageIds ?? images.map((image) => image.id),
  );
  const imageSelection = images.length ? { retainedImageIds: retained } : {};
  const fitsBudget = QueueTextSchema.safeParse(text).success;
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={`queue-edit-${entryId}`}>{t("queue.editLabel")}</label>
      <TextArea
        id={`queue-edit-${entryId}`}
        className="my-2.5 block"
        data-native-answer
        value={text}
        disabled={inputDisabled}
        onChange={(event) => {
          const next = event.target.value;
          setText(next);
          if (QueueTextSchema.safeParse(next).success)
            void model.manageQueue({
              action: "update-edit",
              entryId,
              revision,
              text: next,
              ...imageSelection,
            });
        }}
      />
      {images.map((image, index) => (
        <label key={image.id} className="flex items-center gap-2">
          <Checkbox
            checked={retained.includes(image.id)}
            disabled={inputDisabled}
            onChange={(event) => {
              const next = event.target.checked
                ? [...retained, image.id]
                : retained.filter((id) => id !== image.id);
              setRetained(next);
              if (fitsBudget)
                void model.manageQueue({
                  action: "update-edit",
                  entryId,
                  revision,
                  text,
                  retainedImageIds: next,
                });
            }}
          />
          {t("queue.retainImage", {
            index: index + 1,
            mimeType: image.mimeType,
          })}
        </label>
      ))}
      {!fitsBudget && (
        <p role="alert" className="failure">
          {t("queue.contentTooLarge")}
        </p>
      )}
      <ActionGroup>
        <Button
          data-queue-action="save-edit"
          disabled={
            disabled || (!text.trim() && !retained.length) || !fitsBudget
          }
          onClick={() =>
            void model.manageQueue({
              action: "save-edit",
              entryId,
              revision,
              text,
              ...imageSelection,
            })
          }
        >
          {t("queue.save")}
        </Button>
        <Button
          data-queue-action="cancel-edit"
          variant="ghost"
          disabled={disabled}
          onClick={() =>
            void model.manageQueue({ action: "cancel-edit", entryId, revision })
          }
        >
          {t("queue.cancel")}
        </Button>
      </ActionGroup>
    </div>
  );
}
