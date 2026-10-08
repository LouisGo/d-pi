import type { ReactNode } from "react";
import { AttachmentIcon } from "../components/icons/common";
import {
  ComposerCollapseIcon,
  ComposerExpandIcon,
  MoreActionsIcon,
} from "../components/icons/composer";
import { ActionMenu } from "../components/ui/action-menu";
import { IconButton } from "../components/ui/icon-button";

export type ComposerToolbarLabels = {
  attach: string;
  expand: string;
  collapse: string;
  more: string;
  reference: string;
  manageAttachments: string;
  enterToSend: string;
  enterSendShortcut: string;
  enterNewlineShortcut: string;
};
export type ComposerToolbarProps = {
  model: ReactNode;
  access?: ReactNode;
  primaryAction?: ReactNode;
  expanded: boolean;
  preference: "enter-send" | "enter-newline";
  disabled: boolean;
  onAttach: () => void;
  onReference: () => void;
  onToggleExpanded: () => void;
  onManageAttachments: () => void;
  onToggleSendKey: () => void;
  labels: ComposerToolbarLabels;
};
export function ComposerToolbar({
  model,
  access,
  primaryAction,
  expanded,
  preference,
  disabled,
  onAttach,
  onReference,
  onToggleExpanded,
  onManageAttachments,
  onToggleSendKey,
  labels,
}: ComposerToolbarProps) {
  return (
    <div data-slot="composer-toolbar" className="composer-toolbar">
      <div
        data-slot="composer-toolbar-context"
        className="composer-toolbar-context"
      >
        <div className="composer-toolbar-model">{model}</div>
        {access !== undefined &&
          access !== null &&
          typeof access !== "boolean" && (
            <>
              <span
                role="separator"
                aria-orientation="vertical"
                className="composer-toolbar-separator"
              />
              <div className="composer-toolbar-access">{access}</div>
            </>
          )}
      </div>
      <div
        data-slot="composer-toolbar-actions"
        className="composer-toolbar-actions"
      >
        <IconButton
          type="button"
          variant="ghost"
          label={labels.attach}
          disabled={disabled}
          onClick={onAttach}
        >
          <AttachmentIcon size={18} />
        </IconButton>
        <IconButton
          type="button"
          variant="ghost"
          label={expanded ? labels.collapse : labels.expand}
          aria-expanded={expanded}
          onClick={onToggleExpanded}
        >
          {expanded ? (
            <ComposerCollapseIcon size={18} />
          ) : (
            <ComposerExpandIcon size={18} />
          )}
        </IconButton>
        <ActionMenu
          label={labels.more}
          icon={<MoreActionsIcon size={18} />}
          items={[
            {
              kind: "action",
              id: "reference",
              label: labels.reference,
              onSelect: onReference,
            },
            {
              kind: "action",
              id: "manage-attachments",
              label: labels.manageAttachments,
              onSelect: onManageAttachments,
            },
            { kind: "separator", id: "send-key-separator" },
            {
              kind: "checkbox",
              id: "send-key",
              label: labels.enterToSend,
              checked: preference === "enter-send",
              description:
                preference === "enter-send"
                  ? labels.enterSendShortcut
                  : labels.enterNewlineShortcut,
              onSelect: onToggleSendKey,
            },
          ]}
        />
        {primaryAction}
      </div>
    </div>
  );
}
