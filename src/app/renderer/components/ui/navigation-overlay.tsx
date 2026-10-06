import { Dialog } from "@base-ui/react/dialog";
import type { ReactNode, RefObject } from "react";
import { Button } from "./button";
export function NavigationOverlay({
  open,
  onClose,
  title,
  closeLabel,
  returnFocus,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  closeLabel: string;
  returnFocus: RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="ui-overlay-backdrop" />
        <Dialog.Popup
          className="ui-navigation-overlay"
          finalFocus={returnFocus}
        >
          <div className="panel-header">
            <Dialog.Title>{title}</Dialog.Title>
            <Button variant="ghost" onClick={onClose}>
              {closeLabel}
            </Button>
          </div>
          <div className="sidebar-scroll">{children}</div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
