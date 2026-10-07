import type { ConversationModel } from "../../../modules/conversation/core/public";
import type { attachReadingAnchor } from "./reading-anchor";

type LiveReadingAnchor = Pick<
  ReturnType<typeof attachReadingAnchor>,
  "getSnapshot" | "subscribe"
>;

/** A visible live reading period; neither unread history nor execution state. */
export function observeLiveReadingUpdates({
  model,
  anchor,
  onChange,
}: {
  model: ConversationModel;
  anchor: LiveReadingAnchor;
  onChange: (newOutput: boolean) => void;
}): () => void {
  let previous = model.stateStore.getState();
  let newOutput = false;
  const publish = (value: boolean) => {
    if (newOutput === value) return;
    newOutput = value;
    onChange(value);
  };
  onChange(false);
  const releaseModel = model.subscribe(() => {
    const current = model.stateStore.getState();
    const sameSource =
      current.threadId === previous.threadId &&
      current.view?.connectionGeneration ===
        previous.view?.connectionGeneration;
    const changedBody =
      sameSource &&
      !!previous.view &&
      !!current.view &&
      current.view.items.some(
        (item) =>
          !item.notice &&
          !item.subagentNotice &&
          item.text.length > 0 &&
          item.text !== previous.itemsById.get(item.id)?.text,
      );
    previous = current;
    if (!sameSource || anchor.getSnapshot()) publish(false);
    else if (changedBody) publish(true);
  });
  const releaseAnchor = anchor.subscribe(() => {
    if (anchor.getSnapshot()) publish(false);
  });
  return () => {
    releaseModel();
    releaseAnchor();
  };
}
