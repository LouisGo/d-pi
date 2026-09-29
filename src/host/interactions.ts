import {
  type Answer,
  DialogSchema,
  type Interaction,
} from "../features/control/interactions";
import type { NativeFrame } from "../features/runtime/native-protocol";
export class PendingInteractions {
  private readonly ids = new Set<string>();
  private overflow = false;
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  constructor(private readonly changed: () => void = () => {}) {}
  get unsupported(): boolean {
    return this.overflow || [...this.ids].some((id) => !this.dialogs.has(id));
  }
  dispose(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }
  disconnect(): void {
    this.dispose();
    for (const [id, dialog] of this.dialogs)
      if (dialog.status === "pending") {
        this.dialogs.set(id, { ...dialog, status: "unknown" });
        this.ids.delete(id);
      }
    this.changed();
  }
  private expire(): void {
    for (const [id, dialog] of this.dialogs) {
      if (
        dialog.status === "pending" &&
        dialog.expiresAt !== null &&
        dialog.expiresAt <= Date.now()
      ) {
        this.dialogs.set(id, { ...dialog, status: "expired" });
        this.ids.delete(id);
      }
    }
  }
  private readonly dialogs = new Map<string, Interaction>();
  snapshot(): Interaction[] {
    this.expire();
    return [...this.dialogs.values()];
  }
  markDefaultAnswered(id: string): boolean {
    const dialog = this.dialogs.get(id);
    if (!dialog || dialog.status !== "sent") return false;
    this.dialogs.set(id, { ...dialog, defaultAnswered: true });
    this.changed();
    return true;
  }
  answerDefault(
    id: string,
    answer: Answer,
    write: (frame: string) => void,
  ): boolean {
    // Atomic default write: status and defaultAnswered land in one mutation
    // so callers publish a single snapshot. Success shows sent+defaultAnswered
    // (stays in the active group); failure leaves unknown without the flag.
    // No changed() here; the caller publishes once.
    this.expire();
    const dialog = this.dialogs.get(id);
    if (!dialog || dialog.status !== "pending" || !this.ids.has(id))
      return false;
    if (
      answer.kind !== "cancel" &&
      (dialog.method === "confirm") !== (answer.kind === "confirm")
    )
      return false;
    if (
      dialog.method === "select" &&
      answer.kind === "value" &&
      !dialog.options?.includes(answer.value)
    )
      return false;
    const fields =
      answer.kind === "cancel"
        ? { cancelled: true }
        : answer.kind === "confirm"
          ? { confirmed: answer.confirmed }
          : { value: answer.value };
    this.dialogs.set(id, { ...dialog, status: "unknown" });
    try {
      write(
        `${JSON.stringify({ type: "extension_ui_response", id, ...fields })}\n`,
      );
    } catch {
      this.ids.delete(id);
      return false;
    }
    this.dialogs.set(id, { ...dialog, status: "sent", defaultAnswered: true });
    this.ids.delete(id);
    return true;
  }
  answer(id: string, answer: Answer, write: (frame: string) => void): boolean {
    this.expire();
    const dialog = this.dialogs.get(id);
    if (!dialog || dialog.status !== "pending" || !this.ids.has(id))
      return false;
    if (
      answer.kind !== "cancel" &&
      (dialog.method === "confirm") !== (answer.kind === "confirm")
    )
      return false;
    if (
      dialog.method === "select" &&
      answer.kind === "value" &&
      !dialog.options?.includes(answer.value)
    )
      return false;
    const fields =
      answer.kind === "cancel"
        ? { cancelled: true }
        : answer.kind === "confirm"
          ? { confirmed: answer.confirmed }
          : { value: answer.value };
    this.dialogs.set(id, { ...dialog, status: "unknown" });
    try {
      write(
        `${JSON.stringify({ type: "extension_ui_response", id, ...fields })}\n`,
      );
    } catch {
      this.ids.delete(id);
      return false;
    }
    this.dialogs.set(id, { ...dialog, status: "sent" });
    this.ids.delete(id);
    return true;
  }
  update(frame: NativeFrame): void {
    if (
      frame.type === "extension_ui_request" &&
      frame.method === "cancel" &&
      typeof frame.targetId === "string"
    ) {
      this.ids.delete(frame.targetId);
      const dialog = this.dialogs.get(frame.targetId);
      if (dialog)
        this.dialogs.set(frame.targetId, { ...dialog, status: "cancelled" });
      return;
    }
    if (
      (frame.type === "host_tool_cancel" || frame.type === "host_uri_cancel") &&
      typeof frame.id === "string"
    ) {
      const had = this.ids.delete(frame.id);
      const timer = this.timers.get(frame.id);
      if (timer) {
        clearTimeout(timer);
        this.timers.delete(frame.id);
      }
      const dialog = this.dialogs.get(frame.id);
      if (dialog && dialog.status === "pending") {
        this.dialogs.set(frame.id, { ...dialog, status: "cancelled" });
        this.changed();
      } else if (had || timer) {
        this.changed();
      }
      return;
    }
    if (
      frame.type === "extension_ui_request" &&
      [
        "notify",
        "setStatus",
        "setWidget",
        "setTitle",
        "set_editor_text",
        "open_url",
      ].includes(String(frame.method))
    )
      return;
    if (
      frame.type !== "extension_ui_request" &&
      frame.type !== "host_tool_call" &&
      frame.type !== "host_uri_request"
    )
      return;
    if (typeof frame.id !== "string" || this.ids.size >= 128) {
      this.overflow = true;
      return;
    }
    if (this.dialogs.has(frame.id)) return;
    this.ids.add(frame.id);
    for (const [id, value] of this.dialogs) {
      if (this.dialogs.size < 32) break;
      if (value.status !== "pending" && value.status !== "unknown")
        this.dialogs.delete(id);
    }
    const dialog = DialogSchema.safeParse(frame);
    if (
      dialog.success &&
      this.dialogs.size < 32 &&
      JSON.stringify([...this.dialogs.values(), dialog.data]).length < 262144
    ) {
      this.dialogs.set(frame.id, {
        ...dialog.data,
        status: "pending",
        expiresAt:
          dialog.data.timeout === undefined
            ? null
            : Date.now() + dialog.data.timeout,
      });
      if (dialog.data.timeout !== undefined) {
        const timer = setTimeout(
          () => {
            this.timers.delete(dialog.data.id);
            this.expire();
            this.changed();
          },
          Math.min(dialog.data.timeout, 2147483647),
        );
        timer.unref();
        this.timers.set(frame.id, timer);
      }
    }
  }
  get pending(): boolean {
    return this.overflow || this.ids.size > 0;
  }
}
