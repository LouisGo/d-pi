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
import { useDocumentVisible } from "../workbench/window-visibility";
import { ConversationOutline } from "./conversation-outline";
import { LiveReadingControls } from "./live-reading-controls";
import { attachReadingAnchor } from "./reading-anchor";

export function ReadingPane({
  thread,
  view,
  active,
  children,
  onAdapterChange,
  onTakeover,
}: {
  thread: Pick<
    ThreadModel,
    "readingSources" | "readingPositions" | "reading"
  > & { retainReading?: ThreadModel["retainReading"] };
  view: ReadingView;
  active: boolean;
  children: ReactNode;
  onTakeover?: (() => void) | undefined;
  onAdapterChange?:
    | ((adapter: ReturnType<typeof attachReadingAnchor> | null) => void)
    | undefined;
}) {
  const { visible } = useContext(ConversationVisibilityContext);
  const documentVisible = useDocumentVisible();
  const presented = active && visible && documentVisible;
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
    const workspace = pane?.closest<HTMLElement>(".thread-workspace");
    if (!pane || !workspace || view !== "conversation" || !presented) return;
    let previous = -1;
    const syncGutter = () => {
      const width = pane.offsetWidth - pane.clientWidth;
      if (width === previous) return;
      previous = width;
      workspace.style.setProperty("--conversation-scrollbar", `${width}px`);
    };
    syncGutter();
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(syncGutter);
    observer?.observe(pane);
    return () => observer?.disconnect();
  }, [view, presented]);
  useLayoutEffect(() => {
    const pane = ref.current;
    if (!pane || !presented) return;
    const adapter = attachReadingAnchor({
      pane,
      positions: thread.readingSources,
      isVisible: () => presented,
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
  }, [thread, view, presented, onAdapterChange, onTakeover]);
  return (
    <>
      <div
        ref={ref}
        className="reading-pane"
        data-reading-pane={view}
        role="region"
        aria-label={label}
        hidden={!presented}
        tabIndex={0}
        onScroll={(event) => {
          if (event.target === event.currentTarget) anchor.current?.capture();
        }}
      >
        {/* FilePanel keeps only location state; its inner viewer gates resources. */}
        {view === "files" ? (
          children
        ) : presented ? (
          <ReadingConsumer
            retain={view === "conversation" ? thread : undefined}
            beforeDetach={() => anchor.current?.capture(false)}
          >
            {children}
          </ReadingConsumer>
        ) : null}
      </div>
      {view === "conversation" && presented && thread.reading && liveAnchor && (
        <>
          {ref.current && (
            <ConversationOutline pane={ref.current} anchor={liveAnchor} />
          )}
          <LiveReadingControls model={thread.reading} anchor={liveAnchor} />
        </>
      )}
    </>
  );
}

function ReadingConsumer({
  children,
  beforeDetach,
  retain,
}: {
  children: ReactNode;
  beforeDetach: () => void;
  retain?: { retainReading?: ThreadModel["retainReading"] } | undefined;
}) {
  const detach = useRef(beforeDetach);
  detach.current = beforeDetach;
  // A deleted child cleans up before its DOM is removed. Capture the old source
  // before the persistent pane's later effect cleanup sees an empty subtree.
  useLayoutEffect(() => {
    const release = retain?.retainReading?.();
    return () => {
      detach.current();
      release?.();
    };
  }, [retain]);
  return children;
}
