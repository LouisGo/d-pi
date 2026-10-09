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
  assistantReply = false,
}: {
  text: string;
  streaming?: boolean;
  raw?: boolean;
  assistantReply?: boolean;
  position?: ReadingBodyBinding | undefined;
}) {
  return raw ? (
    <pre className="reading-body" data-reading-text>
      {text}
    </pre>
  ) : (
    <div
      className="reading-body"
      data-reading-text
      data-assistant-reply={assistantReply ? "" : undefined}
    >
      <Markdown text={text} streaming={streaming} />
    </div>
  );
}
