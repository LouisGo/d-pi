import { Component, type ReactNode, useState } from "react";
import { match } from "ts-pattern";
import type {
  ToolExecutionObservation,
  ToolSemantic,
} from "../../../modules/conversation/contracts/public";
import { useI18n } from "../../../modules/preferences/renderer/public";
import {
  Disclosure,
  DisclosureTrigger,
  TextInput,
} from "../../../modules/ui/renderer/public";
import { ToolDetailAction } from "../workbench/tool-inspector";
import type { ToolTarget } from "../workbench/window-workbench";
import { MessageActions } from "./message-parts";
import { ReadingBody } from "./reading-body";
import { ToolObservationDetails } from "./tool-observation";

/** Presentation failure never modifies execution state or hides accessible raw evidence. */
export class ToolBodyBoundary extends Component<
  { children: ReactNode; fallback: ReactNode; revision: unknown },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidUpdate(
    previous: Readonly<{
      children: ReactNode;
      fallback: ReactNode;
      revision: unknown;
    }>,
  ) {
    if (previous.revision !== this.props.revision && this.state.failed)
      this.setState({ failed: false });
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function ToolSemanticBody({
  tool,
  text,
  target,
}: {
  tool: ToolExecutionObservation;
  text: string;
  target?: ToolTarget | undefined;
}) {
  const { t } = useI18n();
  const semantic = tool.semantic;
  const raw = (
    <>
      <ToolObservationDetails tool={tool} />
      <ReadingBody text={text.slice(0, 2048)} raw />
    </>
  );
  return (
    <section
      data-tool-body={semantic?.kind ?? "generic"}
      className="tool-semantic-body"
    >
      <small>
        {t(
          semantic?.phase === "intent"
            ? "tool.semantic.intent"
            : semantic?.phase === "progress"
              ? "tool.semantic.progress"
              : "tool.semantic.result",
        )}
      </small>
      <ToolBodyBoundary
        revision={semantic}
        fallback={
          <>
            <p role="status">{t("tool.semantic.viewFailed")}</p>
            {raw}
          </>
        }
      >
        {semantic && semantic.kind !== "generic" ? (
          <SemanticContent semantic={semantic} text={text} />
        ) : (
          raw
        )}
      </ToolBodyBoundary>
      {(semantic?.partial || tool.coverage === "partial" || tool.truncated) && (
        <p role="status">{t("workbench.tool.partial")}</p>
      )}
      <div className="message-action-bar">
        <ToolDetailAction target={target} />
        <MessageActions text={text} label={t("tool.semantic.copyObserved")} />
      </div>
    </section>
  );
}

function SemanticContent({
  semantic,
  text,
}: {
  semantic: ToolSemantic;
  text: string;
}) {
  const { t } = useI18n();
  return match(semantic)
    .with({ kind: "resource-read" }, (s) => (
      <>
        <code>{s.path}</code>
        <small>{t(`tool.semantic.resource.${s.resourceType}`)}</small>
        <p>{t("tool.semantic.snapshot")}</p>
        {s.startLine !== undefined && (
          <small>{t("tool.semantic.startLine", { line: s.startLine })}</small>
        )}
        <ReadingBody
          text={
            s.excerpt
              ? s.excerpt
                  .split("\n")
                  .map((line, index) => {
                    const number = s.lineNumbers
                      ? s.lineNumbers[index]
                      : s.startLine !== undefined
                        ? s.startLine + index
                        : undefined;
                    return number != null ? `${number} │ ${line}` : line;
                  })
                  .join("\n")
              : text.slice(0, 2048)
          }
          raw
        />
      </>
    ))
    .with({ kind: "search" }, (s) => <SearchResults semantic={s} />)
    .with({ kind: "file-change" }, (s) => (
      <>
        <p>{t("tool.semantic.toolChanges")}</p>
        {s.changes.map((change, index) => (
          <Disclosure
            key={JSON.stringify([change.path, index])}
            variant="inline"
          >
            <DisclosureTrigger>
              <code>
                {change.sourcePath
                  ? `${change.sourcePath} → ${change.path}`
                  : change.path}
              </code>
              {change.failed && <span>{t("ui.conversation.failed")}</span>}
            </DisclosureTrigger>
            {change.patch !== undefined ? (
              <ReadingBody text={change.patch} raw />
            ) : (
              <p>{t("tool.semantic.noPatch")}</p>
            )}
            {change.snapshotsPruned && (
              <p role="status">{t("tool.semantic.snapshotsPruned")}</p>
            )}
          </Disclosure>
        ))}
        {!s.changes.length && <p>{t("tool.semantic.noPatch")}</p>}
      </>
    ))
    .with({ kind: "web-research" }, (s) => (
      <>
        <code>{s.url}</code>
        {s.finalUrl && <code>{s.finalUrl}</code>}
        <ReadingBody text={text.slice(0, 2048)} raw />
      </>
    ))
    .with({ kind: "command" }, (s) => (
      <>
        <code>{s.command}</code>
        <ReadingBody text={text.slice(0, 2048)} raw />
      </>
    ))
    .with({ kind: "generic" }, () => (
      <ReadingBody text={text.slice(0, 2048)} raw />
    ))
    .exhaustive();
}

function SearchResults({
  semantic,
}: {
  semantic: Extract<ToolSemantic, { kind: "search" }>;
}) {
  const { t } = useI18n();
  const [filter, setFilter] = useState("");
  const hits = semantic.hits.filter((hit) =>
    `${hit.path}\n${hit.ranges.map((range) => range.snippet).join("\n")}`
      .toLocaleLowerCase()
      .includes(filter.toLocaleLowerCase()),
  );
  return (
    <>
      <code>{semantic.query}</code>
      <code>{semantic.scope}</code>
      {semantic.matchCount !== undefined && (
        <small>
          {t("tool.semantic.matches", { count: semantic.matchCount })}
        </small>
      )}
      <TextInput
        value={filter}
        aria-label={t("tool.semantic.filter")}
        onChange={(event) => setFilter(event.target.value)}
      />
      <ul>
        {hits.map((hit, index) => (
          <li key={JSON.stringify([hit.path, index])}>
            <code>{hit.path}</code>
            {hit.count !== undefined && (
              <small>{t("tool.semantic.matches", { count: hit.count })}</small>
            )}
            {hit.ranges.map((range, i) => (
              <div key={i}>
                <small>
                  {range.start}–{range.end}
                </small>
                <ReadingBody text={range.snippet} raw />
              </div>
            ))}
          </li>
        ))}
      </ul>
      {semantic.excerpt && <ReadingBody text={semantic.excerpt} raw />}
      {!hits.length && <p>{t("tool.semantic.noLoadedHits")}</p>}
    </>
  );
}
