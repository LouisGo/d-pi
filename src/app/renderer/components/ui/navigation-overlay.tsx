import { Dialog } from "@base-ui/react/dialog";
import type { ReactNode, RefObject } from "react";
import { Button } from "../../../../modules/ui/renderer/public";
export function NavigationOverlay({
  open,
  onClose,
  title,
  closeLabel,
  returnFocus,
  nativeInset,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  closeLabel: string;
  nativeInset: boolean;
  returnFocus: RefObject<HTMLElement | null>;
  children: ReactNode;
  footer?: ReactNode;
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
          data-native-inset={nativeInset}
          finalFocus={returnFocus}
        >
          <div className="panel-header">
            <Dialog.Title>{title}</Dialog.Title>
            <Button variant="ghost" onClick={onClose}>
              {closeLabel}
            </Button>
          </div>
          <div className="sidebar-scroll">{children}</div>
          {footer}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
