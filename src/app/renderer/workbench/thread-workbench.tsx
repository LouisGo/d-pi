import {
  memo,
  type ReactNode,
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useStore } from "zustand";
import { FolderIcon } from "@/components/icons/common";
import { Button } from "@/components/ui/button";
import type { FrozenSelection } from "../../../modules/files/core/public";
import { useI18n } from "../../../modules/preferences/renderer/public";
import { Conversation } from "../reading/conversation";
import { History } from "../reading/history";
import { Submissions } from "../reading/submissions";
import type { ReadingView } from "../routing/search";
import { ConversationVisibilityContext } from "../shell/layout/conversation-visibility";
import type { ThreadSelectionState } from "../wiring/model";
import type { ThreadModel } from "../wiring/thread-model";
import { locateAttention } from "./attention-location";
import { Composer } from "./composer";
import { FilePanel } from "./file-panel";
import { ModelControls } from "./model-controls";
import { RuntimePanel } from "./runtime-panel";
import { SubagentControls } from "./subagent-controls";
import type { WorkbenchProps } from "./types";

type ThreadWorkbenchProps = WorkbenchProps & {
  transitioning?: boolean;
  readingView: ReadingView;
  onReadingViewChange: (view: ReadingView) => void;
  threadSelection: Extract<ThreadSelectionState, { kind: "thread" }>;
};

export function ThreadWorkbench({
  transitioning = false,
  ...props
}: ThreadWorkbenchProps) {
  const [readingFocus, setReadingFocus] = useState(false);
  const workspace = useRef<HTMLElement>(null);
  const target = useStore(props.model.attention.locationStore, (state) =>
    state.target?.threadId === props.threadSelection.thread.context.threadId
      ? state.target
      : null,
  );
  const runtime = props.threadSelection.thread.runtime;
  const subscribeReady = useCallback(
    (listener: () => void) =>
      runtime?.subscribeTo((state) => state.view !== null, listener) ??
      (() => {}),
    [runtime],
  );
  const getReady = useCallback(
    () => !runtime || runtime.getSnapshot() !== null,
    [runtime],
  );
  const runtimeReady = useSyncExternalStore(subscribeReady, getReady);
  const located = useRef<typeof target>(null);
  useLayoutEffect(() => {
    if (
      !target ||
      located.current === target ||
      transitioning ||
      (target.kind === "needs-answer" && !runtimeReady)
    )
      return;
    setReadingFocus(
      target.kind === "failed" &&
        props.readingView === "submissions" &&
        !!workspace.current?.querySelector(
          `[data-attention-receipt-trace="${target.traceId}"]`,
        ),
    );
    const frame = requestAnimationFrame(() => {
      if (workspace.current && locateAttention(workspace.current, target))
        located.current = target;
    });
    return () => cancelAnimationFrame(frame);
  }, [target, props.readingView, transitioning, runtimeReady]);
  return (
    <section
      ref={workspace}
      className="thread-workspace"
      inert={transitioning}
      aria-busy={transitioning}
      data-reading-focus={readingFocus}
    >
      <ThreadContent
        {...props}
        readingFocus={readingFocus}
        onReadingFocusChange={setReadingFocus}
      />
    </section>
  );
}

const ThreadContent = memo(function ThreadContent({
  model,
  threadSelection,
  editor,
  readingView,
  onReadingViewChange,
  readingFocus,
  onReadingFocusChange,
}: ThreadWorkbenchProps & {
  readingFocus: boolean;
  onReadingFocusChange: (value: boolean) => void;
}) {
  const { thread, directoryAvailable } = threadSelection;
  const { submission } = thread;
  const modelDisclosure = useRef<HTMLDetailsElement>(null);
  const chooseModel = useCallback(() => {
    const details = modelDisclosure.current;
    if (!details) return;
    details.open = true;
    details.scrollIntoView({ block: "nearest" });
    details.querySelector("select")?.focus();
  }, []);
  const [selectionAttachment, setSelectionAttachment] = useState<{
    id: string;
    threadId: string;
    selection: Extract<FrozenSelection, { kind: "selection" }>;
  } | null>(null);
  const onAttachmentApplied = useCallback((id: string) => {
    setSelectionAttachment((current) => (current?.id === id ? null : current));
  }, []);
  const onAttach = useCallback(
    (selection: Extract<FrozenSelection, { kind: "selection" }>) => {
      onReadingFocusChange(false);
      setSelectionAttachment({
        id: crypto.randomUUID(),
        threadId: thread.context.threadId,
        selection,
      });
    },
    [thread, onReadingFocusChange],
  );
  return (
    <>
      <div className="thread-setup" hidden={readingFocus}>
        <div className="directory-info" title={thread.context.directory}>
          <FolderIcon />
          <h1>{thread.context.directory.split("/").filter(Boolean).at(-1)}</h1>
          <span className="muted">{thread.context.directory}</span>
        </div>
        {!directoryAvailable && <DirectoryUnavailable />}
        {model.configuration && (
          <ModelControls
            thread={thread}
            bridge={model.configuration}
            disclosureRef={modelDisclosure}
          />
        )}
        {model.configuration && (
          <SubagentControls
            key={thread.context.threadId}
            thread={thread}
            bridge={model.configuration}
          />
        )}
        {thread.runtime && (
          <RuntimePanel
            model={thread.runtime}
            submission={thread.submission}
            // Post-default user answers become a new steering instruction
            // (2026-09-28 decision), not a follow-up.
            onFollowUp={
              submission
                ? (text: string) => submission.sendText(text, "steer")
                : undefined
            }
          />
        )}
      </div>
      <ReadingNavigation
        readingView={readingView}
        onReadingViewChange={onReadingViewChange}
        readingFocus={readingFocus}
        onReadingFocusChange={onReadingFocusChange}
      />
      <div
        className="thread-reading"
        data-attention-target="result"
        tabIndex={-1}
      >
        <ReadingPane
          thread={thread}
          view="conversation"
          active={readingView === "conversation"}
        >
          {thread.reading && (
            <Conversation
              model={thread.reading}
              onHistory={() => onReadingViewChange("history")}
            />
          )}
        </ReadingPane>
        <ReadingPane
          thread={thread}
          view="files"
          active={readingView === "files"}
        >
          {model.files && model.git && (
            <FilePanel
              resource={thread.context}
              files={model.files}
              git={model.git}
              editor={editor}
              onAttach={onAttach}
            />
          )}
        </ReadingPane>
        <ReadingPane
          thread={thread}
          view="submissions"
          active={readingView === "submissions"}
        >
          {submission && <Submissions model={submission} />}
        </ReadingPane>
        <ReadingPane
          thread={thread}
          view="history"
          active={readingView === "history"}
        >
          {model.history && (
            <History
              bridge={model.history}
              active={readingView === "history"}
              threadId={thread.context.threadId}
            />
          )}
        </ReadingPane>
      </div>
      <Composer
        thread={thread}
        model={model}
        selectionAttachment={selectionAttachment}
        onAttachmentApplied={onAttachmentApplied}
        onChooseModel={chooseModel}
        hidden={readingFocus}
      />
    </>
  );
});

