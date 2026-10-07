import { useRouter, useRouterState } from "@tanstack/react-router";
import { useContext } from "react";
import { BackIcon, ForwardIcon } from "@/components/icons/common";
import { useI18n } from "../../../modules/preferences/renderer/public";
import { Button } from "../../../modules/ui/renderer/public";
import { ConversationVisibilityContext } from "./layout/conversation-visibility";

export function NavigationHistory({ disabled }: { disabled: boolean }) {
  const { reveal } = useContext(ConversationVisibilityContext);
  const { t } = useI18n();
  const router = useRouter();
  const index = useRouterState({
    select: (state) => state.location.state.__TSR_index,
  });
  return (
    <div className="flex gap-2">
      <Button
        variant="ghost"
        size="icon"
        title={t("app.navigation.back")}
        disabled={disabled || index === 0}
        onClick={() => {
          reveal();
          router.history.back();
        }}
      >
        <BackIcon />
        <span className="sr-only">{t("app.navigation.back")}</span>
      </Button>
      <Button
        variant="ghost"
        size="icon"
        title={t("app.navigation.forward")}
        disabled={disabled || index >= router.history.length - 1}
        onClick={() => {
          reveal();
          router.history.forward();
        }}
      >
        <ForwardIcon />
        <span className="sr-only">{t("app.navigation.forward")}</span>
      </Button>
    </div>
  );
}
