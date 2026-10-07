import { useLayoutEffect, useState, useSyncExternalStore } from "react";
import { useStore } from "zustand";
import type { ConversationModel } from "../../../modules/conversation/core/public";
import { useI18n } from "../../../modules/preferences/renderer/public";
import { Button } from "../../../modules/ui/renderer/public";
import { observeLiveReadingUpdates } from "./live-reading";
import type { attachReadingAnchor } from "./reading-anchor";

export function LiveReadingControls({
  model,
  anchor,
  onOpenHistory,
}: {
  model: ConversationModel;
  anchor: ReturnType<typeof attachReadingAnchor>;
  onOpenHistory?: (() => void) | undefined;
}) {
  const { t } = useI18n();
  const atEnd = useSyncExternalStore(anchor.subscribe, anchor.getSnapshot);
  const [newOutput, setNewOutput] = useState(false);
  useLayoutEffect(
    () => observeLiveReadingUpdates({ model, anchor, onChange: setNewOutput }),
    [model, anchor],
  );
  const coverageGap = useStore(
    model.stateStore,
    (state) =>
      !!state.view?.gap ||
      (state.view?.items.some((item) => item.truncated) ?? false),
  );
  if (atEnd && !(coverageGap && onOpenHistory)) return null;
  return (
    <div
      className="flex min-w-0 shrink-0 flex-wrap items-center justify-end gap-2 px-3 py-1"
      data-live-reading-controls=""
    >
      {coverageGap && onOpenHistory && (
        <Button
          variant="ghost"
          data-open-native-history=""
          onClick={onOpenHistory}
        >
          {t("ui.conversation.openHistory")}
        </Button>
      )}
      {newOutput && <span role="status">{t("ui.conversation.newOutput")}</span>}
      {!atEnd && (
        <Button
          variant="ghost"
          data-list-bottom=""
          onClick={() => anchor.toBottom()}
          title={t("ui.conversation.retainedTail")}
        >
          {t("ui.conversation.toBottom")}
        </Button>
      )}
    </div>
  );
}