function DirectoryUnavailable() {
  const { t } = useI18n();
  return (
    <p className="failure" role="alert">
      {t("app.draft.directoryUnavailable")}
    </p>
  );
}

function ReadingNavigation({
  readingView,
  onReadingViewChange,
  readingFocus,
  onReadingFocusChange,
}: Pick<ThreadWorkbenchProps, "readingView" | "onReadingViewChange"> & {
  readingFocus: boolean;
  onReadingFocusChange: (value: boolean) => void;
}) {
  const { t } = useI18n();
  return (
    <nav
      className="reading-navigation"
      aria-label={t("app.reading.navigation")}
    >
      <div className="reading-tabs">
        <Button
          variant="navigation"
          aria-pressed={readingView === "conversation"}
          onClick={() => onReadingViewChange("conversation")}
        >
          {t("ui.conversation.heading")}
        </Button>
        <Button
          variant="navigation"
          aria-pressed={readingView === "files"}
          onClick={() => onReadingViewChange("files")}
        >
          {t("ui.files.section")}
        </Button>
        <Button
          variant="navigation"
          aria-pressed={readingView === "submissions"}
          onClick={() => onReadingViewChange("submissions")}
        >
          {t("app.reading.submissions")}
        </Button>
        <Button
          variant="navigation"
          aria-pressed={readingView === "history"}
          onClick={() => onReadingViewChange("history")}
        >
          {t("app.reading.history")}
        </Button>
      </div>
      <div className="reading-focus">
        <Button
          variant="ghost"
          aria-pressed={readingFocus}
          onClick={() => onReadingFocusChange(!readingFocus)}
        >
          {t(
            readingFocus ? "app.reading.restoreControls" : "app.reading.focus",
          )}
        </Button>
      </div>
    </nav>
  );
}

function ReadingPane({
  thread,
  view,
  active,
  children,
}: {
  thread: ThreadModel;
  view: ReadingView;
  active: boolean;
  children: ReactNode;
}) {
  const visible = useContext(ConversationVisibilityContext);
  const ref = useRef<HTMLDivElement>(null);
  const restoring = useRef(false);
  useLayoutEffect(() => {
    const pane = ref.current;
    if (!pane || !active || !visible) return;
    const top = thread.readingPositions.get(view) ?? 0;
    restoring.current = true;
    pane.scrollTop = top;
    // Composer mounts after this pane's layout effect. Restore again before
    // paint, once its geometry is present, without recording an initial clamp.
    const frame = requestAnimationFrame(() => {
      pane.scrollTop = top;
      restoring.current = false;
    });
    return () => {
      cancelAnimationFrame(frame);
      // React may already have hidden the viewport. Preserve its last visible
      // coordinate, and never persist an unfinished restoration's clamp.
      if (
        !pane.hidden &&
        pane.getClientRects().length > 0 &&
        !restoring.current
      )
        thread.readingPositions.set(view, pane.scrollTop);
      restoring.current = false;
    };
  }, [thread, view, active, visible]);
  return (
    <div
      ref={ref}
      className="reading-pane"
      hidden={!active}
      onScroll={(event) => {
        if (
          active &&
          visible &&
          event.currentTarget.getClientRects().length > 0 &&
          !restoring.current
        )
          thread.readingPositions.set(view, event.currentTarget.scrollTop);
      }}
    >
      {children}
    </div>
  );
}
