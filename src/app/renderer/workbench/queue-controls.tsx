import { useState } from "react";
import { useStore } from "zustand";
import { Button } from "@/components/ui/button";
import type { QueueAction } from "../../../modules/execution/contracts/public";
import { QueueTextSchema } from "../../../modules/execution/contracts/public";
import type { RuntimeModel } from "../../../modules/execution/renderer/public";
import { useI18n } from "../../../modules/preferences/renderer/public";

export function QueueControls({ model }: { model: RuntimeModel }) {
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
  if (!queue) return null;
  const pending = operation?.status === "pending";
  const unknown = operation?.status === "unknown";
  const unreconciled = unknown && !operation.reconciled;
  const locked = !available || pending || unreconciled;
  const send = (command: QueueAction) => {
    void model.manageQueue(command);
  };
  return (
    <details className="runtime-source" aria-label={t("queue.heading")}>
      <summary>
        {t("queue.heading")} · {queue.items.length + queue.hiddenCount}
      </summary>
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
        const siblings = queue.items.filter((item) => item.kind === entry.kind);
        const index = siblings.findIndex((item) => item.id === entry.id);
        const editing =
          queue.editing?.entryId === entry.id ? queue.editing : null;
        const editActive = !!queue.editing;
        return (
          <section
            key={entry.id}
            data-queue-entry={entry.id}
            className="flex flex-col gap-2"
          >
            <strong>
              {t(
                entry.kind === "steering" ? "queue.steering" : "queue.followUp",
              )}{" "}
              · {index + 1}
            </strong>
            <p className="whitespace-pre-wrap break-words">{entry.text}</p>
            {entry.truncated && <p className="muted">{t("queue.truncated")}</p>}
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
                disabled={locked}
                inputDisabled={!available || unreconciled}
              />
            ) : (
              <div className="flex flex-wrap gap-2">
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
                  variant="ghost"
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
              </div>
            )}
          </section>
        );
      })}
    </details>
  );
}

function QueueEditor({
  model,
  entryId,
  revision,
  draftText,
  disabled,
  inputDisabled,
}: {
  model: RuntimeModel;
  entryId: string;
  revision: number;
  draftText: string;
  disabled: boolean;
  inputDisabled: boolean;
}) {
  const { t } = useI18n();
  // Immediate typing belongs to this input. Reopening initializes from the native
  // instance's acknowledged draft; delayed earlier acknowledgements do not undo typing.
  const [text, setText] = useState(draftText);
  const fitsBudget = QueueTextSchema.safeParse(text).success;
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={`queue-edit-${entryId}`}>{t("queue.editLabel")}</label>
      <textarea
        id={`queue-edit-${entryId}`}
        className="native-answer"
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
            });
        }}
      />
      {!fitsBudget && (
        <p role="alert" className="failure">
          {t("queue.contentTooLarge")}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          data-queue-action="save-edit"
          disabled={disabled || !text.trim() || !fitsBudget}
          onClick={() =>
            void model.manageQueue({
              action: "save-edit",
              entryId,
              revision,
              text,
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
      </div>
    </div>
  );
}
