import { useId, useMemo, useState } from "react";
import { useI18n } from "../../../modules/preferences/renderer/public";
import { Button } from "../../../modules/ui/renderer/public";
import { Markdown } from "./markdown";
import { readingSegments } from "./reading-segments";

export function ReadingBody({
  text,
  streaming = false,
  raw = false,
}: {
  text: string;
  streaming?: boolean;
  raw?: boolean;
}) {
  const { t } = useI18n();
  const regionId = useId();
  const segments = useMemo(() => readingSegments(text), [text]);
  const [choice, setChoice] = useState(0);
  const page = Math.min(choice, Math.max(0, segments.length - 1));
  // Apply shrink immediately; later appends must not restore an invalid old choice.
  if (choice !== page) setChoice(page);
  if (segments.length <= 1)
    return raw ? (
      <pre>{text}</pre>
    ) : (
      <Markdown text={text} streaming={streaming} />
    );
  const segment = segments[page];
  if (!segment) return null;
  return (
    <div
      className="reading-segments"
      data-long-reading="true"
      data-reading-segment={page}
    >
      <p className="muted">{t("ui.reading.originalSegments")}</p>
      <div className="reading-segment-controls">
        <Button
          variant="ghost"
          aria-controls={regionId}
          disabled={page === 0}
          onClick={() => setChoice(page - 1)}
        >
          {t("ui.reading.previous")}
        </Button>
        <span>
          {t("ui.reading.segment", {
            current: page + 1,
            total: segments.length,
          })}
        </span>
        <Button
          variant="ghost"
          aria-controls={regionId}
          disabled={page === segments.length - 1}
          onClick={() => setChoice(page + 1)}
        >
          {t("ui.reading.next")}
        </Button>
      </div>
      <pre
        key={page}
        id={regionId}
        tabIndex={0}
        aria-label={t("ui.reading.segment", {
          current: page + 1,
          total: segments.length,
        })}
        className="reading-segment-text"
        data-reading-text
      >
        {text.slice(segment.start, segment.end)}
      </pre>
    </div>
  );
}
