import {
  type ReactNode,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { match } from "ts-pattern";
import { useI18n } from "../../../modules/preferences/renderer/public";
import type { ReadingView } from "../routing/search";
import { ConversationVisibilityContext } from "../shell/layout/conversation-visibility";
import type { ThreadModel } from "../wiring/thread-model";
import { LiveReadingControls } from "./live-reading-controls";
import { attachReadingAnchor } from "./reading-anchor";

export function ReadingPane({
  thread,
  view,
  active,
  children,
  onAdapterChange,
  onTakeover,
  onOpenHistory,
}: {
  thread: Pick<ThreadModel, "readingSources" | "readingPositions" | "reading">;
  view: ReadingView;
  active: boolean;
  children: ReactNode;
  onOpenHistory?: (() => void) | undefined;
  onTakeover?: (() => void) | undefined;
  onAdapterChange?:
    | ((adapter: ReturnType<typeof attachReadingAnchor> | null) => void)
    | undefined;
}) {
  const { visible } = useContext(ConversationVisibilityContext);
  const { t } = useI18n();
  const label = match(view)
    .with("conversation", () => t("ui.conversation.sectionLabel"))
    .with("files", () => t("ui.files.section"))
    .with("submissions", () => t("app.reading.submissions"))
    .with("history", () => t("app.reading.history"))
    .exhaustive();
  const ref = useRef<HTMLDivElement>(null);
  const anchor = useRef<ReturnType<typeof attachReadingAnchor> | null>(null);
  const [liveAnchor, setLiveAnchor] = useState<ReturnType<
    typeof attachReadingAnchor
  > | null>(null);
  useLayoutEffect(() => {
    const pane = ref.current;
    if (!pane || !active || !visible) return;
    const adapter = attachReadingAnchor({
      pane,
      positions: thread.readingSources,
      isVisible: () => active && visible,
      pixel: () => thread.readingPositions.get(view) ?? 0,
      rememberPixel: (top) => thread.readingPositions.set(view, top),
      onTakeover,
    });
    anchor.current = adapter;
    onAdapterChange?.(adapter);
    if (view === "conversation") setLiveAnchor(adapter);
    return () => {
      adapter.dispose();
      onAdapterChange?.(null);
      if (anchor.current === adapter) anchor.current = null;
    };
  }, [thread, view, active, visible, onAdapterChange, onTakeover]);
  return (
    <>
      <div
        ref={ref}
        className="reading-pane"
        data-reading-pane={view}
        role="region"
        aria-label={label}
        hidden={!active}
        tabIndex={0}
        onScroll={(event) => {
          if (event.target === event.currentTarget) anchor.current?.capture();
        }}
      >
        {children}
      </div>
      {view === "conversation" &&
        active &&
        visible &&
        thread.reading &&
        liveAnchor && (
          <LiveReadingControls
            model={thread.reading}
            anchor={liveAnchor}
            onOpenHistory={onOpenHistory}
          />
        )}
    </>
  );
}
