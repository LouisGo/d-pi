import type { NativeFrame } from "../features/runtime/native-protocol";
export class PendingInteractions {
  private readonly ids = new Set<string>();
  private overflow = false;
  update(frame: NativeFrame): void {
    if (
      frame.type === "extension_ui_request" &&
      frame.method === "cancel" &&
      typeof frame.targetId === "string"
    ) {
      this.ids.delete(frame.targetId);
      return;
    }
    if (
      (frame.type === "host_tool_cancel" || frame.type === "host_uri_cancel") &&
      typeof frame.id === "string"
    ) {
      this.ids.delete(frame.id);
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
    this.ids.add(frame.id);
  }
  get pending(): boolean {
    return this.overflow || this.ids.size > 0;
  }
}
