import { useState } from "react";
import type { ToolExecutionObservation } from "../../../modules/conversation/contracts/public";
import { useI18n } from "../../../modules/preferences/renderer/public";
import { Disclosure, DisclosureTrigger } from "../../../modules/ui/renderer/public";
import { ReadingBody } from "./reading-body";

/** Observed native values, not an inferred filesystem diff or execution receipt. */
export function ToolObservationDetails({ tool }: { tool: ToolExecutionObservation }) {
  const { t } = useI18n();
  const [revealed, setRevealed] = useState(false);
  const payloads = [
    ["ui.tool.arguments", tool.arguments],
    ["ui.tool.progress", tool.progress],
    ["ui.tool.result", tool.result],
  ] as const;
  return (
    <Disclosure
      variant="inline"
      data-tool-observation
      onToggle={(event) => {
        if (event.currentTarget.open) setRevealed(true);
      }}
    >
      <DisclosureTrigger>{t("ui.tool.observation")}</DisclosureTrigger>
      {revealed && (
        <div>
          <dl>
            <dt>{t("ui.tool.identity")}</dt>
            <dd data-selectable>{tool.toolCallId}</dd>
          </dl>
          {tool.coverage === "partial" && <p role="status">{t("ui.tool.partial")}</p>}
          {tool.truncated && <p role="status">{t("ui.tool.truncated")}</p>}
          {payloads.map(([label, payload]) =>
            payload ? (
              <section key={label} aria-label={t(label)}>
                <strong>{t(label)}</strong>
                <ReadingBody raw text={JSON.stringify(payload.value, null, 2)} />
              </section>
            ) : null,
          )}
        </div>
      )}
    </Disclosure>
  );
}
