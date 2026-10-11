import type { Editor } from "@tiptap/core";
import { useEffect, useState } from "react";
import { useStore } from "zustand";
import type { AttachmentImports } from "../../../modules/input/renderer/public";
import { useI18n } from "../../../modules/preferences/renderer/public";
import { Button, LoadingIndicator } from "../../../modules/ui/renderer/public";

export function AttachmentImportBatches({
  imports,
  editor,
  isCurrent,
  frozen,
  onPreview,
  activeIds,
}: {
  imports: AttachmentImports;
  editor: Editor | null;
  isCurrent: () => boolean;
  frozen: boolean;
  onPreview: (id: string) => void;
  activeIds: readonly string[];
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
        // Settlement records resource ownership, not current draft adoption.
        // Success belongs to the actual tile/token; reports only keep work that
        // still needs attention. Hiding a report never cancels settlement.
        const jobs = batch.jobs.filter(
          (job) =>
            job.adoption !== "settled" &&
            (job.reason ||
              job.phase === "failed" ||
              (job.phase === "ready" && job.adoption === "pending")),
        );

        const cancellable = jobs.some((job) => job.adoption === "pending");
        const pending = batch.jobs.some((job) =>
          ["queued", "reading", "preparing", "cancelling"].includes(job.phase),
        );
        if (!jobs.length)
          return (
            <PendingImportFeedback
              key={batch.id}
              pending={pending}
              identity={batch.id}
              onCancel={() => {
                if (isCurrent()) imports.cancel(batch.id, true);
              }}
            />
          );
        const ready = batch.jobs.some(
          (job) => job.phase === "ready" && job.adoption === "pending",
        );
        const partial = batch.jobs.some((job) => job.phase === "failed");
        return (
          <div
            key={batch.id}
            className="composer-import-notice"
            aria-label={t("attachment.import.batch")}
          >
            <PendingImportFeedback
              pending={pending}
              identity={batch.id}
              onCancel={() => {
                if (isCurrent()) imports.cancel(batch.id, true);
              }}
            />
            <ol className="composer-import-jobs">
              {jobs.map((job) => (
                <li key={job.id} className="composer-import-job">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="composer-import-name" title={job.name}>
                      {job.name}
                    </span>
                    <span className="muted" role="status">
                      {job.phase === "ready" && job.adoption !== "pending"
                        ? t("attachment.import.settlementFailed")
                        : t(`attachment.import.${job.phase}`)}
                    </span>
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
                    {job.attachmentIds
                      .filter(
                        (id) =>
                          job.adoption === "pending" || activeIds.includes(id),
                      )
                      .map((id) => (
                        <Button
                          key={id}
                          variant="ghost"
                          aria-label={t("attachment.preview", {
                            name: job.name,
                          })}
                          onClick={() => {
                            if (isCurrent()) onPreview(id);
                          }}
                        >
                          {t("attachment.previewAction")}
                        </Button>
                      ))}
                    {job.phase === "failed" &&
                      job.reason === "pdf-coverage-gap" && (
                        <Button
                          variant="ghost"
                          disabled={disabled}
                          onClick={() => {
                            if (isCurrent())
                              void imports.confirmTextOnly(job.id);
                          }}
                        >
                          {t("attachment.textOnly")}
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
                          aria-label={t("attachment.import.cancel", {
                            name: job.name,
                          })}
                          onClick={() => {
                            if (isCurrent()) imports.cancel(job.id, true);
                          }}
                        >
                          {t("attachment.import.cancelAction")}
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
              {cancellable && jobs.length > 1 && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    if (isCurrent()) imports.cancel(batch.id, true);
                  }}
                >
                  {t("attachment.import.cancelBatch")}
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}

function PendingImportFeedback({
  pending,
  identity,
  onCancel,
}: {
  pending: boolean;
  identity: string;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    setVisible(false);
    if (!pending) return;
    const timer = setTimeout(() => setVisible(true), 600);
    return () => clearTimeout(timer);
  }, [pending, identity]);
  if (!pending || !visible) return null;
  return (
    <div className="flex items-center gap-2">
      <LoadingIndicator
        pending
        label={t("attachment.import.batch")}
        identity={identity}
      />
      <Button variant="ghost" onClick={onCancel}>
        {t("attachment.import.cancelAction")}
      </Button>
    </div>
  );
}
