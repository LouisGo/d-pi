import { useEffect, useRef, useState } from "react";
import { useStore } from "zustand";
import { useI18n } from "../../../modules/preferences/renderer/public";
import { Button, TextInput } from "../../../modules/ui/renderer/public";
import { Modal } from "../components/ui/modal";
import type { AppModel } from "../wiring/model";
export function ThreadCommandDialog({ model }: { model: AppModel }) {
  const { t } = useI18n();
  const prompt = useStore(model.commands.stateStore, (s) => s.prompt);
  const pending = useStore(model.commands.stateStore, (s) => s.pending);
  const failed = useStore(model.commands.stateStore, (s) => s.failed);
  const [title, setTitle] = useState("");
  const focus = useRef<HTMLElement | null>(null);
  const input = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (prompt) {
      focus.current = document.querySelector<HTMLElement>(
        `[data-thread-navigation][data-thread-id="${prompt.thread.threadId}"]`,
      );
      setTitle(prompt.thread.title ?? "");
    }
  }, [prompt]);
  if (!prompt) return null;
  const rename = prompt.kind === "rename";
  return (
    <Modal
      open
      onClose={() => model.commands.closePrompt()}
      title={t(rename ? "app.sidebar.rename" : "app.sidebar.delete")}
      closeLabel={t("app.sidebar.cancel")}
      returnFocus={focus}
      initialFocus={() => (rename ? input.current : null)}
    >
      <form
        className="sidebar-command-form"
        onSubmit={(event) => {
          event.preventDefault();
          void model.commands.execute({
            kind: "mutate",
            threadId: prompt.thread.threadId,
            mutation: rename
              ? { kind: "rename", title: title.trim() }
              : { kind: "delete" },
          });
        }}
      >
        {rename ? (
          <TextInput
            ref={input}
            autoFocus
            aria-label={t("app.sidebar.name")}
            value={title}
            maxLength={256}
            disabled={pending}
            onChange={(event) => setTitle(event.target.value)}
          />
        ) : (
          <p>
            {t("app.sidebar.deleteConfirm", {
              name: prompt.thread.title || t("app.sidebar.untitled"),
            })}
          </p>
        )}
        {failed && (
          <p role="alert" className="failure">
            {t("app.sidebar.commandFailed")}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={() => model.commands.closePrompt()}
          >
            {t("app.sidebar.cancel")}
          </Button>
          <Button
            type="submit"
            variant={rename ? "default" : "destructive"}
            disabled={pending || (rename && !title.trim())}
          >
            {t(
              pending
                ? "app.sidebar.working"
                : rename
                  ? "app.sidebar.save"
                  : "app.sidebar.delete",
            )}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
