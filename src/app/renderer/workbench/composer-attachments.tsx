import { useQuery } from "@tanstack/react-query";
import type { Attachment } from "../../../modules/input/contracts/public";
import { useI18n } from "../../../modules/preferences/renderer/public";
import { Button } from "../../../modules/ui/renderer/public";
import type {
  AttachmentBridge,
  AttachmentRequest,
} from "../../contracts/attachments";
import { CloseIcon } from "../components/icons/common";

export function AttachmentStrip({
  items,
  bridge,
  threadId,
  onPreview,
  onRemove,
  disabled = false,
}: {
  items: Attachment[];
  bridge: AttachmentBridge;
  threadId: AttachmentRequest["threadId"];
  onPreview: (id: string) => void;
  onRemove: (id: string) => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  if (!items.length) return null;
  return (
    <div className="attachment-rail">
      <ol className="attachment-group" aria-label={t("attachment.add")}>
        {items.map((item) => {
          const notice = item.reason
            ? t(`attachment.reason.${item.reason}`)
            : item.status === "preparing"
              ? t("attachment.preparing")
              : null;
          return (
            <li key={item.id} className="attachment-tile">
              <Button
                variant="chip"
                size="thumbnail"
                className="w-full h-full"
                aria-label={[
                  t("attachment.preview", { name: item.name }),
                  notice,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                title={[item.name, notice].filter(Boolean).join(" · ")}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onPreview(item.id)}
              >
                <AttachmentThumbnail
                  item={item}
                  bridge={bridge}
                  threadId={threadId}
                />
              </Button>
              {notice && (
                <span
                  className="attachment-tile-status"
                  data-status={item.status}
                  role="status"
                >
                  {notice}
                </span>
              )}
              <span className="attachment-remove">
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={disabled}
                  aria-label={t("attachment.remove", { name: item.name })}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onRemove(item.id)}
                >
                  <CloseIcon />
                </Button>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Only a missing manifest needs a separate notice; known status lives on its node/tile. */
export function AttachmentAttention({
  ids,
  loading,
  disabled,
  onRemove,
}: {
  ids: string[];
  loading: boolean;
  disabled: boolean;
  onRemove: (id: string) => void;
}) {
  const { t } = useI18n();
  if (loading) return null;
  return (
    <>
      {ids.map((id) => (
        <div key={id} role="alert" className="composer-notice">
          <span>{t("attachment.missing", { id })}</span>
          <Button
            variant="ghost"
            disabled={disabled}
            onClick={() => onRemove(id)}
          >
            {t("attachment.remove", { name: id })}
          </Button>
        </div>
      ))}
    </>
  );
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
