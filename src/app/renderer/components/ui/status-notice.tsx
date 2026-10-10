import type { ReactNode } from "react";
import { createPortal } from "react-dom";

/** Non-modal feedback: never moves focus or changes the surrounding layout. */
export function StatusNotice({
  message,
  icon,
}: {
  message: string | null;
  icon: ReactNode;
}) {
  return createPortal(
    <div
      className="ui-success-notice"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      hidden={!message}
    >
      {message && (
        <>
          <span aria-hidden="true">{icon}</span>
          <span>{message}</span>
        </>
      )}
    </div>,
    document.body,
  );
}
