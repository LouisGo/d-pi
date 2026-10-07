import {
  memo,
  type RefObject,
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useStore } from "zustand";
import { FolderIcon } from "@/components/icons/common";
import type { FrozenSelection } from "../../../modules/files/core/public";
import { useI18n } from "../../../modules/preferences/renderer/public";
import { Button } from "../../../modules/ui/renderer/public";
import { Modal } from "../components/ui/modal";
import { Conversation } from "../reading/conversation";
import { History } from "../reading/history";
import type { attachReadingAnchor } from "../reading/reading-anchor";
import { ReadingPane } from "../reading/reading-pane";
import { Submissions } from "../reading/submissions";
import type { ReadingView } from "../routing/search";
import { ConversationVisibilityContext } from "../shell/layout/conversation-visibility";
import type { ThreadSelectionState } from "../wiring/model";
import { locateAttention } from "./attention-location";
import { Composer } from "./composer";
import { FilePanel } from "./file-panel";
import { ModelControls } from "./model-controls";
import { RuntimeInspection, RuntimePanel } from "./runtime-panel";
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
  const { visible } = useContext(ConversationVisibilityContext);
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
  const attentionFrame = useRef<number | null>(null);
  const scheduledTarget = useRef<typeof target>(null);
  const onReadingTakeover = useCallback(() => {
    if (attentionFrame.current === null) return;
    cancelAnimationFrame(attentionFrame.current);
    attentionFrame.current = null;
    located.current = scheduledTarget.current;
  }, []);
  const receiptAnchor = useRef<ReturnType<typeof attachReadingAnchor> | null>(
    null,
  );
  const onReceiptAnchorChange = useCallback(
    (adapter: ReturnType<typeof attachReadingAnchor> | null) => {
      receiptAnchor.current = adapter;
    },
    [],
  );
  useLayoutEffect(() => {
    if (
      !visible ||
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
      attentionFrame.current = null;
      const location = workspace.current;
      if (!location) return;
      const locate = () => locateAttention(location, target);
      const receiptInPane =
        target.kind === "failed" &&
        props.readingView === "submissions" &&
        location.querySelector(
          `[data-attention-receipt-trace="${target.traceId}"]`,
        );
      if (
        receiptInPane && receiptAnchor.current
          ? receiptAnchor.current.position(locate)
          : locate()
      )
        located.current = target;
    });
    attentionFrame.current = frame;
    scheduledTarget.current = target;
    return () => {
      cancelAnimationFrame(frame);
      if (attentionFrame.current === frame) attentionFrame.current = null;
    };
  }, [target, props.readingView, transitioning, runtimeReady, visible]);
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
        onReceiptAnchorChange={onReceiptAnchorChange}
        onReadingTakeover={onReadingTakeover}
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
  onReceiptAnchorChange,
  onReadingTakeover,
}: ThreadWorkbenchProps & {
  readingFocus: boolean;
  onReadingFocusChange: (value: boolean) => void;
  onReadingTakeover: () => void;
  onReceiptAnchorChange: (
    adapter: ReturnType<typeof attachReadingAnchor> | null,
  ) => void;
}) {
  const { thread, directoryAvailable } = threadSelection;
  const { submission } = thread;
  const { t } = useI18n();
  const toolsTrigger = useRef<HTMLButtonElement>(null);
  const toolsReturnFocus = useRef<HTMLElement | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [choosingModel, setChoosingModel] = useState(false);
  const [choosingHistory, setChoosingHistory] = useState(false);
  const historyTrigger = useRef<HTMLButtonElement>(null);
  const openHistoryTools = useCallback(() => {
    toolsReturnFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : toolsTrigger.current;
    setChoosingModel(false);
    setChoosingHistory(true);
    setToolsOpen(true);
  }, []);
  const modelDisclosure = useRef<HTMLDetailsElement>(null);
  const chooseModel = useCallback(() => {
    toolsReturnFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : toolsTrigger.current;
    setChoosingHistory(false);
    setChoosingModel(true);
    setToolsOpen(true);
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
      <div className="thread-toolbar">
        <Button
          ref={toolsTrigger}
          variant="ghost"
          data-thread-tools-trigger=""
          onClick={(event) => {
            toolsReturnFocus.current = event.currentTarget;
            setChoosingHistory(false);
            setChoosingModel(false);
            setToolsOpen(true);
          }}
        >
          {t("app.reading.tools")}
        </Button>
        <Modal
          open={toolsOpen}
          onClose={() => setToolsOpen(false)}
          title={t("app.reading.tools")}
          closeLabel={t("app.layout.close")}
          returnFocus={toolsReturnFocus}
          initialFocus={() => {
            if (choosingHistory) return historyTrigger.current;
            const details = modelDisclosure.current;
            if (!choosingModel || !details) return null;
            details.open = true;
            return details.querySelector<HTMLElement>("[data-slot=select]");
          }}
        >
          <div className="thread-tools-content">
            <div className="thread-setup">
              <div className="directory-info" title={thread.context.directory}>
                <FolderIcon />
                <h1>
                  {thread.context.directory.split("/").filter(Boolean).at(-1)}
                </h1>
                <span className="muted">{thread.context.directory}</span>
              </div>
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
            </div>
            {thread.runtime && <RuntimeInspection model={thread.runtime} />}
            <ReadingNavigation
              readingView={readingView}
              historyButtonRef={historyTrigger}
              onReadingViewChange={(view) => {
                onReadingViewChange(view);
                setToolsOpen(false);
              }}
            />
            <Button
              variant="ghost"
              aria-pressed={readingFocus}
              onClick={() => {
                onReadingFocusChange(!readingFocus);
                setToolsOpen(false);
              }}
            >
              {t("app.reading.focus")}
            </Button>
          </div>
        </Modal>
        {readingFocus && (
          <Button variant="ghost" onClick={() => onReadingFocusChange(false)}>
            {t("app.reading.restoreControls")}
          </Button>
        )}
      </div>
      <div
        className="thread-reading"
        data-attention-target="result"
        tabIndex={-1}
      >
        {!directoryAvailable && <DirectoryUnavailable />}
        {thread.runtime && (
          <RuntimePanel
            model={thread.runtime}
            submission={thread.submission}
            inspection={false}
            // Post-default user answers become a new steering instruction
            // (2026-09-28 decision), not a follow-up.
            onFollowUp={
              submission
                ? (text: string) => submission.sendText(text, "steer")
                : undefined
            }
          />
        )}
        <ReadingPane
          thread={thread}
          onTakeover={onReadingTakeover}
          view="conversation"
          onOpenHistory={openHistoryTools}
          active={readingView === "conversation"}
        >
          {thread.reading && (
            <Conversation
              model={thread.reading}
              positions={thread.readingSources}
              onOpenHistory={openHistoryTools}
            />
          )}
        </ReadingPane>
        <ReadingPane
          thread={thread}
          onTakeover={onReadingTakeover}
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
          onTakeover={onReadingTakeover}
          view="submissions"
          onAdapterChange={onReceiptAnchorChange}
          active={readingView === "submissions"}
        >
          {submission && <Submissions model={submission} />}
        </ReadingPane>
        <ReadingPane
          thread={thread}
          onTakeover={onReadingTakeover}
          view="history"
          active={readingView === "history"}
        >
          {model.history && (
            <History
              bridge={model.history}
              positions={thread.readingSources}
              active={readingView === "history"}
              threadId={thread.context.threadId}
              onReturnLive={() => onReadingViewChange("conversation")}
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
  historyButtonRef,
}: Pick<ThreadWorkbenchProps, "readingView" | "onReadingViewChange"> & {
  historyButtonRef: RefObject<HTMLButtonElement | null>;
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
          ref={historyButtonRef}
          data-reading-view="history"
          aria-pressed={readingView === "history"}
          onClick={() => onReadingViewChange("history")}
        >
          {t("app.reading.history")}
        </Button>
      </div>
    </nav>
  );
}
