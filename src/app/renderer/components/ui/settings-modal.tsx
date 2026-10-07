import { Dialog } from "@base-ui/react/dialog";
import { type ReactNode, type RefObject, useRef } from "react";
import { CloseIcon } from "../icons/common";
import { IconButton } from "./icon-button";
import { SettingsVisibilityContext } from "./settings-visibility";

// d-pi owns the presentation and focus contract; callers provide existing settings.
export function SettingsModal({
  open,
  onClose,
  title,
  closeLabel,
  returnFocus,
  navigation,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  closeLabel: string;
  returnFocus: RefObject<HTMLElement | null>;
  navigation: ReactNode;
  children: ReactNode;
}) {
  const popup = useRef<HTMLDivElement>(null);
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
          ref={popup}
          className="ui-settings-modal"
          initialFocus={() =>
            popup.current?.querySelector<HTMLElement>("nav button") ??
            popup.current
          }
          finalFocus={returnFocus}
        >
          <div className="settings-modal-header">
            <Dialog.Title>{title}</Dialog.Title>
            <IconButton variant="ghost" label={closeLabel} onClick={onClose}>
              <CloseIcon />
            </IconButton>
          </div>
          <div className="settings-modal-body">
            <aside className="settings-modal-navigation">{navigation}</aside>
            <div className="settings-surface">
              <SettingsVisibilityContext.Provider value={open}>
                {children}
              </SettingsVisibilityContext.Provider>
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
