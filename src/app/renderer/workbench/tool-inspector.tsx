import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useStore } from "zustand";
import type { ToolExecutionObservation } from "../../../modules/conversation/contracts/public";
import { useI18n } from "../../../modules/preferences/renderer/public";
import { sourceKey } from "../../../modules/resources/contracts/public";
import { Button } from "../../../modules/ui/renderer/public";
import type { WorkspaceHost } from "../shell/layout/workbench-frame";
import type { AppModel } from "../wiring/model";
import type {
  ToolSurface,
  ToolTarget,
  WindowWorkbench,
} from "./window-workbench";

export function commandSummary(tool: ToolExecutionObservation): string {
  const value = tool.arguments?.value;
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof value.command === "string"
  )
    return value.command.slice(0, 240);
  return value !== undefined
    ? (JSON.stringify(value) ?? tool.name).slice(0, 240)
    : tool.name;
}
export const ToolWorkbenchContext = createContext<WindowWorkbench | null>(null);
export function ToolCard({
  target,
  command,
  summary,
  status,
  toolCallId,
  partial,
}: {
  target?: ToolTarget | undefined;
  command: string;
  summary: string;
  status: string;
  toolCallId: string;
  partial: boolean;
}) {
  const workbench = useContext(ToolWorkbenchContext);
  const { t } = useI18n();
  return (
    <div className="command-card" data-command-card>
      <code>{command}</code>
      <small data-selectable>{toolCallId}</small>
      {status && <span role="status">{status}</span>}
      <pre data-selectable>
        {summary.split("\n").slice(0, 6).join("\n").slice(0, 2048) ||
          t("ui.conversation.waitingResult")}
      </pre>
      <Button
        variant="secondary"
        data-command-open={target ? sourceKey(target.source) : undefined}
        disabled={!target || !workbench}
        onClick={() => target && workbench?.open(target)}
      >
        {t("workbench.tool.open")}
      </Button>
      {partial && <small>{t("workbench.tool.partial")}</small>}
      {!target && <small>{t("workbench.tool.sourceUnavailable")}</small>}
    </div>
  );
}
export function useToolWorkspace(model: AppModel): WorkspaceHost | undefined {
  const surfaces = useStore(
    model.workbench.stateStore,
    (state) => state.surfaces,
  );
  const revealToken = useStore(
    model.workbench.stateStore,
    (state) => state.revealToken,
  );
  const selected = useStore(
    model.workbench.stateStore,
    (state) => state.selected,
  );
  const { t } = useI18n();
  if (!surfaces.length) return undefined;
  return {
    tabs: surfaces.map((surface) => ({
      id: surface.id,
      title: `${surface.pinned ? t("workbench.tool.pinned") + " · " : ""}${surface.target.title}`,
      content: <ToolInspector key={surface.id} model={model} id={surface.id} />,
    })),
    selected,
    revealToken,
    onSelect: (id) => model.workbench.select(id),
    onClose: (id) => model.workbench.close(id),
  };
}
export function ToolInspector({ model, id }: { model: AppModel; id: string }) {
  const surface = useStore(model.workbench.stateStore, (state) =>
    state.surfaces.find((surface) => surface.id === id),
  );
  if (!surface) return null;
  return <ToolInspectorBody model={model} surface={surface} />;
}
function ToolInspectorBody({
  model,
  surface,
}: {
  model: AppModel;
  surface: ToolSurface;
}) {
  const { t } = useI18n();
  const thread = useStore(model.stateStore, (state) =>
    state.kind === "ready" &&
    !state.busy &&
    !state.threadTransition &&
    state.threadSelection.kind === "thread"
      ? state.threadSelection.thread
      : null,
  );
  const returnIssue = useStore(
    model.workbench.stateStore,
    (state) => state.returnIssue,
  );
  const pending = useStore(model.attention.stateStore, (state) =>
    thread
      ? state.byThread.get(thread.context.threadId)?.kind === "needs-answer"
      : false,
  );
  const ref = useRef<HTMLElement>(null);
  const revealToken = useStore(model.workbench.stateStore, (state) =>
    state.selected === surface.id ? state.revealToken : null,
  );
  useEffect(() => {
    if (revealToken === null) return;
    const frame = requestAnimationFrame(() => {
      if (!ref.current?.closest("[hidden]"))
        ref.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [revealToken]);
  const close = () => {
    model.workbench.close(surface.id);
    requestAnimationFrame(() => {
      const source = Array.from(
        document.querySelectorAll<HTMLElement>("[data-command-open]"),
      ).find(
        (node) => node.dataset.commandOpen === sourceKey(surface.target.source),
      );
      (
        source ??
        document.querySelector<HTMLElement>("[data-reading-pane=conversation]")
      )?.focus({ preventScroll: true });
    });
  };
  const [copyFailed, setCopyFailed] = useState(false);
  const detail = surface.selection?.detail ?? surface.detail;
  const destination = thread?.context.title || thread?.context.threadId;
  const copied =
    surface.selection && detail
      ? detail.text.slice(surface.selection.start, surface.selection.end)
      : (detail?.text ?? "");
  return (
    <section
      ref={ref}
      tabIndex={-1}
      data-tool-inspector
      className="tool-inspector"
      aria-label={t("workbench.tool.heading")}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          close();
        }
      }}
    >
      <header>
        <strong>{surface.target.title}</strong>
        <small data-tool-origin>
          {t("workbench.tool.origin", { thread: surface.target.threadTitle })}
        </small>
        <div className="tool-inspector-actions">
          <Button
            variant="ghost"
            disabled={surface.pinned}
            onClick={() => model.workbench.pin(surface.id)}
          >
            {t(surface.pinned ? "workbench.tool.pinned" : "workbench.tool.pin")}
          </Button>
          <Button
            variant="ghost"
            onClick={() => void model.workbench.returnToSource(surface.id)}
          >
            {t("workbench.tool.return")}
          </Button>
          <Button
            variant="ghost"
            disabled={!copied}
            onClick={() => {
              void navigator.clipboard.writeText(copied).then(
                () => setCopyFailed(false),
                () => setCopyFailed(true),
              );
            }}
          >
            {t("ui.conversation.copy")}
          </Button>
          <Button variant="ghost" onClick={close}>
            {t("app.layout.close")}
          </Button>
        </div>
      </header>
      {!detail && (
        <p role="status">
          {t(
            surface.unavailable ? "workbench.tool.unavailable" : "app.loading",
          )}
        </p>
      )}
      {detail && (
        <>
          <p className="muted" role="status">
            {t(`workbench.tool.lifecycle.${detail.lifecycle}`)} ·{" "}
            {detail.contentRevision} ·{" "}
            {t(
              detail.nativeRecordId || detail.source.kind === "native-record"
                ? "workbench.tool.saved"
                : "workbench.tool.liveOnly",
            )}
          </p>
          {(detail.coverage === "partial" || detail.truncated) && (
            <p role="status">{t("workbench.tool.partial")}</p>
          )}
          {detail.argumentsText && (
            <pre className="tool-inspector-arguments" data-selectable>
              {detail.argumentsText}
            </pre>
          )}
          <textarea
            aria-label={t("workbench.tool.output")}
            className="tool-inspector-output"
            readOnly
            value={detail.text}
            spellCheck={false}
            onSelect={(event) => {
              const element = event.currentTarget;
              if (element.selectionEnd > element.selectionStart)
                model.workbench.selectRange(
                  surface.id,
                  detail,
                  element.selectionStart,
                  element.selectionEnd,
                );
            }}
          />
          {surface.selection && (
            <div role="status">
              {t("workbench.tool.frozen", {
                revision: surface.selection.detail.contentRevision,
              })}
              {surface.detail?.contentRevision !==
                surface.selection.detail.contentRevision && (
                <span> · {t("workbench.tool.newer")}</span>
              )}
              <Button
                variant="ghost"
                onClick={() => model.workbench.resume(surface.id)}
              >
                {t("workbench.tool.resume")}
              </Button>
            </div>
          )}
        </>
      )}
      <footer>
        {destination && (
          <p data-context-destination>
            {t("workbench.tool.destination", { thread: destination })}
          </p>
        )}
        <Button
          disabled={!thread || !detail?.text}
          onClick={() => {
            if (thread)
              model.workbench.reference(surface.id, {
                key: thread.key,
                controller: thread.controller,
                title: destination ?? thread.context.threadId,
              });
          }}
        >
          {t(
            surface.selection
              ? "workbench.tool.referenceSelection"
              : "workbench.tool.reference",
          )}
        </Button>
        <Button
          variant="ghost"
          disabled={!thread || !pending}
          onClick={() => {
            if (thread) {
              const entry = model.attention.stateStore
                .getState()
                .byThread.get(thread.context.threadId);
              if (entry?.kind === "needs-answer") model.attention.locate(entry);
            }
          }}
        >
          {t("workbench.tool.pending")}
        </Button>
        {surface.issue && (
          <p role="alert">{t(`workbench.tool.issue.${surface.issue}`)}</p>
        )}
        {returnIssue && (
          <p role="status">{t(`workbench.tool.return.${returnIssue}`)}</p>
        )}
        {copyFailed && <p role="alert">{t("workbench.tool.copyFailed")}</p>}
      </footer>
    </section>
  );
}
