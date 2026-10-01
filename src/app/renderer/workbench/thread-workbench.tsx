import { useCallback, useState } from "react";
import { FolderIcon } from "@/components/icons/common";
import { Button } from "@/components/ui/button";
import type { FrozenSelection } from "../../../modules/files/core/public";
import { useI18n } from "../../../modules/preferences/renderer/public";
import { Conversation } from "../reading/conversation";
import { History } from "../reading/history";
import { Submissions } from "../reading/submissions";
import type { ReadingView } from "../routing/search";
import type { ThreadSelectionState } from "../wiring/model";
import { Composer } from "./composer";
import { FilePanel } from "./file-panel";
import { ModelControls } from "./model-controls";
import { RuntimePanel } from "./runtime-panel";
import type { WorkbenchProps } from "./types";

export function ThreadWorkbench({
  model,
  threadSelection,
  editor,
  readingView,
  onReadingViewChange,
}: WorkbenchProps & {
  readingView: ReadingView;
  onReadingViewChange: (view: ReadingView) => void;
  threadSelection: Extract<ThreadSelectionState, { kind: "thread" }>;
}) {
  const { t } = useI18n();
  const { thread, directoryAvailable } = threadSelection;
  const { submission } = thread;
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
      setSelectionAttachment({
        id: crypto.randomUUID(),
        threadId: thread.context.threadId,
        selection,
      });
    },
    [thread],
  );
  return (
    <section className="thread-workspace">
      <div className="thread-setup">
        <div className="directory-info" title={thread.context.directory}>
          <FolderIcon />
          <h1>{thread.context.directory.split("/").filter(Boolean).at(-1)}</h1>
          <span className="muted">{thread.context.directory}</span>
        </div>
        {!directoryAvailable && (
          <p className="failure" role="alert">
            {t("app.draft.directoryUnavailable")}
          </p>
        )}
        {model.configuration && (
          <ModelControls thread={thread} bridge={model.configuration} />
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
      <nav
        className="reading-navigation"
        aria-label={t("app.reading.navigation")}
      >
        <Button
          variant="ghost"
          aria-pressed={readingView === "conversation"}
          onClick={() => onReadingViewChange("conversation")}
        >
          {t("ui.conversation.heading")}
        </Button>
        <Button
          variant="ghost"
          aria-pressed={readingView === "files"}
          onClick={() => onReadingViewChange("files")}
        >
          {t("ui.files.section")}
        </Button>
        <Button
          variant="ghost"
          aria-pressed={readingView === "submissions"}
          onClick={() => onReadingViewChange("submissions")}
        >
          {t("app.reading.submissions")}
        </Button>
        <Button
          variant="ghost"
          aria-pressed={readingView === "history"}
          onClick={() => onReadingViewChange("history")}
        >
          {t("app.reading.history")}
        </Button>
      </nav>
      <div className="thread-reading">
        <div className="reading-pane" hidden={readingView !== "conversation"}>
          {thread.reading && (
            <Conversation
              model={thread.reading}
              onHistory={() => onReadingViewChange("history")}
            />
          )}
        </div>
        <div className="reading-pane" hidden={readingView !== "files"}>
          {model.files && model.git && (
            <FilePanel
              resource={thread.context}
              files={model.files}
              git={model.git}
              editor={editor}
              onAttach={onAttach}
            />
          )}
        </div>
        <div className="reading-pane" hidden={readingView !== "submissions"}>
          {submission && <Submissions model={submission} />}
        </div>
        <div className="reading-pane" hidden={readingView !== "history"}>
          {model.history && (
            <History
              bridge={model.history}
              active={readingView === "history"}
              threadId={thread.context.threadId}
            />
          )}
        </div>
      </div>
      <Composer
        thread={thread}
        model={model}
        selectionAttachment={selectionAttachment}
        onAttachmentApplied={onAttachmentApplied}
      />
    </section>
  );
}
