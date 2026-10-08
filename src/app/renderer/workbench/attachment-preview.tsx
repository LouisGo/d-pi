import { useEffect, useId, useRef, useState } from "react";
import type {
  Attachment,
  AttachmentPreview,
} from "../../../modules/input/contracts/public";
import { useI18n } from "../../../modules/preferences/renderer/public";
import { Button, Slider } from "../../../modules/ui/renderer/public";
export function AttachmentPreviewDialog({
  item,
  content,
  close,
}: {
  item: Attachment;
  content: AttachmentPreview;
  close: () => void;
}) {
  const { t } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const [zoom, setZoom] = useState(100);
  const [width, setWidth] = useState<number>();
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  function closeDialog() {
    // Release native modal focus before the parent restores the editor bookmark.
    dialog.current?.close();
    close();
  }
  return (
    <dialog
      ref={dialog}
      onCancel={(event) => {
        event.preventDefault();
        closeDialog();
      }}
      aria-labelledby={headingId}
      className="attachment-preview-dialog"
    >
      <div className="flex items-center justify-between gap-4">
        <h2 id={headingId} className="break-all">
          {item.name}
        </h2>
        <Button variant="ghost" autoFocus onClick={closeDialog}>
          {t("attachment.closePreview")}
        </Button>
      </div>
      {content.kind === "image" && (
        <>
          <label className="flex items-center gap-2">
            {t("attachment.zoom")}
            <Slider
              min="25"
              max="300"
              step="25"
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
            />
            {zoom}%
          </label>
          <div className="attachment-preview-content">
            <img
              className="max-w-none"
              src={content.dataUrl}
              alt={item.name}
              width={width ? (width * zoom) / 100 : undefined}
              onLoad={(event) => setWidth(event.currentTarget.naturalWidth)}
            />
          </div>
        </>
      )}
      {content.kind === "text" && (
        <>
          <pre className="attachment-preview-content whitespace-pre-wrap">
            {content.text}
          </pre>
          {content.truncated && (
            <p role="status">{t("attachment.previewTruncated")}</p>
          )}
        </>
      )}
      {content.kind === "unavailable" && (
        <p role="alert">{t(`attachment.reason.${content.reason}`)}</p>
      )}
    </dialog>
  );
}
