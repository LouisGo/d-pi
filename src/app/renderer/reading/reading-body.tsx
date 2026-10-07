import {
  useCallback,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useStore } from "zustand";
import type { ReadingPositions } from "../../../modules/conversation/core/public";
import { useI18n } from "../../../modules/preferences/renderer/public";
import { Button } from "../../../modules/ui/renderer/public";
import { Markdown } from "./markdown";
import { readingSegments } from "./reading-segments";

export interface ReadingBodyBinding {
  positions: ReadingPositions;
  key: string;
}
interface BodyProps {
  text: string;
  streaming?: boolean;
  raw?: boolean;
}
export function ReadingBody(
  props: BodyProps & { position?: ReadingBodyBinding | undefined },
) {
  return props.position && props.position.key.length <= 4096 ? (
    <RememberedBody
      key={props.position.key}
      {...props}
      position={props.position}
    />
  ) : (
    <LocalBody {...props} />
  );
}
function RememberedBody({
  position,
  ...props
}: BodyProps & { position: ReadingBodyBinding }) {
  const { positions, key } = position;
  const body = useStore(positions.stateStore, (state) => state.bodies.get(key));
  const setChoice = useCallback(
    (page: number) => {
      positions.rememberBody(key, { page, scrollTop: 0 });
    },
    [positions, key],
  );
  const getScrollTop = useCallback(
    () => positions.body(key)?.scrollTop ?? 0,
    [positions, key],
  );
  const rememberScroll = useCallback(
    (scrollTop: number) => {
      const previous = positions.body(key);
      if (previous?.scrollTop === scrollTop) return;
      positions.rememberBody(key, { page: previous?.page ?? 0, scrollTop });
    },
    [positions, key],
  );
  return (
    <BodyContent
      {...props}
      choice={body?.page ?? 0}
      setChoice={setChoice}
      getScrollTop={getScrollTop}
      rememberScroll={rememberScroll}
    />
  );
}
function LocalBody(props: BodyProps) {
  const [choice, choose] = useState(0);
  const scroll = useRef(0);
  const setChoice = useCallback((page: number) => {
    scroll.current = 0;
    choose(page);
  }, []);
  const getScrollTop = useCallback(() => scroll.current, []);
  const rememberScroll = useCallback((top: number) => {
    scroll.current = top;
  }, []);
  return (
    <BodyContent
      {...props}
      choice={choice}
      setChoice={setChoice}
      getScrollTop={getScrollTop}
      rememberScroll={rememberScroll}
    />
  );
}
function BodyContent({
  text,
  streaming = false,
  raw = false,
  choice,
  setChoice,
  getScrollTop,
  rememberScroll,
}: BodyProps & {
  choice: number;
  setChoice: (page: number) => void;
  getScrollTop: () => number;
  rememberScroll: (top: number) => void;
}) {
  const { t } = useI18n();
  const regionId = useId();
  const segments = useMemo(() => readingSegments(text), [text]);
  const page = Math.min(choice, Math.max(0, segments.length - 1));
  // Apply shrink immediately; later appends must not restore an invalid old choice.
  const body = useRef<HTMLPreElement>(null);
  useLayoutEffect(() => {
    if (choice !== page) setChoice(page);
  }, [choice, page, setChoice]);
  useLayoutEffect(() => {
    if (body.current) body.current.scrollTop = getScrollTop();
  }, [page, getScrollTop]);
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
        ref={body}
        onScroll={(event) => rememberScroll(event.currentTarget.scrollTop)}
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
