export function shouldSend(
  event: Pick<
    KeyboardEvent,
    "key" | "shiftKey" | "metaKey" | "ctrlKey" | "isComposing" | "keyCode"
  >,
  preference: "enter-send" | "enter-newline",
  expanded: boolean,
): boolean {
  if (
    event.key !== "Enter" ||
    event.isComposing ||
    event.keyCode === 229 ||
    event.shiftKey
  )
    return false;
  return expanded || preference === "enter-newline"
    ? event.metaKey || event.ctrlKey
    : !event.metaKey && !event.ctrlKey;
}
