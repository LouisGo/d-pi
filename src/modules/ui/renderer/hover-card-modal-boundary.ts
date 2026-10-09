import type { PreviewCard } from "@base-ui/react/preview-card";
import { useCallback, useEffect, useRef } from "react";

/** Portaled dialogs own interaction above the workbench, including existing previews. */
export function useHoverCardModalBoundary(
  onOpenChange?: (open: boolean) => void,
) {
  const actionsRef = useRef<PreviewCard.Root.Actions | null>(null);
  const trigger = useRef<Element | undefined>(undefined);
  const opened = useRef(false);
  const blocked = useCallback(() => {
    const portal = [...document.querySelectorAll("[data-dpi-modal-open]")].at(
      -1,
    );
    return !!portal && (!trigger.current || !portal.contains(trigger.current));
  }, []);
  useEffect(() => {
    const observer = new MutationObserver(() => {
      if (opened.current && blocked()) actionsRef.current?.close();
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-dpi-modal-open"],
    });
    return () => observer.disconnect();
  }, [blocked]);
  return {
    actionsRef,
    onOpenChange(next: boolean, details: PreviewCard.Root.ChangeEventDetails) {
      trigger.current = details.trigger ?? trigger.current;
      if (next && blocked()) {
        details.cancel();
        return;
      }
      opened.current = next;
      onOpenChange?.(next);
    },
  };
}
