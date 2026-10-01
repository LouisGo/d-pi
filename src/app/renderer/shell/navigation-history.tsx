import { useRouter, useRouterState } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useI18n } from "../../../modules/preferences/renderer/public";

export function NavigationHistory({ disabled }: { disabled: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const index = useRouterState({
    select: (state) => state.location.state.__TSR_index,
  });
  return (
    <div className="flex gap-2">
      <Button
        variant="ghost"
        disabled={disabled || index === 0}
        onClick={() => router.history.back()}
      >
        {t("app.navigation.back")}
      </Button>
      <Button
        variant="ghost"
        disabled={disabled || index >= router.history.length - 1}
        onClick={() => router.history.forward()}
      >
        {t("app.navigation.forward")}
      </Button>
    </div>
  );
}
