import { Button as TabButton } from "@base-ui/react/button";
import { type ReactNode, useRef } from "react";
import { Button } from "../../../../modules/ui/renderer/public";
import { AddIcon, CloseIcon } from "../icons/common";

// Tabs describe navigation; their panels and resource lifetimes belong to callers.
export type TabItem = {
  id: string;
  title: string;
  icon?: ReactNode;
  panelId?: string;
  disabled?: boolean;
  closable?: boolean;
};
export function TabStrip({
  id,
  label,
  tabs,
  selected,
  onSelect,
  close,
  add,
  onEmpty,
}: {
  id: string;
  label: string;
  tabs: readonly TabItem[];
  selected: string | null;
  onSelect: (id: string) => void;
  close?: { label: (title: string) => string; onClose: (id: string) => void };
  add?: { label: string; onAdd: () => void; disabled?: boolean };
  onEmpty?: () => void;
}) {
  const list = useRef<HTMLDivElement>(null);
  const enabled = tabs.filter((tab) => !tab.disabled);
  const current = enabled.find((tab) => tab.id === selected) ?? enabled[0];
  const closeTab = (tabId: string) => {
    const ownedFocus = list.current?.contains(document.activeElement);
    close?.onClose(tabId);
    if (!ownedFocus) return;
    requestAnimationFrame(() => {
      const next = list.current?.querySelector<HTMLElement>(
        '[role="tab"][tabindex="0"]',
      );
      if (next) next.focus({ preventScroll: true });
      else onEmpty?.();
    });
  };
  return (
    <div className="tab-strip">
      <div
        ref={list}
        className="tab-strip-list"
        role="tablist"
        aria-label={label}
        onKeyDown={(event) => {
          const target = event.target;
          if (!(target instanceof Element) || !target.closest('[role="tab"]'))
            return;
          const index = enabled.findIndex((tab) => tab.id === current?.id);
          if (
            event.key === "Delete" &&
            current &&
            close &&
            current.closable !== false
          ) {
            event.preventDefault();
            closeTab(current.id);
            return;
          }
          let next = index;
          if (event.key === "ArrowRight") next = (index + 1) % enabled.length;
          else if (event.key === "ArrowLeft")
            next = (index - 1 + enabled.length) % enabled.length;
          else if (event.key === "Home") next = 0;
          else if (event.key === "End") next = enabled.length - 1;
          else return;
          const tab = enabled[next];
          if (!tab) return;
          event.preventDefault();
          onSelect(tab.id);
          document
            .getElementById(`${id}-tab-${tab.id}`)
            ?.focus({ preventScroll: true });
        }}
      >
        {tabs.map((tab) => {
          const canClose = !!close && tab.closable !== false;
          return (
            <div
              className="tab-strip-item"
              data-selected={selected === tab.id}
              key={tab.id}
              role="presentation"
            >
              <TabButton
                className="ui-button tab-strip-label"
                id={`${id}-tab-${tab.id}`}
                role="tab"
                aria-controls={tab.panelId}
                aria-selected={selected === tab.id}
                tabIndex={current?.id === tab.id ? 0 : -1}
                disabled={tab.disabled}
                title={tab.title}
                onClick={() => onSelect(tab.id)}
              >
                {(tab.icon || canClose) && (
                  <span className="tab-strip-icon">{tab.icon}</span>
                )}
                <span className="tab-strip-title">{tab.title}</span>
              </TabButton>
              {canClose && (
                <TabButton
                  className="ui-button tab-strip-close"
                  aria-label={close.label(tab.title)}
                  disabled={tab.disabled}
                  tabIndex={current?.id === tab.id ? 0 : -1}
                  onClick={() => closeTab(tab.id)}
                >
                  <CloseIcon />
                </TabButton>
              )}
            </div>
          );
        })}
      </div>
      {add && (
        <Button
          variant="ghost"
          size="icon"
          aria-label={add.label}
          disabled={add.disabled}
          onClick={add.onAdd}
        >
          <AddIcon />
        </Button>
      )}
    </div>
  );
}
