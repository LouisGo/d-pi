import type { ReadingPositions } from "../../../modules/conversation/core/public";
import { Markdown } from "./markdown";

export interface ReadingBodyBinding {
  positions: ReadingPositions;
  key: string;
}

/** The owning ReadingPane retains one continuous position for the whole source. */
export function ReadingBody({
  text,
  streaming = false,
  raw = false,
}: {
  text: string;
  streaming?: boolean;
  raw?: boolean;
  position?: ReadingBodyBinding | undefined;
}) {
  return raw ? (
    <pre className="reading-body" data-reading-text>
      {text}
    </pre>
  ) : (
    <div className="reading-body" data-reading-text>
      <Markdown text={text} streaming={streaming} />
    </div>
  );
}
