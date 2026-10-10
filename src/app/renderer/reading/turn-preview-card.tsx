import { useLayoutEffect, useState } from "react";
import { useI18n } from "../../../modules/preferences/renderer/public";

function turnRows(node: HTMLElement): HTMLElement[] {
  const rows = [node];
  let sibling = node.nextElementSibling;
  while (
    sibling instanceof HTMLElement &&
    !sibling.matches("[data-conversation-turn]")
  ) {
    rows.push(sibling);
    sibling = sibling.nextElementSibling;
  }
  return rows;
}

function readTurnPreview(node: HTMLElement, fallback: string) {
  const question =
    node.querySelector(":scope > .user-message-bubble")?.textContent ??
    fallback;
  for (const row of turnRows(node)) {
    if (row.dataset.messageRole !== "assistant") continue;
    const reply =
      row.querySelector("[data-assistant-reply]")?.textContent ?? "";
    if (reply.trim()) return { question, reply };
  }
  return { question, reply: "" };
}

/** Only the open card observes its turn; the outline never caches transcript text. */
export function ConversationTurnPreview({
  node,
  number,
  preview,
}: {
  node: HTMLElement;
  number: number;
  preview: string;
}) {
  const [content, setContent] = useState(() => readTurnPreview(node, preview));
  useLayoutEffect(() => {
    let frame: number | null = null;
    const update = () => {
      frame = null;
      const next = readTurnPreview(node, preview);
      setContent((previous) =>
        previous.question === next.question && previous.reply === next.reply
          ? previous
          : next,
      );
    };
    const schedule = () => {
      if (frame === null) frame = requestAnimationFrame(update);
    };
    const bodies = new MutationObserver(schedule);
    const observeRows = () => {
      bodies.disconnect();
      for (const row of turnRows(node))
        bodies.observe(row, {
          childList: true,
          subtree: true,
          characterData: true,
          attributes: true,
          attributeFilter: ["data-message-role", "data-assistant-reply"],
        });
    };
    const structure = new MutationObserver(() => {
      observeRows();
      schedule();
    });
    observeRows();
    if (node.parentElement)
      structure.observe(node.parentElement, { childList: true });
    update();
    return () => {
      bodies.disconnect();
      structure.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [node, preview]);
  return <TurnPreviewCard number={number} {...content} />;
}

/** Offscreen turns read their owner only while the preview is actually open. */
export function WindowTurnPreview({
  number,
  pane,
  read,
}: {
  number: number;
  pane: HTMLElement;
  read: () => { question: string; reply: string };
}) {
  const [content, setContent] = useState(read);
  useLayoutEffect(() => {
    let frame: number | null = null;
    const update = () => {
      frame = null;
      const next = read();
      setContent((previous) =>
        previous.question === next.question && previous.reply === next.reply
          ? previous
          : next,
      );
    };
    const observer = new MutationObserver(() => {
      if (frame === null) frame = requestAnimationFrame(update);
    });
    observer.observe(pane, {
      subtree: true,
      childList: true,
      characterData: true,
    });
    update();
    return () => {
      observer.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [pane, read]);
  return <TurnPreviewCard number={number} {...content} />;
}

/** Overlay presentation for turn preview with single-line question and 3-line reply clamp. */
export function TurnPreviewCard({
  number,
  question,
  reply,
}: {
  number: number;
  question: string;
  reply?: string;
}) {
  const { t } = useI18n();
  const cleanQuestion = question.trim().replace(/\s+/g, " ");
  const cleanReply = reply?.trim() ?? "";

  return (
    <div className="turn-preview">
      <div className="turn-preview-header">
        <span className="turn-preview-number" aria-hidden="true">
          {`#${number}`}
        </span>
        <h3 className="turn-preview-title" title={cleanQuestion || undefined}>
          {cleanQuestion || t("ui.conversation.questionWithoutText")}
        </h3>
      </div>
      {cleanReply ? (
        <p className="turn-preview-description">{cleanReply}</p>
      ) : null}
    </div>
  );
}
