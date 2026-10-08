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
  const matchesFrame = (
    sender: WebContents,
    processId: number,
    routingId: number,
  ) =>
    sender.mainFrame.processId === processId &&
    sender.mainFrame.routingId === routingId;
  function resumeStopped(sender: WebContents): void {
    // A failed provisional load may keep the original document. Resume it with
    // a fresh owner only after *all* main navigation has actually stopped.
    if (navigating.has(sender) && !sender.isLoadingMainFrame())
      navigating.delete(sender);
  }
  function ownerFor(
    sender: WebContents,
    frame: WebFrameMain | null,
  ): string | undefined {
    if (!frame || frame !== sender.mainFrame) return undefined;
    if (navigating.has(sender)) return undefined;
    let document = documents.get(sender);
    if (document && document.frame !== frame) {
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
      sender.on("destroyed", release);
      sender.on("render-process-gone", release);
      sender.on("did-start-navigation", (details) => {
        if (details.isMainFrame && !details.isSameDocument) {
          navigating.set(sender, { frame: details.frame, url: details.url });
          release();
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
          const pending = navigating.get(sender);
          if (
            pending &&
            isMainFrame &&
            matchesFrame(sender, processId, routingId) &&
            sender.mainFrame.url === url &&
            (pending.frame !== sender.mainFrame || pending.url === url)
          )
            navigating.delete(sender);
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
    const identity = {
      traceId: command.traceId,
      requestId: randomUUID(),
      threadId: command.threadId,
      connectionId: diagnostics?.processInstanceId ?? randomUUID(),
      operation: `attachments:${command.kind}`,
    };
    diagnostics?.record({ ...identity, stage: "received" });
    try {
      const service = context.getService();
      if (!service) throw Error("Attachment storage unavailable");
      const reply = await service.execute(
        command,
        ownerFor(event.sender, event.senderFrame),
      );
      diagnostics?.record({
        ...identity,
        stage:
          reply.kind === "unavailable" || reply.kind === "clipboard-unavailable"
            ? "failed"
            : "completed",
        ...(reply.kind === "unavailable"
          ? { code: reply.reason }
          : reply.kind === "clipboard-unavailable"
            ? { code: `clipboard-${reply.reason}` }
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
