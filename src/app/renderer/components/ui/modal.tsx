import { Dialog } from "@base-ui/react/dialog";
import { type ReactNode, type RefObject, useRef } from "react";
import { CloseIcon } from "../icons/common";
import { IconButton } from "./icon-button";

// A presentation-only modal; content, state and business lifetimes stay with callers.
export function Modal({
  open,
  onClose,
  title,
  closeLabel,
  returnFocus,
  initialFocus,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  closeLabel: string;
  returnFocus: RefObject<HTMLElement | null>;
  initialFocus?: () => HTMLElement | null;
  children: ReactNode;
}) {
  const body = useRef<HTMLDivElement>(null);
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <Dialog.Portal keepMounted>
        <Dialog.Backdrop className="ui-overlay-backdrop" />
        <Dialog.Popup
          className="ui-modal"
          initialFocus={() => initialFocus?.() ?? body.current}
          finalFocus={returnFocus}
        >
          <div className="ui-modal-header">
            <Dialog.Title>{title}</Dialog.Title>
            <IconButton variant="ghost" label={closeLabel} onClick={onClose}>
              <CloseIcon />
            </IconButton>
          </div>
          <div className="ui-modal-body" ref={body} tabIndex={-1}>
            {children}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
