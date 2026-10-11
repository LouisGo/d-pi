import { useSyncExternalStore } from "react";

function subscribeVisibility(listener: () => void) {
  document.addEventListener("visibilitychange", listener);
  return () => document.removeEventListener("visibilitychange", listener);
}
function documentVisible() {
  return document.visibilityState !== "hidden";
}
export function useDocumentVisible(): boolean {
  return useSyncExternalStore(subscribeVisibility, documentVisible);
}
