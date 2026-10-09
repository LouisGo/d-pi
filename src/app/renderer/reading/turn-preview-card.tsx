import { useI18n } from "../../../modules/preferences/renderer/public";

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
