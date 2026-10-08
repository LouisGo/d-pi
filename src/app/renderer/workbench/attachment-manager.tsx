import type { RefObject } from "react";
import type {
  Attachment,
  AttachmentStorageReport,
} from "../../../modules/input/contracts/public";
import type { AttachmentIntent } from "../../../modules/input/core/public";
import { useI18n } from "../../../modules/preferences/renderer/public";
import {
  Button,
  Disclosure,
  DisclosureTrigger,
} from "../../../modules/ui/renderer/public";
import { FileIcon, FolderIcon } from "../components/icons/common";
import { Modal } from "../components/ui/modal";
export function AttachmentManager({
  open,
  close,
  returnFocus,
  storageReport,
  sourceFrozen,
  pending,
  importing,
  editorAvailable,
  failed,
  unused,
  active,
  ids,
  run,
  insert,
  openReference,
  move,
  remove,
}: {
  open: boolean;
  close: () => void;
  returnFocus: RefObject<HTMLElement | null>;
  storageReport: AttachmentStorageReport | null;
  sourceFrozen: boolean;
  pending: number;
  importing: number;
  editorAvailable: boolean;
  failed: boolean;
  unused: Attachment[];
  active: (Attachment | undefined)[];
  ids: string[];
  run: (command: AttachmentIntent, add?: boolean) => void;
  insert: (item: Attachment) => void;
  openReference: (id: string) => void;
  move: (index: number, direction: -1 | 1) => void;
  remove: (id: string) => void;
}) {
  const { t } = useI18n();
  return (
    <Modal
      open={open}
      onClose={close}
      returnFocus={returnFocus}
      title={t("attachment.storage")}
      closeLabel={t("attachment.closePreview")}
    >
      <div className="grid gap-4">
        <Disclosure>
          <DisclosureTrigger>{t("attachment.storage")}</DisclosureTrigger>
          <div className="grid gap-2 py-2">
            <p className="muted">{t("attachment.storagePolicy")}</p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="ghost"
                data-attachment-storage-action="check"
                disabled={sourceFrozen || pending > 0 || importing > 0}
                onClick={() => void run({ kind: "check-storage" })}
              >
                {t("attachment.checkStorage")}
              </Button>
              <Button
                variant="ghost"
                data-attachment-storage-action="clean"
                disabled={sourceFrozen || pending > 0 || importing > 0}
                onClick={() => void run({ kind: "clean-storage" })}
              >
                {t("attachment.cleanStorage")}
              </Button>
            </div>
            {storageReport && (
              <div
                data-attachment-storage-report=""
                className="grid gap-2"
                role="status"
                aria-live="polite"
              >
                <p>
                  {t("attachment.storageSummary", {
                    checked: storageReport.checkedObjects,
                    retained: storageReport.retainedObjects,
                    unused: storageReport.unreferencedObjects,
                    remaining: storageReport.remainingObjects,
                  })}
                </p>
                <p>
                  {t("attachment.storageDeleted", {
                    count: storageReport.deletedObjects,
                    bytes: storageReport.deletedBytes,
                  })}
                </p>
                {storageReport.issues.length > 0 && (
                  <>
                    <ul className="grid max-h-40 gap-1 overflow-auto">
                      {storageReport.issues.map((issue) => (
                        <li
                          key={`${issue.attachmentId}:${issue.object}:${issue.digest ?? ""}`}
                          className="break-all"
                        >
                          <strong>{issue.name}</strong> ·{" "}
                          {t(
                            issue.object === "original"
                              ? "attachment.storageOriginal"
                              : "attachment.storageDerived",
                          )}
                          : {t(`attachment.reason.${issue.reason}`)}
                        </li>
                      ))}
                    </ul>
                    <p>{t("attachment.storageReattach")}</p>
                    <Button
                      variant="ghost"
                      disabled={
                        sourceFrozen ||
                        pending > 0 ||
                        importing > 0 ||
                        !editorAvailable ||
                        !!failed
                      }
                      onClick={() => void run({ kind: "choose-import" }, true)}
                    >
                      {t("attachment.add")}
                    </Button>
                  </>
                )}
                {(storageReport.manifestScanIncomplete ||
                  storageReport.referenceScanIncomplete) && (
                  <p>{t("attachment.storageReferencePending")}</p>
                )}
                {storageReport.discoveryPending && (
                  <p>{t("attachment.storageDiscoveryPending")}</p>
                )}
                {storageReport.issuesTruncated && (
                  <p>{t("attachment.storageIssuesTruncated")}</p>
                )}
              </div>
            )}
            {!!unused.length && (
              <Disclosure>
                <DisclosureTrigger>{t("attachment.library")}</DisclosureTrigger>
                <div className="grid max-h-40 gap-2 overflow-auto">
                  {unused.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-2"
                    >
                      <span className="break-all">{item.name}</span>
                      <Button
                        variant="ghost"
                        disabled={sourceFrozen}
                        onClick={() => insert(item)}
                      >
                        {t("attachment.insert")}
                      </Button>
                    </div>
                  ))}
                </div>
              </Disclosure>
            )}
          </div>
        </Disclosure>
        {active.length > 0 && (
          <Disclosure>
            <DisclosureTrigger>{t("attachment.details")}</DisclosureTrigger>
            <ol
              className="grid max-h-40 gap-2 overflow-auto"
              aria-label={t("attachment.add")}
            >
              {active.map((item, index) => (
                <li
                  key={`${ids[index]}:${index}`}
                  className="grid gap-1 rounded-md border border-border p-2"
                >
                  {item ? (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <strong className="flex items-center gap-2 break-all">
                          {(item.source === "reference" ||
                            item.frozenReference) &&
                            (item.referenceKind === "directory" ? (
                              <FolderIcon />
                            ) : (
                              <FileIcon />
                            ))}
                          {item.name}
                          {item.referenceKind === "directory" ? "/" : ""}
                        </strong>
                        <span className="muted">
                          {item.frozenReference
                            ? t("attachment.frozenOnCopy")
                            : item.source === "reference"
                              ? t(
                                  item.referenceKind === "directory"
                                    ? "attachment.directoryAtSend"
                                    : "attachment.readAtSend",
                                )
                              : t(`attachment.${item.status}`)}
                          {item.source !== "reference" && (
                            <> · {Math.ceil(item.byteLength / 1024)} KiB</>
                          )}
                        </span>
                      </div>
                      {item.frozenReference && (
                        <div className="muted">
                          <Disclosure data-selectable>
                            <DisclosureTrigger>
                              {t("attachment.frozenSource")}
                            </DisclosureTrigger>
                            <dl className="grid gap-1 break-all">
                              <dt>{t("attachment.frozenProject")}</dt>
                              <dd>{item.frozenReference.projectPath}</dd>
                              <dt>{t("attachment.frozenPath")}</dt>
                              <dd>{item.frozenReference.path}</dd>
                              <dt>{t("attachment.frozenVersion")}</dt>
                              <dd>{item.frozenReference.version}</dd>
                              <dt>{t("attachment.frozenTime")}</dt>
                              <dd>
                                <time
                                  dateTime={item.frozenReference.capturedAt}
                                >
                                  {item.frozenReference.capturedAt}
                                </time>
                              </dd>
                            </dl>
                          </Disclosure>
                        </div>
                      )}
                      {item.reason && (
                        <p className="failure" role="status">
                          {t(`attachment.reason.${item.reason}`)}
                        </p>
                      )}
                      {!!item.coverageGaps.length && (
                        <p>
                          {item.textOnly
                            ? t("attachment.textOnlyNotice")
                            : t("attachment.coverageGap")}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="ghost"
                          disabled={sourceFrozen || pending > 0}
                          onClick={() => openReference(item.id)}
                        >
                          {t("attachment.preview", { name: item.name })}
                        </Button>
                        {item.status === "failed" && (
                          <Button
                            variant="ghost"
                            disabled={sourceFrozen || pending > 0}
                            onClick={() =>
                              void run({ kind: "retry", id: item.id })
                            }
                          >
                            {t("attachment.retry")}
                          </Button>
                        )}
                        {(item.representation === "pdf-text" ||
                          item.source === "reference") &&
                          !!item.coverageGaps.length &&
                          !item.textOnly && (
                            <Button
                              variant="ghost"
                              disabled={sourceFrozen || pending > 0}
                              onClick={() =>
                                void run({
                                  kind: "set-text-only",
                                  id: item.id,
                                  value: true,
                                })
                              }
                            >
                              {t("attachment.textOnly")}
                            </Button>
                          )}
                        <Button
                          variant="ghost"
                          aria-label={t("attachment.previous", {
                            name: item.name,
                          })}
                          disabled={sourceFrozen || index === 0}
                          onClick={() => move(index, -1)}
                        >
                          {t("attachment.previous", { name: item.name })}
                        </Button>
                        <Button
                          variant="ghost"
                          aria-label={t("attachment.next", { name: item.name })}
                          disabled={sourceFrozen || index === active.length - 1}
                          onClick={() => move(index, 1)}
                        >
                          {t("attachment.next", { name: item.name })}
                        </Button>
                        <Button
                          variant="ghost"
                          aria-label={t("attachment.remove", {
                            name: item.name,
                          })}
                          onClick={() => remove(item.id)}
                        >
                          {t("attachment.remove", { name: item.name })}
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="failure">
                        {t("attachment.missing", { id: ids[index] ?? "" })}
                      </p>
                      <Button
                        variant="ghost"
                        onClick={() => remove(ids[index] ?? "")}
                      >
                        {t("attachment.remove", { name: ids[index] ?? "" })}
                      </Button>
                    </>
                  )}
                </li>
              ))}
            </ol>
          </Disclosure>
        )}
      </div>
    </Modal>
  );
}
