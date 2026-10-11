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
import type { FrozenSelection } from "../../../modules/files/core/public";
import { useI18n } from "../../../modules/preferences/renderer/public";
import { Button, LoadingIndicator } from "../../../modules/ui/renderer/public";
import { Modal } from "../components/ui/modal";
import { Conversation } from "../reading/conversation";
import { History } from "../reading/history";
import type { attachReadingAnchor } from "../reading/reading-anchor";
import { ReadingPane } from "../reading/reading-pane";
import { SavedConversation } from "../reading/saved-conversation";
import { Submissions } from "../reading/submissions";
import type { ReadingView } from "../routing/search";
import { ConversationVisibilityContext } from "../shell/layout/conversation-visibility";
import type { ThreadSelectionState } from "../wiring/model";
import { AnswerHistory } from "./answer-history";
import { locateActivation } from "./attention-location";
import { Composer } from "./composer";
import { DecisionDock } from "./decision-dock";
import { ExecutionStatus } from "./execution-status";
import { FilePanel } from "./file-panel";
import { RuntimeInspection, RuntimePanel } from "./runtime-panel";
import { SubagentControls } from "./subagent-controls";
import type { WorkbenchProps } from "./types";
import { useDocumentVisible } from "./window-visibility";

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
  const documentVisible = useDocumentVisible();
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
      runtime?.subscribeTo(
        (state) => state.view !== null && state.view.phase !== "starting",
        listener,
      ) ?? (() => {}),
    [runtime],
  );
  const getReady = useCallback(
    () =>
      !runtime ||
      (runtime.getSnapshot() !== null &&
        runtime.getSnapshot()?.phase !== "starting"),
    [runtime],
  );
  const runtimeReady = useSyncExternalStore(subscribeReady, getReady);
  const submission = props.threadSelection.thread.submission;
  const subscribeListRead = useCallback(
    (listener: () => void) =>
      submission?.subscribeTo((state) => state.listRead, listener) ??
      (() => {}),
    [submission],
  );
  const getListRead = useCallback(
    () => submission?.getSnapshot().listRead ?? "failed",
    [submission],
  );
  const receiptListRead = useSyncExternalStore(subscribeListRead, getListRead);
  const located = useRef<typeof target>(null);
  const attentionFrame = useRef<number | null>(null);
  const scheduledTarget = useRef<typeof target>(null);
  const locatingActivation = useRef(false);
  const onReadingTakeover = useCallback(() => {
    if (locatingActivation.current) return;
    if (!props.model.workbench.locatingSource)
      props.model.workbench.cancelReturn();
    const currentTarget = props.model.attention.locationStore.getState().target;
    if (
      currentTarget?.threadId ===
        props.threadSelection.thread.context.threadId &&
      currentTarget.activationId
    )
      props.model.attention.completeLocation(currentTarget, "cancelled");
    if (attentionFrame.current === null) return;
    cancelAnimationFrame(attentionFrame.current);
    attentionFrame.current = null;
    located.current = scheduledTarget.current;
  }, [props.model, props.threadSelection.thread.context.threadId]);
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
      !documentVisible ||
      !target ||
      located.current === target ||
      transitioning ||
      ((target.sourceTarget?.kind === "receipt" ||
        target.sourceTarget?.kind === "result") &&
        receiptListRead === "pending") ||
      (target.kind === "needs-answer" && !runtimeReady)
    )
      return;
    setReadingFocus(
      (target.kind === "failed" ||
        target.sourceTarget?.kind === "receipt" ||
        target.sourceTarget?.kind === "result") &&
        props.readingView === "submissions" &&
        !!workspace.current?.querySelector(
          `[data-attention-receipt-trace="${target.traceId}"]`,
        ),
    );
    const frame = requestAnimationFrame(() => {
      attentionFrame.current = null;
      const location = workspace.current;
      if (!location) return;
      let outcome: ReturnType<typeof locateActivation> = null;
      const locate = () => {
        outcome = locateActivation(location, target);
        return outcome !== null;
      };
      const receiptInPane =
        (target.kind === "failed" ||
          target.sourceTarget?.kind === "receipt" ||
          target.sourceTarget?.kind === "result") &&
        props.readingView === "submissions" &&
        location.querySelector(
          `[data-attention-receipt-trace="${target.traceId}"]`,
        );
      locatingActivation.current = true;
      try {
        if (
          receiptInPane && receiptAnchor.current
            ? receiptAnchor.current.position(locate)
            : locate()
        ) {
          located.current = target;
          if (outcome && (target.activationId || target.sourceTarget))
            props.model.attention.completeLocation(target, outcome);
        }
      } finally {
        locatingActivation.current = false;
      }
    });
    attentionFrame.current = frame;
    scheduledTarget.current = target;
    return () => {
      cancelAnimationFrame(frame);
      if (attentionFrame.current === frame) attentionFrame.current = null;
    };
  }, [
    target,
    props.readingView,
    transitioning,
    runtimeReady,
    receiptListRead,
    visible,
    documentVisible,
  ]);
  return (
    <section
      ref={workspace}
      className="thread-workspace"
      data-activation-thread={props.threadSelection.thread.context.threadId}
      tabIndex={-1}
      inert={transitioning}
      aria-busy={transitioning}
      data-reading-focus={readingFocus}
    >
      <ThreadContent
        {...props}
        workspace={workspace}
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
  workspace,
  readingFocus,
  onReadingFocusChange,
  onReceiptAnchorChange,
  onReadingTakeover,
}: ThreadWorkbenchProps & {
  workspace: RefObject<HTMLElement | null>;
  readingFocus: boolean;
  onReadingFocusChange: (value: boolean) => void;
  onReadingTakeover: () => void;
  onReceiptAnchorChange: (
    adapter: ReturnType<typeof attachReadingAnchor> | null,
  ) => void;
}) {
  const { thread, directoryAvailable } = threadSelection;
  const { visible } = useContext(ConversationVisibilityContext);
  const { submission } = thread;
  const [answerHistoryReveal, setAnswerHistoryReveal] = useState({
    threadId: thread.context.threadId,
    request: 0,
  });
  const releaseSourceAnchor = useRef<(() => void) | null>(null);
  const onSourceAnchorChange = useCallback(
    (adapter: ReturnType<typeof attachReadingAnchor> | null) => {
      releaseSourceAnchor.current?.();
      releaseSourceAnchor.current = null;
      if (adapter)
        releaseSourceAnchor.current = model.workbench.registerAnchor(
          thread.context.threadId,
          (row) => {
            const located = adapter.toRow(row);
            if (located)
              workspace.current
                ?.querySelector<HTMLElement>("[data-reading-pane=conversation]")
                ?.focus({ preventScroll: true });
            return located;
          },
        );
    },
    [model, thread.context.threadId, workspace],
  );
  const returning = useStore(model.workbench.stateStore, (state) =>
    state.returning?.target.source.threadId === thread.context.threadId
      ? state.returning
      : null,
  );
  const workspaceNavigation = useStore(model.workbench.stateStore, (state) => {
    const intent = state.workspaceNavigation;
    if (!intent) return null;
    const ref =
      intent.target.kind === "file" ? intent.target.file : intent.target.diff;
    return ref.threadId === thread.context.threadId ? intent : null;
  });
  useLayoutEffect(() => {
    if (returning && readingView !== "conversation")
      onReadingViewChange("conversation");
  }, [returning, readingView, onReadingViewChange]);
  useLayoutEffect(() => {
    if (workspaceNavigation && readingView !== "files")
      onReadingViewChange("files");
  }, [workspaceNavigation, readingView, onReadingViewChange]);
  const { t } = useI18n();
  const initializing = useSyncExternalStore(
    useCallback(
      (listener: () => void) =>
        thread.runtime?.subscribeTo(
          (state) =>
            !state.view ||
            state.view.phase === "allowed" ||
            state.view.phase === "starting",
          listener,
        ) ?? (() => {}),
      [thread],
    ),
    useCallback(
      () =>
        !!thread.runtime &&
        (!thread.runtime.getSnapshot() ||
          thread.runtime.getSnapshot()?.phase === "allowed" ||
          thread.runtime.getSnapshot()?.phase === "starting"),
      [thread],
    ),
  );
  const { openProviders } = useContext(ConversationVisibilityContext);
  const returnFocus = useRef<HTMLElement | null>(null);
  const [dialog, setDialog] = useState<"permissions" | "subagents" | null>(
    null,
  );
  const restoreComposerFocus = useRef(false);
  const menuTrigger = () =>
    workspace.current?.querySelector<HTMLButtonElement>(
      '[data-slot="composer-toolbar-actions"] button[aria-haspopup="menu"]',
    ) ?? null;
  useLayoutEffect(() => {
    if (readingView === "conversation" && restoreComposerFocus.current) {
      restoreComposerFocus.current = false;
      menuTrigger()?.focus({ preventScroll: true });
    }
  }, [readingView]);
  const openDialog = (kind: "permissions" | "subagents") => {
    returnFocus.current =
      kind === "subagents"
        ? menuTrigger()
        : document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
    setDialog(kind);
  };
  const returnToConversation = useCallback(() => {
    restoreComposerFocus.current = true;
    onReadingViewChange("conversation");
  }, [onReadingViewChange]);
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
      <Modal
        open={dialog !== null}
        onClose={() => setDialog(null)}
        title={t(
          dialog === "subagents"
            ? "subagents.heading"
            : "composer.projectAccess",
        )}
        closeLabel={t("app.layout.close")}
        returnFocus={returnFocus}
      >
        {dialog === "permissions" && thread.runtime && (
          <RuntimeInspection
            model={thread.runtime}
            origin={thread.context.origin}
          />
        )}
        {dialog === "subagents" && model.configuration && (
          <SubagentControls
            key={thread.context.threadId}
            thread={thread}
            bridge={model.configuration}
          />
        )}
      </Modal>
      {(readingView !== "conversation" || readingFocus) && (
        <div className="thread-toolbar">
          <Button
            variant="ghost"
            onClick={() => {
              onReadingFocusChange(false);
              returnToConversation();
            }}
          >
            {t("ui.history.returnLive")}
          </Button>
        </div>
      )}
      <div
        className="thread-reading"
        data-attention-target="result"
        tabIndex={-1}
      >
        {!directoryAvailable && <DirectoryUnavailable />}
        {model.answerHistory && (
          <AnswerHistory
            bridge={model.answerHistory}
            threadId={thread.context.threadId}
            revealRequest={
              answerHistoryReveal.threadId === thread.context.threadId
                ? answerHistoryReveal.request
                : 0
            }
          />
        )}
        {thread.runtime && (
          <RuntimePanel
            origin={thread.context.origin}
            model={thread.runtime}
            submission={thread.submission}
            inspection={false}
            onReviewAnswers={
              model.answerHistory
                ? () =>
                    setAnswerHistoryReveal((previous) => ({
                      threadId: thread.context.threadId,
                      request:
                        previous.threadId === thread.context.threadId
                          ? previous.request + 1
                          : 1,
                    }))
                : undefined
            }
            onReviewOperations={
              submission ? () => onReadingViewChange("submissions") : undefined
            }
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
          onAdapterChange={onSourceAnchorChange}
          active={readingView === "conversation"}
        >
          {thread.reading &&
            (model.history ? (
              <SavedConversation
                initializing={initializing}
                model={thread.reading}
                bridge={model.history}
                resource={thread.context}
                git={model.git}
                summaryActive={readingView === "conversation" && visible}
                threadId={thread.context.threadId}
                threadTitle={thread.context.title}
                active={readingView === "conversation"}
                positions={thread.readingSources}
              />
            ) : (
              <>
                <LoadingIndicator
                  pending={initializing}
                  identity={thread.key}
                  label={t("app.loading")}
                  placement="center"
                />
                <Conversation
                  initializing={initializing}
                  model={thread.reading}
                  resource={thread.context}
                  git={model.git}
                  active={readingView === "conversation" && visible}
                  threadTitle={thread.context.title}
                  positions={thread.readingSources}
                />
              </>
            ))}
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
              active={readingView === "files" && visible}
              navigation={workspaceNavigation}
              onNavigated={(ticket) =>
                model.workbench.completeWorkspaceNavigation(ticket)
              }
              isNavigationCurrent={(ticket) =>
                model.workbench.workspaceNavigationTicket(
                  thread.context.threadId,
                ) === ticket
              }
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
              onReturnLive={returnToConversation}
            />
          )}
        </ReadingPane>
      </div>
      {thread.runtime && <DecisionDock model={thread.runtime} />}
      {thread.runtime && (
        <ExecutionStatus
          runtime={thread.runtime}
          submission={thread.submission}
          reading={thread.reading}
          onReviewOperations={
            submission ? () => onReadingViewChange("submissions") : undefined
          }
        />
      )}
      <Composer
        thread={thread}
        model={model}
        selectionAttachment={selectionAttachment}
        onAttachmentApplied={onAttachmentApplied}
        onChooseModel={openProviders}
        onOpenPermissions={() => openDialog("permissions")}
        moreActions={[
          {
            kind: "action",
            id: "files",
            label: t("ui.files.section"),
            onSelect: () => onReadingViewChange("files"),
          },
          {
            kind: "action",
            id: "history",
            label: t("app.reading.history"),
            onSelect: () => onReadingViewChange("history"),
          },
          {
            kind: "action",
            id: "submissions",
            label: t("app.reading.submissions"),
            onSelect: () => onReadingViewChange("submissions"),
          },
          ...(model.configuration
            ? [
                {
                  kind: "action" as const,
                  id: "subagents",
                  label: t("subagents.heading"),
                  onSelect: () => openDialog("subagents"),
                },
              ]
            : []),
        ]}
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
