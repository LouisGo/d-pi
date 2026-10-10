import {
  createContext,
  type ReactNode,
  useContext,
  useMemo,
  useState,
} from "react";
import { useI18n } from "../../../modules/preferences/renderer/public";
import type { ThreadContext } from "../../../modules/threads/contracts/public";
import {
  createHoverCardHandle,
  type HoverCardHandle,
  HoverCardPopup,
} from "../../../modules/ui/renderer/public";
import { FolderIcon } from "../components/icons/common";
import type { AppModel } from "../wiring/model";
import { ThreadAttention } from "./attention";
export type SidebarPreviewPayload = {
  label: string;
  directory: string;
  thread?: ThreadContext;
  count?: number;
};
const PreviewContext = createContext<{
  handle: HoverCardHandle<SidebarPreviewPayload>;
  block: (value: boolean) => void;
} | null>(null);
export function useSidebarPreview() {
  return useContext(PreviewContext);
}
export function SidebarPreview({
  model,
  children,
}: {
  model: AppModel;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const handle = useMemo(
    () => createHoverCardHandle<SidebarPreviewPayload>(),
    [],
  );
  const [blocked, block] = useState(false);
  const value = useMemo(() => ({ handle, block }), [handle]);
  return (
    <PreviewContext.Provider value={value}>
      {children}
      <HoverCardPopup
        handle={handle}
        label={t("app.sidebar.preview")}
        side="right"
        sideOffset={8}
        suppressed={blocked}
      >
        {(payload) =>
          payload ? (
            <div className="sidebar-preview-card">
              <p className="sidebar-preview-title">{payload.label}</p>
              <div className="sidebar-preview-project">
                <FolderIcon size={14} />
                <span>
                  {payload.directory.split(/[\\/]/).filter(Boolean).at(-1)}
                </span>
              </div>
              <p className="sidebar-preview-path">{payload.directory}</p>
              {payload.thread ? (
                <ThreadAttention
                  model={model}
                  threadId={payload.thread.threadId}
                />
              ) : payload.count !== undefined ? (
                <p className="muted">
                  {t("app.sidebar.threadCount", { count: payload.count })}
                </p>
              ) : null}
            </div>
          ) : null
        }
      </HoverCardPopup>
    </PreviewContext.Provider>
  );
}
