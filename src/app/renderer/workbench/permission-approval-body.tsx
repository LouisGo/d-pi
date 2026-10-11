import type { ApprovalObservation } from "../../../modules/execution/contracts/public";
import { useI18n } from "../../../modules/preferences/renderer/public";

/** Read-only native fact. Only the separately identified RPC dialog can answer. */
export function PermissionApprovalBody({
  item,
}: {
  item: ApprovalObservation;
}) {
  const { t } = useI18n();
  return (
    <article
      className="native-interaction"
      data-permission-approval={item.toolCallId}
      data-selectable
    >
      <header className="native-interaction-heading">
        <strong>{t("ui.approval.title", { tool: item.toolName })}</strong>
        <span>{t(`ui.approval.${item.status}`)}</span>
      </header>
      <p className="muted">
        {t("ui.approval.source", { id: item.toolCallId })}
      </p>
      {item.approvalMode && (
        <p>{t("ui.approval.mode", { mode: item.approvalMode })}</p>
      )}
      {item.reason && <p>{item.reason}</p>}
      {item.reasonTruncated && (
        <p className="muted">{t("ui.approval.reasonTruncated")}</p>
      )}
      {(item.status === "pending" || item.status === "unknown") && (
        <p>{t("ui.approval.unassociated")}</p>
      )}
    </article>
  );
}
