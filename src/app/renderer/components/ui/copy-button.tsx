import { useLayoutEffect, useRef, useState } from "react";
import { useI18n } from "../../../../modules/preferences/renderer/public";
import { Button, CheckIcon } from "../../../../modules/ui/renderer/public";
import { CopyIcon } from "../icons/reading";
import { Tooltip } from "./tooltip";

// Feedback belongs to this clipboard action; it never reports execution success.
export function CopyButton({
  text,
  label,
  disabled = false,
  iconOnly = false,
}: {
  text: string;
  label: string;
  disabled?: boolean;
  iconOnly?: boolean;
}) {
  const { t } = useI18n();
  const [state, setState] = useState<"idle" | "pending" | "copied" | "failed">(
    "idle",
  );
  const generation = useRef(0);
  const pending = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useLayoutEffect(() => {
    setState("idle");
    pending.current = false;
    return () => {
      generation.current++;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [text]);
  const copy = async () => {
    if (disabled || pending.current) return;
    pending.current = true;
    if (timer.current) clearTimeout(timer.current);
    const current = ++generation.current;
    setState("pending");
    try {
      await navigator.clipboard.writeText(text);
      if (current !== generation.current) return;
      setState("copied");
      timer.current = setTimeout(() => setState("idle"), 2000);
    } catch {
      if (current === generation.current) setState("failed");
    } finally {
      if (current === generation.current) pending.current = false;
    }
  };
  const actionLabel = state === "copied" ? t("ui.copy.copied") : label;
  const action = (
    <Button
      type="button"
      variant="ghost"
      size={iconOnly ? "icon" : "default"}
      aria-label={actionLabel}
      disabled={disabled || state === "pending"}
      onClick={() => void copy()}
    >
      {iconOnly ? (
        state === "copied" ? (
          <CheckIcon />
        ) : (
          <CopyIcon />
        )
      ) : (
        actionLabel
      )}
    </Button>
  );
  return (
    <span className="ui-copy-control">
      {iconOnly ? <Tooltip content={actionLabel}>{action}</Tooltip> : action}
      {state === "failed" && (
        <span className="ui-copy-feedback" role="alert">
          {t("ui.copy.failed")}
        </span>
      )}
      <span className="sr-only" role="status">
        {state === "copied"
          ? t("ui.copy.copied")
          : state === "pending"
            ? t("ui.copy.pending")
            : ""}
      </span>
    </span>
  );
}
