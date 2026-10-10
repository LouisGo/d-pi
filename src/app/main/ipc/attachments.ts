import { randomUUID } from "node:crypto";
import type { WebContents, WebFrameMain } from "electron";
import type { Diagnostics } from "../../../platform/main/diagnostics/public";
import { AttachmentRequestSchema } from "../../contracts/attachments";
import type { AttachmentService } from "../wiring/attachment-service";
import type { IpcSourceContext } from "./context";
export function registerAttachmentIpc(
  context: IpcSourceContext & {
    getService: () => AttachmentService | undefined;
    getDiagnostics: () =>
      | Pick<Diagnostics, "record" | "processInstanceId">
      | undefined;
  },
) {
  const documents = new Map<
    WebContents,
    { owner: string; frame: WebFrameMain }
  >();
  const observed = new WeakSet<WebContents>();
  const navigating = new WeakMap<
    WebContents,
    { frame: WebFrameMain | null; url: string }
  >();
  function documentEvent(sender: WebContents, causeCode: string): void {
    const diagnostics = context.getDiagnostics();
    const traceId = randomUUID();
    diagnostics?.record({
      traceId,
      requestId: traceId,
      connectionId:
        documents.get(sender)?.owner ?? diagnostics.processInstanceId,
      operation: "attachments:document",
      stage: "confirmed",
      causeCode,
    });
  }
  const matchesFrame = (
    sender: WebContents,
    processId: number,
    routingId: number,
  ) =>
    sender.mainFrame.processId === processId &&
    sender.mainFrame.routingId === routingId;
  function resumeStopped(sender: WebContents): void {
    // Starting a navigation is not a document replacement. An aborted load
    // resumes the unchanged owner and its Undo/clipboard authorities.
    if (navigating.has(sender) && !sender.isLoadingMainFrame()) {
      documentEvent(sender, "attachment-navigation-resumed");
      navigating.delete(sender);
    }
  }
  function ownerFor(
    sender: WebContents,
    frame: WebFrameMain | null,
  ): string | undefined {
    if (!frame || frame !== sender.mainFrame) return undefined;
    if (navigating.has(sender)) return undefined;
    let document = documents.get(sender);
    if (document && document.frame !== frame) {
      documentEvent(sender, "attachment-frame-replaced");
      context.getService()?.store.releaseEditorHistories(document.owner);
      documents.delete(sender);
      document = undefined;
    }
    if (!document) {
      document = { owner: randomUUID(), frame };
      documents.set(sender, document);
    }
    if (!observed.has(sender)) {
      observed.add(sender);
      const release = () => {
        const current = documents.get(sender);
        if (current)
          context.getService()?.store.releaseEditorHistories(current.owner);
        documents.delete(sender);
      };
      sender.on("destroyed", () => {
        documentEvent(sender, "attachment-document-destroyed");
        release();
      });
      sender.on("render-process-gone", () => {
        documentEvent(sender, "attachment-renderer-gone");
        release();
      });
      sender.on("did-start-navigation", (details) => {
        if (details.isMainFrame && !details.isSameDocument) {
          documentEvent(sender, "attachment-navigation-started");
          navigating.set(sender, { frame: details.frame, url: details.url });
        }
      });
      sender.on(
        "did-frame-finish-load",
        (_event, isMainFrame, processId, routingId) => {
          if (isMainFrame && matchesFrame(sender, processId, routingId))
            resumeStopped(sender);
        },
      );
      sender.on(
        "did-frame-navigate",
        (_event, url, _code, _status, isMainFrame, processId, routingId) => {
          if (
            isMainFrame &&
            matchesFrame(sender, processId, routingId) &&
            sender.mainFrame.url === url
          ) {
            documentEvent(sender, "attachment-document-replaced");
            release();
            navigating.delete(sender);
          }
        },
      );
      sender.on("did-stop-loading", () => resumeStopped(sender));
      const failed = (
        _event: Electron.Event,
        _code: number,
        _description: string,
        url: string,
        isMainFrame: boolean,
        processId: number,
        routingId: number,
      ) => {
        if (
          isMainFrame &&
          navigating.get(sender)?.url === url &&
          matchesFrame(sender, processId, routingId)
        )
          resumeStopped(sender);
      };
      sender.on("did-fail-load", failed);
      sender.on("did-fail-provisional-load", failed);
    }
    return document.owner;
  }
  context.ipcMain.handle("attachments:request", async (event, raw: unknown) => {
    if (!context.sourceValid(event)) throw Error("Invalid attachment source");
    const command = AttachmentRequestSchema.parse(raw);
    const diagnostics = context.getDiagnostics();
    const started = performance.now();
    const owner = ownerFor(event.sender, event.senderFrame);
    const identity = {
      traceId: command.traceId,
      requestId: randomUUID(),
      threadId: command.threadId,
      connectionId: owner ?? diagnostics?.processInstanceId ?? randomUUID(),
      operation: `attachments:${command.kind}`,
    };
    diagnostics?.record({ ...identity, stage: "received" });
    try {
      const service = context.getService();
      if (!service) throw Error("Attachment storage unavailable");
      const reply = await service.execute(command, owner);
      const failedAttachment =
        reply.kind === "attachments" && command.kind !== "list"
          ? reply.items.find((item) => item.status === "failed")
          : undefined;
      diagnostics?.record({
        ...identity,
        stage:
          reply.kind === "unavailable" ||
          reply.kind === "clipboard-unavailable" ||
          failedAttachment
            ? "failed"
            : "completed",
        ...(reply.kind === "unavailable"
          ? { code: reply.reason }
          : reply.kind === "clipboard-unavailable"
            ? { code: `clipboard-${reply.reason}` }
            : failedAttachment
              ? {
                  code:
                    failedAttachment.reason ??
                    "attachment-operation-unavailable",
                }
              : {}),
        ...(reply.kind === "unavailable" &&
        reply.reason === "reference-denied" &&
        command.kind.startsWith("history-")
          ? {
              causeCode: !event.senderFrame
                ? "attachment-frame-missing"
                : event.senderFrame !== event.sender.mainFrame
                  ? "attachment-frame-stale"
                  : navigating.has(event.sender)
                    ? "attachment-navigation-pending"
                    : "attachment-lease-owner-mismatch",
            }
          : {}),
        durationMs: performance.now() - started,
      });
      return reply;
    } catch (error) {
      diagnostics?.record({
        ...identity,
        stage: "failed",
        code: "attachment-operation-unavailable",
        durationMs: performance.now() - started,
      });
      throw error;
    }
  });
}
