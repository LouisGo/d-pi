import { randomUUID } from "node:crypto";

export class QueueOperationError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

export class NativeQueueManager {
  constructor(session, helpers = {}) {
    this.session = session;
    this.helpers = {
      isUserAuthored: (message) =>
        message.role === "user" && message.attribution !== "agent",
      isCompanion: () => false,
      displayText: (message) =>
        typeof message.content === "string"
          ? message.content
          : (message.content ?? [])
              .filter((part) => part.type === "text")
              .map((part) => part.text)
              .join(""),
      ...helpers,
    };
    this.ids = new WeakMap();
    this.revision = 0;
    this.editing = null;
    this.detach = session.agent.onQueueChange(() => {
      this.revision++;
    });
    this.previousPrepare = session.agent.prepareQueuedMessages;
    this.prepare = async (messages, signal) => {
      await this.waitForEdit(messages, signal);
      const result = await this.previousPrepare?.(messages, signal);
      // An edit may have started while the SDK was awaiting policy preparation.
      await this.waitForEdit(messages, signal);
      return result;
    };
    session.agent.prepareQueuedMessages = this.prepare;
  }
  id(message) {
    if (!this.ids.has(message)) this.ids.set(message, randomUUID());
    return this.ids.get(message);
  }
  read(kind) {
    return kind === "steering"
      ? this.session.agent.peekSteeringQueue()
      : this.session.agent.peekFollowUpQueue();
  }
  snapshot() {
    const all = ["steering", "followUp"].flatMap((kind) =>
      this.read(kind)
        .filter(this.helpers.isUserAuthored)
        .map((message) => ({
          id: this.id(message),
          kind,
          text: this.helpers.displayText(message),
          editable: this.editable(message, kind),
          editing: this.editing?.entryId === this.id(message),
          truncated: false,
        })),
    );
    const editing = this.editing
      ? { entryId: this.editing.entryId, draftText: this.editing.draftText }
      : null;
    // Reserve metadata for every represented entry even once the text budget is spent.
    let remaining = 524288 - Buffer.byteLength(JSON.stringify(editing)) - 32768;
    const items = all.slice(0, 128).map((entry) => {
      if (
        Buffer.byteLength(JSON.stringify(entry)) > remaining ||
        Buffer.byteLength(JSON.stringify(entry.text)) > 262144
      ) {
        entry.text = entry.text.slice(0, 2048);
        entry.editable = false;
        entry.truncated = true;
        if (Buffer.byteLength(JSON.stringify(entry)) > remaining)
          entry.text = "";
      }
      remaining -= Buffer.byteLength(JSON.stringify(entry)) + 1;
      return entry;
    });
    const hiddenCount = all.length - items.length;
    return {
      revision: this.revision,
      items,
      editing,
      hiddenCount,
      coverage:
        hiddenCount || items.some((entry) => entry.truncated)
          ? "limited"
          : "complete",
    };
  }
  editable(message, kind) {
    const native = this.read(kind),
      index = native.indexOf(message);
    return (
      message.role === "user" &&
      (typeof message.content === "string" ||
        (message.content.length === 1 && message.content[0].type === "text")) &&
      Buffer.byteLength(JSON.stringify(this.helpers.displayText(message))) <=
        262144 &&
      !(index > 0 && this.helpers.isCompanion(native[index - 1]))
    );
  }
  async waitForEdit(messages, signal) {
    signal?.throwIfAborted();
    while (this.editing && messages.includes(this.editing.message)) {
      await this.helpers.gate.wait(signal);
    }
  }
  find(entryId) {
    for (const kind of ["steering", "followUp"]) {
      const native = this.read(kind);
      const index = native.findIndex(
        (message) =>
          this.helpers.isUserAuthored(message) && this.id(message) === entryId,
      );
      if (index >= 0) return { kind, native, index, message: native[index] };
    }
    throw new QueueOperationError("entry-consumed");
  }
  async execute(command) {
    if (command.revision !== this.revision)
      throw new QueueOperationError("stale-revision");
    const target = this.find(command.entryId);
    if (command.action === "begin-edit") {
      if (this.editing) throw new QueueOperationError("editing-active");
      if (!this.editable(target.message, target.kind))
        throw new QueueOperationError("unsupported-content");
      if (
        !this.snapshot().items.find((entry) => entry.id === command.entryId)
          ?.editable
      )
        throw new QueueOperationError("unsupported-content");
      this.helpers.gate.pause("queue-edit");
      this.editing = {
        entryId: command.entryId,
        message: target.message,
        draftText: this.helpers.displayText(target.message),
      };
      this.revision++;
    } else if (command.action === "cancel-edit") {
      this.requireEdit(command.entryId);
      this.editing = null;
      this.revision++;
      this.helpers.gate.resume("queue-edit");
      await this.session.runModeExitTeardown(async () => {});
    } else if (command.action === "update-edit") {
      this.requireEdit(command.entryId);
      this.validateText(command.text, true);
      this.editing.draftText = command.text;
      this.revision++;
    } else if (command.action === "save-edit") {
      this.requireEdit(command.entryId);
      const text = command.text ?? this.editing.draftText;
      this.validateText(text);
      const replacement = {
        ...target.message,
        content: [{ type: "text", text }],
      };
      this.ids.set(replacement, command.entryId);
      const next = [...target.native];
      next[target.index] = replacement;
      // Synchronous native replacement confirms the update before unblocking delivery.
      this.session.agent.replaceQueue(target.kind, next);
      this.editing = null;
      this.helpers.gate.resume("queue-edit");
      await this.session.runModeExitTeardown(async () => {});
    } else if (command.action === "delete" || command.action === "move") {
      if (this.editing) throw new QueueOperationError("editing-active");
      const start = this.groupStart(target.native, target.index);
      const group = target.native.slice(start, target.index + 1);
      const next = [...target.native];
      next.splice(start, group.length);
      if (command.action === "move") {
        const visible = next.filter(this.helpers.isUserAuthored);
        if (
          !Number.isInteger(command.toIndex) ||
          command.toIndex < 0 ||
          command.toIndex > visible.length
        )
          throw new QueueOperationError("invalid-order");
        const anchor = visible[command.toIndex];
        const insert = anchor
          ? this.groupStart(next, next.indexOf(anchor))
          : next.length;
        next.splice(insert, 0, ...group);
      }
      this.session.agent.replaceQueue(target.kind, next);
      await this.session.runModeExitTeardown(async () => {});
    } else {
      throw new QueueOperationError("invalid-operation");
    }
    return this.snapshot();
  }
  requireEdit(entryId) {
    if (this.editing?.entryId !== entryId)
      throw new QueueOperationError("not-editing");
  }
  groupStart(native, index) {
    let start = index;
    while (start > 0 && this.helpers.isCompanion(native[start - 1])) start--;
    return start;
  }
  validateText(text, allowEmpty = false) {
    if (typeof text !== "string" || (!allowEmpty && !text.trim()))
      throw new QueueOperationError("invalid-content");
    if (Buffer.byteLength(JSON.stringify(text)) > 262144)
      throw new QueueOperationError("content-too-large");
  }
  dispose() {
    this.detach();
    if (this.session.agent.prepareQueuedMessages === this.prepare)
      this.session.agent.prepareQueuedMessages = this.previousPrepare;
    this.editing = null;
    this.helpers.gate?.resume("queue-edit");
  }
}
