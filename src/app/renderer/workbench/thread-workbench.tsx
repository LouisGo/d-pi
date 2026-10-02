import {
  memo,
  type ReactNode,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { FolderIcon } from "@/components/icons/common";
import { Button } from "@/components/ui/button";
import type { FrozenSelection } from "../../../modules/files/core/public";
import { useI18n } from "../../../modules/preferences/renderer/public";
import { Conversation } from "../reading/conversation";
import { History } from "../reading/history";
import { Submissions } from "../reading/submissions";
import type { ReadingView } from "../routing/search";
import type { ThreadSelectionState } from "../wiring/model";
import type { ThreadModel } from "../wiring/thread-model";
import { Composer } from "./composer";
import { FilePanel } from "./file-panel";
import { ModelControls } from "./model-controls";
import { RuntimePanel } from "./runtime-panel";
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
  return (
    <section
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
      <div className="thread-reading">
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
  const ref = useRef<HTMLDivElement>(null);
  const restoring = useRef(false);
  useLayoutEffect(() => {
    const pane = ref.current;
    if (!pane || !active) return;
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
      if (!pane.hidden && !restoring.current)
        thread.readingPositions.set(view, pane.scrollTop);
      restoring.current = false;
    };
  }, [thread, view, active]);
  return (
    <div
      ref={ref}
      className="reading-pane"
      hidden={!active}
      onScroll={(event) => {
        if (active && !restoring.current)
          thread.readingPositions.set(view, event.currentTarget.scrollTop);
      }}
    >
      {children}
    </div>
  );
}
