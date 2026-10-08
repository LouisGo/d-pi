import type { Editor } from "@tiptap/core";
import { useStore } from "zustand";
import type { AttachmentImports } from "../../../modules/input/renderer/public";
import { useI18n } from "../../../modules/preferences/renderer/public";
import { Button } from "../../../modules/ui/renderer/public";

export function AttachmentImportBatches({
  imports,
  editor,
  isCurrent,
  frozen,
}: {
  imports: AttachmentImports;
  editor: Editor | null;
  isCurrent: () => boolean;
  frozen: boolean;
}) {
  const { t } = useI18n();
  const batches = useStore(imports.stateStore, (state) => state.batches);
  const admissionFailure = useStore(
    imports.stateStore,
    (state) => state.admissionFailure,
  );
  const disabled =
    frozen || !editor || !editor.isEditable || editor.view.composing;
  return (
    <>
      {admissionFailure && (
        <p className="failure" role="alert">
          {t("attachment.import.budget")}
        </p>
      )}
      {batches.map((batch) => {
        const settled = batch.jobs.every((job) => job.adoption === "settled");
        const pending = batch.jobs.some((job) =>
          ["queued", "reading", "preparing", "cancelling"].includes(job.phase),
        );
        const ready = batch.jobs.some(
          (job) => job.phase === "ready" && job.adoption === "pending",
        );
        const partial = batch.jobs.some((job) => job.phase === "failed");
        return (
          <div
            key={batch.id}
            className="grid gap-2 rounded-md border border-border p-2"
            aria-label={t("attachment.import.batch")}
          >
            <ol className="grid gap-2">
              {batch.jobs.map((job) => (
                <li key={job.id} className="grid gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong
                      className="min-w-0 max-w-64 truncate"
                      title={job.name}
                    >
                      {job.name}
                    </strong>
                    <span className="muted" role="status">
                      {job.phase === "ready" && job.adoption !== "pending"
                        ? t(
                            job.adoption === "settled"
                              ? "attachment.import.added"
                              : "attachment.import.settling",
                          )
                        : t(`attachment.import.${job.phase}`)}
                    </span>
                    {job.phase === "reading" && (
                      <progress
                        aria-label={t("attachment.import.reading")}
                        value={job.loaded}
                        max={Math.max(1, job.total)}
                      />
                    )}
                    {job.phase === "failed" &&
                      job.reason !== "source-too-large" && (
                        <Button
                          variant="ghost"
                          disabled={disabled}
                          onClick={() => {
                            if (isCurrent()) imports.retry(job.id);
                          }}
                        >
                          {t("attachment.retry")}
                        </Button>
                      )}
                    {job.reason &&
                      job.phase === "ready" &&
                      job.adoption === "settling" && (
                        <Button
                          variant="ghost"
                          disabled={disabled}
                          onClick={() => {
                            if (isCurrent()) imports.retry(job.id);
                          }}
                        >
                          {t("attachment.import.retrySettlement")}
                        </Button>
                      )}
                    {job.reason && job.phase === "cancelling" && (
                      <Button
                        variant="ghost"
                        onClick={() => {
                          if (isCurrent()) imports.cancel(job.id);
                        }}
                      >
                        {t("attachment.import.retrySettlement")}
                      </Button>
                    )}
                    {job.adoption !== "settled" &&
                      !(
                        job.phase === "ready" && job.adoption !== "pending"
                      ) && (
                        <Button
                          variant="ghost"
                          onClick={() => {
                            if (isCurrent()) imports.cancel(job.id, true);
                          }}
                        >
                          {t("attachment.import.cancel", { name: job.name })}
                        </Button>
                      )}
                  </div>
                  {job.reason && (
                    <p className="failure" role="alert">
                      {job.reason === "read-or-transport-failed"
                        ? t("attachment.transportFailed")
                        : t(`attachment.reason.${job.reason}`)}
                    </p>
                  )}
                </li>
              ))}
            </ol>
            {partial && ready && (
              <p className="muted">{t("attachment.import.partial")}</p>
            )}
            <div className="flex flex-wrap gap-2">
              {ready && !pending && (
                <Button
                  variant="ghost"
                  disabled={disabled}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    if (isCurrent()) imports.insertReady(batch.id);
                  }}
                >
                  {t(
                    partial
                      ? "attachment.import.insertSubset"
                      : "attachment.import.insertReady",
                  )}
                </Button>
              )}
              {!settled && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    if (isCurrent()) imports.cancel(batch.id, true);
                  }}
                >
                  {t("attachment.import.cancelBatch")}
                </Button>
              )}
              {settled && (
                <Button
                  variant="ghost"
                  onClick={() => imports.dismissSettled(batch.id)}
                >
                  {t("attachment.import.dismiss")}
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}
