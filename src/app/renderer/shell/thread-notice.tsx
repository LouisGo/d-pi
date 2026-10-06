import { useStore } from "zustand";
import { Button } from "@/components/ui/button";
import { useI18n } from "../../../modules/preferences/renderer/public";
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
    <div role="alert" className="notice failure">
      {formatMessage(notice.message)}
      <span className="trace"> {notice.traceId}</span>
      <Diagnostics
        bridge={window.desktop?.diagnostics}
        traceId={notice.traceId}
      />
      {uncertain && (
        <>
          <p>{t("app.navigation.selectionUnknown")}</p>
          <Button
            disabled={busy}
            onClick={() => void model.reconcileSelection()}
          >
            {t("app.navigation.checkSelection")}
          </Button>
        </>
      )}
    </div>
  );
}
