import { useEffect } from "react";
import { useStore } from "zustand";
import { useI18n } from "../../../modules/preferences/renderer/public";
import { SidebarCompleteIcon } from "../components/icons/sidebar";
import { StatusNotice } from "../components/ui/status-notice";
import type { AppModel } from "../wiring/model";

export function SidebarCommandFeedback({ model }: { model: AppModel }) {
  const { t } = useI18n();
  const failed = useStore(model.commands.stateStore, (state) => state.failed);
  const success = useStore(model.commands.stateStore, (state) => state.success);
  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(
      () => model.commands.dismissSuccess(success.id),
      4000,
    );
    return () => clearTimeout(timer);
  }, [model, success]);
  return (
    <>
      {failed && (
        <p role="alert" className="failure sidebar-feedback">
          {t("app.sidebar.commandFailed")}
        </p>
      )}
      <StatusNotice
        message={
          success
            ? t(
                success.kind === "completed"
                  ? "app.sidebar.completeSuccess"
                  : "app.sidebar.reopenSuccess",
              )
            : null
        }
        icon={<SidebarCompleteIcon />}
      />
    </>
  );
}
