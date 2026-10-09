import { useState } from "react";
import { useI18n } from "../../../modules/preferences/renderer/public";
import { ToolsIcon } from "../components/icons/common";
import { HoverMenu } from "../components/ui/hover-menu";

export function HoverMenuPreview() {
  const { t } = useI18n();
  const [selected, setSelected] = useState(0);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <HoverMenu
        label={t("dev.menu")}
        icon={<ToolsIcon />}
        items={[
          {
            id: "sample",

            label: t("dev.menuItem"),

            description: t("dev.menuDescription"),
            onSelect: () => setSelected((value) => value + 1),
          },
          {
            id: "disabled",

            label: t("dev.menuDisabled"),
            disabled: true,
            onSelect: () => setSelected((value) => value + 1),
          },
        ]}
      />
      <output aria-label={t("dev.menuFeedback")}>
        {t("dev.menuCount", { selected })}
      </output>
    </div>
  );
}
