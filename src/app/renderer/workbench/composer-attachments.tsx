import { useQuery } from "@tanstack/react-query";
import type { Attachment } from "../../../modules/input/contracts/public";
import type { AttachmentIntent } from "../../../modules/input/core/public";
import { useI18n } from "../../../modules/preferences/renderer/public";
import { Button } from "../../../modules/ui/renderer/public";
import type {
  AttachmentBridge,
  AttachmentRequest,
} from "../../contracts/attachments";
import { CloseIcon } from "../components/icons/common";
import { FileTypeBadge } from "./file-type-badge";

export function AttachmentStrip({
  items,
  bridge,
  threadId,
  onPreview,
  onRemove,
}: {
  items: Attachment[];
  bridge: AttachmentBridge;
  threadId: AttachmentRequest["threadId"];
  onPreview: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const { t } = useI18n();
  if (!items.length) return null;
  return (
    <div className="attachment-rail">
      {[
        items.filter((item) => item.representation === "image"),
        items.filter((item) => item.representation !== "image"),
      ].map(
        (group, index) =>
          group.length > 0 && (
            <ol
              key={index}
              className="attachment-group"
              aria-label={t("attachment.add")}
            >
              {group.map((item, index) => (
                <li
                  key={`${item.id}:${index}`}
                  className={
                    item.representation === "image"
                      ? "attachment-tile"
                      : "attachment-file-chip"
                  }
                >
                  <Button
                    variant="chip"
                    size={
                      item.representation === "image" ? "thumbnail" : "source"
                    }
                    className={
                      item.representation === "image"
                        ? "w-full h-full"
                        : "min-w-0"
                    }
                    aria-label={t("attachment.preview", { name: item.name })}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => onPreview(item.id)}
                  >
                    {item.representation === "image" ? (
                      <AttachmentThumbnail
                        item={item}
                        bridge={bridge}
                        threadId={threadId}
                      />
                    ) : (
                      <>
                        <FileTypeBadge name={item.name} />
                        <span className="truncate">{item.name}</span>
                        <small>{formatAttachmentSize(item.byteLength)}</small>
                      </>
                    )}
                  </Button>
                  <span className="attachment-remove">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t("attachment.remove", { name: item.name })}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => onRemove(item.id)}
                    >
                      <CloseIcon />
                    </Button>
                  </span>
                </li>
              ))}{" "}
            </ol>
          ),
      )}
    </div>
  );
}

export function AttachmentAttention({
  items,
  ids,
  loading,
  disabled,
  onAction,
  onPreview,
  onRemove,
}: {
  items: (Attachment | undefined)[];
  ids: string[];
  loading: boolean;
  disabled: boolean;
  onAction: (intent: AttachmentIntent) => void;
  onPreview: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const { t } = useI18n();
  return (
    <>
      {items.map((item, index) => {
        if (!item)
          return loading ? null : (
            <div key={ids[index]} role="alert" className="composer-notice">
              <span>{t("attachment.missing", { id: ids[index] ?? "" })}</span>
              <Button
                variant="ghost"
                onClick={() => onRemove(ids[index] ?? "")}
              >
                {t("attachment.remove", { name: ids[index] ?? "" })}
              </Button>
            </div>
          );
        if (
          !item.reason &&
          !item.coverageGaps.length &&
          item.status !== "failed"
        )
          return null;
        return (
          <div
            key={`${item.id}:${index}`}
            className="composer-notice"
            role={item.status === "failed" ? "alert" : "status"}
          >
            <strong>{item.name}</strong>
            {item.reason && (
              <span>{t(`attachment.reason.${item.reason}`)}</span>
            )}
            {!!item.coverageGaps.length && (
              <span>
                {t(
                  item.textOnly
                    ? "attachment.textOnlyNotice"
                    : "attachment.coverageGap",
                )}
              </span>
            )}
            <Button
              variant="ghost"
              disabled={disabled}
              onClick={() => onPreview(item.id)}
            >
              {t("attachment.preview", { name: item.name })}
            </Button>
            {item.status === "failed" && (
              <Button
                variant="ghost"
                disabled={disabled}
                onClick={() => onAction({ kind: "retry", id: item.id })}
              >
                {t("attachment.retry")}
              </Button>
            )}
            {!!item.coverageGaps.length &&
              !item.textOnly &&
              (item.representation === "pdf-text" ||
                item.source === "reference") && (
                <Button
                  variant="ghost"
                  disabled={disabled}
                  onClick={() =>
                    onAction({
                      kind: "set-text-only",
                      id: item.id,
                      value: true,
                    })
                  }
                >
                  {t("attachment.textOnly")}
                </Button>
              )}
          </div>
        );
      })}
    </>
  );
}

function formatAttachmentSize(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.ceil(bytes / 1024)} KiB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentThumbnail({
  item,
  bridge,
  threadId,
}: {
  item: Attachment;
  bridge: AttachmentBridge;
  threadId: AttachmentRequest["threadId"];
}) {
  const preview = useQuery({
    queryKey: [
      "attachment-thumbnail",
      threadId,
      item.id,
      item.inputDigest ?? item.capturedAt,
    ],
    queryFn: () =>
      bridge.request({
        kind: "preview",
        threadId,
        id: item.id,
        traceId: crypto.randomUUID(),
      }),
    enabled: item.status === "ready",
    networkMode: "always",
    retry: false,
    gcTime: 60000,
  });
  return preview.data?.kind === "image" ? (
    <img src={preview.data.dataUrl} alt={item.name} />
  ) : (
    <span className="truncate">{item.name}</span>
  );
}
