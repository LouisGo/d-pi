import { useState } from "react";
import {
  ActionGroup,
  Badge,
  Button,
  EmptyState,
  HoverCard,
  InlineNotice,
  Kbd,
  OptionAction,
} from "../../../../modules/ui/renderer/public";
import { CopyButton } from "../../components/ui/copy-button";
import { PathLabel } from "../../components/ui/path-label";
import { ConversationItemView } from "../../reading/conversation";
import { MessageHeader, ToolResultFrame } from "../../reading/message-parts";
import { TurnPreviewCard } from "../../reading/turn-preview-card";
import { NativeInteraction } from "../../workbench/native-interaction";
import { usePresentationLabels } from "./catalog";
import styles from "./component-dashboard.module.css";

export function BadgeDemo() {
  const labels = usePresentationLabels();
  return (
    <ActionGroup>
      <Badge>{labels.queued}</Badge>
      <Badge tone="emphasis">{labels.running}</Badge>
      <Badge tone="danger">{labels.failed}</Badge>
    </ActionGroup>
  );
}
export function ActionGroupDemo() {
  const labels = usePresentationLabels();
  const [applied, setApplied] = useState(false);
  return (
    <>
      <ActionGroup>
        <Button onClick={() => setApplied(true)}>{labels.apply}</Button>
        <Button variant="secondary" onClick={() => setApplied(false)}>
          {labels.cancel}
        </Button>
      </ActionGroup>
      {applied && (
        <output className={styles["gallery-feedback"]}>{labels.saved}</output>
      )}
    </>
  );
}
export function OptionActionDemo() {
  const labels = usePresentationLabels();
  const [applied, setApplied] = useState(false);
  return (
    <>
      <OptionAction
        label={labels.option}
        description={labels.optionDescription}
        onClick={() => setApplied(true)}
      />
      <OptionAction label={labels.alternative} disabled />
      {applied && (
        <output className={styles["gallery-feedback"]}>{labels.saved}</output>
      )}
    </>
  );
}
export function InlineNoticeDemo() {
  const labels = usePresentationLabels();
  const [ready, setReady] = useState(false);
  return (
    <InlineNotice
      tone={ready ? "neutral" : "danger"}
      title={ready ? labels.noticeReady : labels.noticeTitle}
      actions={
        !ready && (
          <Button variant="secondary" onClick={() => setReady(true)}>
            {labels.retry}
          </Button>
        )
      }
    >
      {ready ? labels.noticeReady : labels.notice}
    </InlineNotice>
  );
}
export function EmptyStateDemo() {
  const labels = usePresentationLabels();
  const [chosen, setChosen] = useState(false);
  return chosen ? (
    <output>{labels.saved}</output>
  ) : (
    <EmptyState
      title={labels.emptyTitle}
      description={labels.emptyDescription}
      note={labels.emptyNote}
      action={<Button onClick={() => setChosen(true)}>{labels.choose}</Button>}
    />
  );
}
export function KbdDemo() {
  const labels = usePresentationLabels();
  return (
    <ActionGroup>
      <Kbd>⌘</Kbd>
      <Kbd>{labels.keyEnter}</Kbd>
      <Kbd>{labels.keyEsc}</Kbd>
    </ActionGroup>
  );
}
export function CopyButtonDemo() {
  const labels = usePresentationLabels();
  return <CopyButton text={labels.copyText} label={labels.copy} />;
}
export function PathLabelDemo() {
  return (
    <div className={styles["gallery-constrained"]} data-long-path>
      <PathLabel path="/Users/example/projects/desktop-application/src/app/renderer/workbench/native-interaction.tsx" />
    </div>
  );
}
export function MessageHeaderDemo() {
  const labels = usePresentationLabels();
  return (
    <article className="message">
      <MessageHeader
        title={labels.assistant}
        status={{ label: labels.running, tone: "emphasis" }}
        actions={<CopyButton text={labels.message} label={labels.copy} />}
      />
      <p>{labels.message}</p>
    </article>
  );
}
export function ToolResultFrameDemo() {
  const labels = usePresentationLabels();
  return (
    <article className="message">
      <ToolResultFrame label={labels.tool} open>
        <pre>
          {labels.toolOutput}
          {"\n"}
          {"src/app/renderer/workbench/".repeat(12)}
        </pre>
      </ToolResultFrame>
    </article>
  );
}
export function ConversationMessageDemo() {
  const labels = usePresentationLabels();
  return (
    <>
      <section className="conversation">
        <ConversationItemView
          rowId="demo-user"
          item={{
            id: 1,
            role: "user",
            state: "complete",
            text: labels.conversationPrompt,
            label: { kind: "literal", text: labels.assistant },
          }}
        />
        <ConversationItemView
          rowId="demo-assistant"
          item={{
            id: 2,
            role: "assistant",
            state: "complete",
            text: labels.conversationReply,
            thinking: labels.conversationThinking,
            label: { kind: "literal", text: labels.assistant },
          }}
        />
      </section>
    </>
  );
}
export function HoverCardDemo() {
  const labels = usePresentationLabels();
  return (
    <>
      <HoverCard
        label={labels.previewQuestion}
        trigger={<Button variant="secondary">{labels.previewQuestion}</Button>}
      >
        <TurnPreviewCard
          number={2}
          question={labels.conversationPrompt}
          reply={labels.conversationReply}
        />
      </HoverCard>
    </>
  );
}
export function NativeInteractionDemo() {
  const labels = usePresentationLabels();
  const [answer, setAnswer] = useState("");
  return (
    <>
      <NativeInteraction
        item={{
          id: "gallery-local",
          method: "select",
          title: labels.nativeTitle,
          message: labels.nativeMessage,
          options: [labels.option, labels.alternative],
          optionDetails: [{ description: labels.optionDescription }],
          status: "pending",
          expiresAt: null,
        }}
        model={{
          answer: async (_id, response) => {
            setAnswer(
              response.kind === "value" ? response.value : labels.cancel,
            );
          },
          dismiss: async () => {
            setAnswer(labels.cancel);
          },
        }}
        available
        trusted
        onFollowUp={undefined}
        onContinueFollowUp={undefined}
        receiptsById={new Map()}
        followUpIds={[]}
      />
      <output className={styles["gallery-feedback"]}>
        {answer ? `${labels.answered}：${answer}` : labels.waiting}
      </output>
    </>
  );
}
