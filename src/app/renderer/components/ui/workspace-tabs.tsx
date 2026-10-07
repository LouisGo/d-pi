import { type ReactNode, useRef } from "react";
import { CloseIcon } from "../icons/common";
import { Button } from "./button";
import { IconButton } from "./icon-button";
export type WorkspaceTab = { id: string; title: string; content: ReactNode };
export function WorkspaceTabs({
  id,
  tabs,
  selected,
  onSelect,
  onClose,
  closeLabel,
  onEmpty,
}: {
  id: string;
  tabs: WorkspaceTab[];
  selected: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  closeLabel: (title: string) => string;
  onEmpty: () => void;
}) {
  const list = useRef<HTMLDivElement>(null);
  const close = (tabId: string) => {
    const ownedFocus = list.current?.contains(document.activeElement);
    onClose(tabId);
    if (!ownedFocus) return;
    requestAnimationFrame(() => {
      const next = list.current?.querySelector<HTMLElement>(
        '[role="tab"][aria-selected="true"]',
      );
      if (next) next.focus({ preventScroll: true });
      else onEmpty();
    });
  };
  return (
    <div
      ref={list}
      className="workspace-tabs"
      role="tablist"
      onKeyDown={(event) => {
        const index = tabs.findIndex((tab) => tab.id === selected);
        let next = index;
        if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
        else if (event.key === "ArrowLeft")
          next = (index - 1 + tabs.length) % tabs.length;
        else if (event.key === "Home") next = 0;
        else if (event.key === "End") next = tabs.length - 1;
        else return;
        const tab = tabs[next];
        if (!tab) return;
        event.preventDefault();
        onSelect(tab.id);
        event.currentTarget
          .querySelector<HTMLElement>(`[data-tab-index="${next}"]`)
          ?.focus();
      }}
    >
      {tabs.map((tab, index) => (
        <div className="workspace-tab" key={tab.id}>
          <Button
            id={`${id}-tab-${tab.id}`}
            role="tab"
            aria-controls={`${id}-content-${tab.id}`}
            aria-selected={selected === tab.id}
            tabIndex={selected === tab.id ? 0 : -1}
            data-tab-index={index}
            variant="navigation"
            title={tab.title}
            onClick={() => onSelect(tab.id)}
          >
            {tab.title}
          </Button>
          <IconButton
            variant="ghost"
            label={closeLabel(tab.title)}
            onClick={() => close(tab.id)}
          >
            <CloseIcon />
          </IconButton>
        </div>
      ))}
    </div>
  );
}
