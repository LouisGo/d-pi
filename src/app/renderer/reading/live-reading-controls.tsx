import { useLayoutEffect, useState, useSyncExternalStore } from "react";
import type { ConversationModel } from "../../../modules/conversation/core/public";
import { useI18n } from "../../../modules/preferences/renderer/public";
import { Button } from "../../../modules/ui/renderer/public";
import { ToBottomIcon } from "../components/icons/reading";
import { Tooltip } from "../components/ui/tooltip";
import { observeLiveReadingUpdates } from "./live-reading";
import type { attachReadingAnchor } from "./reading-anchor";

export function LiveReadingControls({
  model,
  anchor,
}: {
  model: ConversationModel;
  anchor: ReturnType<typeof attachReadingAnchor>;
}) {
  const { t } = useI18n();
  const atEnd = useSyncExternalStore(anchor.subscribe, anchor.getSnapshot);
  const [newOutput, setNewOutput] = useState(false);
  useLayoutEffect(
    () => observeLiveReadingUpdates({ model, anchor, onChange: setNewOutput }),
    [model, anchor],
  );
  if (atEnd) return null;
  return (
    <div className="live-reading-controls" data-live-reading-controls="">
      {newOutput && <span role="status">{t("ui.conversation.newOutput")}</span>}
      {!atEnd && (
        <Tooltip content={t("ui.conversation.toBottom")} side="top">
          <Button
            variant="secondary"
            size="round"
            aria-label={t("ui.conversation.toBottom")}
            data-list-bottom=""
            onClick={() => anchor.toBottom()}
            title={t("ui.conversation.retainedTail")}
          >
            <ToBottomIcon size={20} />
          </Button>
        </Tooltip>
      )}
    </div>
  );
}
