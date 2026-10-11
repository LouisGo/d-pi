// Observe public OMP approval events without answering or changing policy.
// These facts intentionally have no RPC select requestId: that association is
// absent from the fixed SDK. One observer belongs to one native process.
export function createApprovalObservation() {
  const records = new Map();
  let gap = false;
  let publish = () => {};
  const snapshot = () => ({
    items: [...records.values()].map((item) => ({ ...item })),
    coverage: gap ? "gap" : "observed",
  });
  const accept = (event) => {
    const valid = (value, max) =>
      typeof value === "string" && value.length > 0 && value.length <= max;
    if (
      !valid(event.sessionId, 512) ||
      !valid(event.toolCallId, 256) ||
      !valid(event.toolName, 120)
    ) {
      gap = true;
      publish(snapshot());
      return;
    }
    const key = JSON.stringify([event.sessionId, event.toolCallId]);
    const prior = records.get(key);
    const pending = event.type === "tool_approval_requested";
    if (
      pending &&
      prior?.status !== "pending" &&
      [...records.values()].filter((item) => item.status === "pending")
        .length >= 32
    ) {
      gap = true;
      publish(snapshot());
      return;
    }
    const reason = typeof event.reason === "string" ? event.reason : undefined;
    records.set(key, {
      nativeSessionKey: event.sessionId,
      toolCallId: event.toolCallId,
      toolName: event.toolName,
      ...(pending
        ? { approvalMode: event.approvalMode, requestedAt: Date.now() }
        : {
            ...(prior?.approvalMode
              ? { approvalMode: prior.approvalMode }
              : {}),
            ...(prior?.requestedAt !== undefined
              ? { requestedAt: prior.requestedAt }
              : {}),
            resolvedAt: Date.now(),
          }),
      ...(reason === undefined ? {} : { reason: reason.slice(0, 4096) }),
      ...(reason && reason.length > 4096 ? { reasonTruncated: true } : {}),
      status: pending ? "pending" : event.approved ? "approved" : "denied",
    });
    const terminal = [...records.entries()].filter(
      ([, item]) => item.status !== "pending",
    );
    for (const [oldKey] of terminal.slice(0, Math.max(0, terminal.length - 32)))
      records.delete(oldKey);
    publish(snapshot());
  };
  return {
    extension(api) {
      api.on("tool_approval_requested", accept);
      api.on("tool_approval_resolved", accept);
    },
    setPublisher(listener) {
      publish = listener;
      publish(snapshot());
    },
    snapshot,
  };
}
