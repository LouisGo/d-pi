import type { Editor } from "@tiptap/core";
import { Slice } from "@tiptap/pm/model";
import type { EditorView } from "@tiptap/pm/view";
import { createId } from "../../../../shared/identity";
import {
  type AttachmentBridge,
  CLIPBOARD_MIME,
  type ClipboardTicket,
  ClipboardTicketSchema,
} from "../../contracts/public";
import type { AttachmentModel } from "../../core/attachments/attachment-model";
import type { DraftController } from "../../core/draft-controller";
import {
  draftDocument,
  onDraftHistoryClear,
} from "../editor/plain-text-editor";
import {
  AttachmentAdoption,
  isDetachedImage,
} from "../references/attachment-adoption";
import { attachmentNodeAttrs } from "../references/attachment-reference";
import { textPasteTransaction } from "./plain-text-paste";

function readTicket(data: DataTransfer): ClipboardTicket | null {
  let value = data.getData(CLIPBOARD_MIME);
  if (!value) {
    const html = data.getData("text/html");
    if (html.length > 131072) return null;
    const encoded = /data-dpi-context="([^"]{1,2048})"/.exec(html)?.[1];
    if (encoded) {
      try {
        value = decodeURIComponent(encoded);
      } catch {
        return null;
      }
    }
  }
  if (!value || value.length > 1024) return null;
  try {
    const parsed = ClipboardTicketSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
// Any readable fallback must stay ordinary source, without live asset UUID authority.
const readable = (text: string) =>
  text.replace(
    /\[\[dpi-attachment:[^\n]*?(?:\]\]|$)/g,
    "[attachment unavailable]",
  );
export function createTrustedClipboard(options: {
  bridge: AttachmentBridge;
  model: AttachmentModel;
  controller?: DraftController;
  adoption?: AttachmentAdoption;
  isCurrent(): boolean;
  sequence(): number;
  onFeedback(value: "fallback" | "failed" | null): void;
}) {
  const adoption =
    options.adoption ??
    (options.controller
      ? new AttachmentAdoption(options.controller)
      : undefined);
  let tickets: ClipboardTicket[] = [],
    disposed = false;
  let generation = 0;
  let warming: Promise<void> | null = null;
  let flight: Promise<void> | null = null;
  const request = (command: Parameters<AttachmentBridge["request"]>[0]) =>
    options.bridge.request(command);
  const identity = () => ({
    threadId: options.model.threadId,
    traceId: createId(),
  });
  const release = (unused: ClipboardTicket[]) => {
    if (unused.length)
      void request({
        ...identity(),
        kind: "clipboard-release",
        tickets: unused,
      }).catch(() => {});
  };
  function warm(): Promise<void> {
    tickets = tickets.filter((t) => t.expiresAt > Date.now());
    if (disposed || tickets.length || warming)
      return warming ?? Promise.resolve();
    const started = generation;
    const work = request({ ...identity(), kind: "clipboard-reserve" })
      .then((reply) => {
        if (reply.kind !== "clipboard-tickets") return;
        if (disposed || generation !== started) release(reply.tickets);
        else tickets = reply.tickets;
      })
      .catch(() => {})
      .finally(() => {
        if (warming === work) warming = null;
      });
    warming = work;
    return work;
  }
  function copy(
    view: EditorView,
    event: ClipboardEvent,
    cut: boolean,
  ): boolean {
    if (
      disposed ||
      !options.isCurrent() ||
      view.isDestroyed ||
      view.state.selection.empty ||
      !event.clipboardData ||
      view.composing ||
      (cut &&
        (!view.editable ||
          !options.model.stateStore.getState().acceptingSources))
    )
      return false;
    options.onFeedback(null);
    const slice = view.state.selection.content();
    let text: string | undefined;
    view.someProp("clipboardTextSerializer", (serializer) => {
      text = serializer(slice, view);
      return true;
    });
    if (text === undefined) return false;
    const names = new Map<string, string>();
    slice.content.descendants((node) => {
      if (node.type.name === "attachmentReference")
        names.set(
          String(node.attrs.id),
          String(node.attrs.name ?? "attachment unavailable"),
        );
    });
    const plain = readable(
      text.replace(
        /\[\[dpi-attachment:([0-9a-f-]{36})\]\]/g,
        (_token, id: string) =>
          `[attachment: ${names.get(id) ?? "unavailable"}]`,
      ),
    );
    tickets = tickets.filter((ticket) => ticket.expiresAt > Date.now());
    const ticket = names.size <= 32 ? tickets.shift() : undefined;
    event.preventDefault();
    event.clipboardData.setData("text/plain", plain);
    event.clipboardData.setData(CLIPBOARD_MIME, "");
    event.clipboardData.setData("text/html", "");
    if (ticket) {
      const envelope = JSON.stringify(ticket);
      event.clipboardData.setData(CLIPBOARD_MIME, envelope);
      event.clipboardData.setData(
        "text/html",
        `<pre data-dpi-context="${encodeURIComponent(envelope)}">${plain.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>`,
      );
      void request({
        ...identity(),
        kind: "clipboard-export",
        ticket,
        text,
        ids: [...names.keys()],
      })
        .then((reply) => {
          if (!disposed && reply.kind !== "clipboard-exported")
            options.onFeedback("failed");
          else if (
            !disposed &&
            reply.kind === "clipboard-exported" &&
            reply.degraded
          )
            options.onFeedback("fallback");
        })
        .catch(() => {
          if (!disposed) options.onFeedback("failed");
        });
    } else options.onFeedback("fallback");
    if (cut)
      view.dispatch(
        view.state.tr
          .deleteSelection()
          .setMeta("uiEvent", "cut")
          .setMeta("dpiIndependentAction", true),
      );
    void warm();
    return true;
  }
  function paste(view: EditorView, event: ClipboardEvent): boolean {
    const data = event.clipboardData;
    if (
      !data ||
      (!data.types.includes(CLIPBOARD_MIME) &&
        !data.getData("text/html").includes("data-dpi-context="))
    )
      return false;
    event.preventDefault();
    if (
      disposed ||
      !options.isCurrent() ||
      !view.editable ||
      view.composing ||
      !options.model.stateStore.getState().acceptingSources
    )
      return true;
    if (flight) {
      options.onFeedback("failed");
      return true;
    }
    options.onFeedback(null);
    const fallback = readable(data.getData("text/plain"));
    const ticket = readTicket(data);
    if (!ticket) {
      view.dispatch(textPasteTransaction(view.state, fallback));
      options.onFeedback("fallback");
      return true;
    }
    const attemptGeneration = generation;
    const doc = view.state.doc,
      selection = view.state.selection,
      sequence = options.sequence();
    const current = () =>
      !disposed &&
      generation === attemptGeneration &&
      !view.isDestroyed &&
      view.editable &&
      !view.composing &&
      options.isCurrent() &&
      options.model.stateStore.getState().acceptingSources &&
      options.sequence() === sequence &&
      view.state.doc === doc &&
      view.state.selection.eq(selection);
    flight = options.model
      .run({ kind: "clipboard-import", ticket })
      .then(async (reply) => {
        if (reply?.kind === "clipboard-imported") {
          if (!current()) {
            await options.model.run({
              kind: "clipboard-discard",
              ids: reply.items.map((item) => item.id),
            });
            if (!disposed && options.isCurrent()) options.onFeedback("failed");
            return;
          }
          const accepted = adoption ? adoption.admit(reply.items) : reply.items;
          const acceptedIds = new Set(accepted.map((item) => item.id));
          const images = options.controller
            ? accepted.filter(isDetachedImage)
            : [];
          const omitted = new Set(
            reply.items
              .filter(
                (item) => !acceptedIds.has(item.id) || images.includes(item),
              )
              .map((item) => item.id),
          );
          const text = reply.text.replace(
            /\[\[dpi-attachment:([0-9a-f-]{36})\]\]/g,
            (token, id: string) => (omitted.has(id) ? "" : token),
          );
          const content = view.state.schema.nodeFromJSON(draftDocument(text));
          const tr = view.state.tr.replaceSelection(
            new Slice(
              content.content,
              content.firstChild?.isTextblock ? 1 : 0,
              content.lastChild?.isTextblock ? 1 : 0,
            ),
          );
          tr.doc.descendants((node, position) => {
            if (node.type.name !== "attachmentReference") return;
            const item = reply.items.find((item) => item.id === node.attrs.id);
            if (item)
              tr.setNodeMarkup(position, undefined, {
                ...node.attrs,
                ...attachmentNodeAttrs(item),
              });
          });
          if (text)
            view.dispatch(
              tr
                .setMeta("paste", true)
                .setMeta("uiEvent", "paste")
                .setMeta("dpiIndependentAction", true)
                .scrollIntoView(),
            );
          if (text && !view.state.doc.eq(tr.doc)) {
            await options.model.run({
              kind: "clipboard-discard",
              ids: reply.items.map((item) => item.id),
            });
            if (!disposed && options.isCurrent()) options.onFeedback("failed");
            return;
          }
          options.controller?.addDetachedAttachments(
            images.map((item) => item.id),
          );
          const discarded = reply.items.filter(
            (item) => !acceptedIds.has(item.id),
          );
          if (discarded.length)
            await options.model.run({
              kind: "clipboard-discard",
              ids: discarded.map((item) => item.id),
            });
          if (reply.degraded) options.onFeedback("fallback");
        } else if (current()) {
          view.dispatch(textPasteTransaction(view.state, fallback));
          options.onFeedback("fallback");
        }
      })
      .catch(() => {
        if (current()) {
          view.dispatch(textPasteTransaction(view.state, fallback));
          options.onFeedback("failed");
        }
      })
      .finally(() => {
        flight = null;
      });
    return true;
  }
  return {
    start: () => {
      disposed = false;
      generation++;
      warming = null;
      void warm();
    },
    bindEditor: (editor: Editor) =>
      onDraftHistoryClear(editor, () => {
        generation++;
      }),
    warm,
    copy,
    paste,
    settled: () => flight ?? Promise.resolve(),
    dispose: () => {
      disposed = true;
      generation++;
      release(tickets);
      tickets = [];
    },
  };
}
