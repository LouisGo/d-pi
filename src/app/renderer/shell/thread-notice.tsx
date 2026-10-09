import { useStore } from "zustand";
import { useI18n } from "../../../modules/preferences/renderer/public";
import { Button, InlineNotice } from "../../../modules/ui/renderer/public";
import type { AppModel } from "../wiring/model";
import { Diagnostics } from "./diagnostics";

export function ThreadNotice({ model }: { model: AppModel }) {
  const { t, formatMessage } = useI18n();
  const notice = useStore(model.stateStore, (state) =>
    state.kind === "ready" ? state.notice : null,
  );
  const uncertain = useStore(
    model.stateStore,
    (state) => state.kind === "ready" && state.threadTransition === "unknown",
  );
  const busy = useStore(
    model.stateStore,
    (state) => state.kind === "ready" && state.busy,
  );
  if (!notice) return null;
  return (
    <div className="notice">
      <InlineNotice
        role="alert"
        tone="danger"
        actions={
          <>
            <Diagnostics traceId={notice.traceId} />
            {uncertain && (
              <Button
                disabled={busy}
                onClick={() => void model.reconcileSelection()}
              >
                {t("app.navigation.checkSelection")}
              </Button>
            )}
          </>
        }
      >
        {formatMessage(notice.message)}
        <span className="trace"> {notice.traceId}</span>
        {uncertain && <p>{t("app.navigation.selectionUnknown")}</p>}
      </InlineNotice>
    </div>
  );
}
