import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type {
  HistoryBridge,
  HistoryCursor,
  HistoryEntry,
  HistoryImage,
} from "../../../modules/conversation/contracts/public";
import { nativeImageQuery } from "../../../modules/conversation/core/public";
import { useI18n } from "../../../modules/preferences/renderer/public";
import { Button, LoadingIndicator } from "../../../modules/ui/renderer/public";
import { FileIcon } from "../components/icons/common";
import { Modal } from "../components/ui/modal";

type Preview = { name: string; image?: string; text?: string };
export function MessageMedia({
  entry,
  bridge,
  threadId,
}: {
  entry: HistoryEntry;
  bridge: HistoryBridge;
  threadId: string;
}) {
  const { t } = useI18n();
  const [preview, setPreview] = useState<Preview | null>(null);
  const returnFocus = useRef<HTMLButtonElement | null>(null);
  if (!entry.images?.length && !entry.files?.length) return null;
  const open = (value: Preview, button: HTMLButtonElement) => {
    returnFocus.current = button;
    setPreview(value);
  };
  return (
    <>
      <div className="message-media" data-message-media>
        {entry.images?.map((image) => (
          <ImageTile
            key={JSON.stringify([image.index, image.digest])}
            bridge={bridge}
            threadId={threadId}
            cursor={entry.mediaCursor}
            recordId={entry.id}
            image={image}
            onOpen={open}
          />
        ))}
        {entry.files?.map((file, index) => (
          <div
            className="message-file"
            key={JSON.stringify([file.name, index])}
          >
            <Button
              variant="chip"
              title={t("attachment.preview", { name: file.name })}
              onClick={(event) =>
                open(
                  {
                    name: file.name,
                    ...(file.start !== undefined &&
                    file.end !== undefined &&
                    file.start <= file.end &&
                    file.end <= entry.text.length
                      ? { text: entry.text.slice(file.start, file.end) }
                      : {}),
                  },
                  event.currentTarget,
                )
              }
            >
              <FileIcon />
              <span className="message-file-name">{file.name}</span>
            </Button>
          </div>
        ))}
      </div>
      <Modal
        open={preview !== null}
        onClose={() => setPreview(null)}
        title={preview?.name ?? ""}
        closeLabel={t("attachment.closePreview")}
        returnFocus={returnFocus}
      >
        {preview?.image ? (
          <img
            className="message-image-preview"
            src={preview.image}
            alt={preview.name}
          />
        ) : preview?.text !== undefined ? (
          <pre className="message-file-preview" data-selectable>
            {preview.text}
          </pre>
        ) : (
          <p>{t("ui.conversation.mediaUnavailable")}</p>
        )}
      </Modal>
    </>
  );
}

function ImageTile({
  bridge,
  threadId,
  cursor,
  recordId,
  image,
  onOpen,
}: {
  bridge: HistoryBridge;
  threadId: string;
  cursor?: HistoryCursor | undefined;
  recordId: string;
  image: HistoryImage;
  onOpen: (preview: Preview, button: HTMLButtonElement) => void;
}) {
  const { t } = useI18n();
  const node = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const element = node.current;
    if (!element) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => setVisible(entries.some((entry) => entry.isIntersecting)),
      { root: element.closest("[data-reading-pane]"), rootMargin: "200px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const name =
    image.name ?? t("ui.conversation.imageNumber", { number: image.index + 1 });
  return (
    <div className="message-image-tile" ref={node}>
      {visible && cursor ? (
        <LoadedImage
          bridge={bridge}
          threadId={threadId}
          cursor={cursor}
          recordId={recordId}
          image={image}
          name={name}
          onOpen={onOpen}
        />
      ) : (
        <ImagePlaceholder name={name} unavailable={!cursor} />
      )}
    </div>
  );
}
function ImagePlaceholder({
  name,
  unavailable = false,
}: {
  name: string;
  unavailable?: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className="message-image-placeholder" title={name}>
      {unavailable ? (
        <span>{t("ui.conversation.mediaUnavailable")}</span>
      ) : (
        <LoadingIndicator pending label={t("app.loading")} />
      )}
    </div>
  );
}
function LoadedImage({
  bridge,
  threadId,
  cursor,
  recordId,
  image,
  name,
  onOpen,
}: {
  bridge: HistoryBridge;
  threadId: string;
  cursor: HistoryCursor;
  recordId: string;
  image: HistoryImage;
  name: string;
  onOpen: (preview: Preview, button: HTMLButtonElement) => void;
}) {
  const { t } = useI18n();
  const query = useQuery(
    nativeImageQuery(bridge, threadId, cursor, recordId, image.index, () =>
      crypto.randomUUID(),
    ),
  );
  const [broken, setBroken] = useState(false);
  if (query.isPending) return <ImagePlaceholder name={name} />;
  const reply = query.data;
  if (query.isError || reply?.kind !== "image" || broken)
    return <ImagePlaceholder name={name} unavailable />;
  return (
    <Button
      variant="chip"
      size="thumbnail"
      title={t("attachment.preview", { name })}
      aria-label={t("attachment.preview", { name })}
      onClick={(event) =>
        onOpen({ name, image: reply.dataUrl }, event.currentTarget)
      }
    >
      <img
        src={reply.dataUrl}
        alt={name}
        decoding="async"
        onError={() => setBroken(true)}
      />
    </Button>
  );
}
