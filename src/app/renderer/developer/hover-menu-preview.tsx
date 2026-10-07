import { useState } from "react";
import { ToolsIcon } from "../components/icons/common";
import { HoverMenu } from "../components/ui/hover-menu";

export function HoverMenuPreview() {
  const [selected, setSelected] = useState(0);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <HoverMenu
        // i18n-ignore: developer demonstration uses fixed Chinese
        label="演示工具菜单"
        icon={<ToolsIcon />}
        items={[
          {
            id: "sample",
            // i18n-ignore: developer demonstration uses fixed Chinese
            label: "可用工具",
            // i18n-ignore: developer demonstration uses fixed Chinese
            description: "点击后更新旁边的反馈",
            onSelect: () => setSelected((value) => value + 1),
          },
          {
            id: "disabled",
            // i18n-ignore: developer demonstration uses fixed Chinese
            label: "禁用工具",
            disabled: true,
            onSelect: () => setSelected((value) => value + 1),
          },
        ]}
      />
      {/* i18n-ignore: developer demonstration uses fixed Chinese */}
      <output aria-label="菜单反馈">已选择 {selected} 次</output>
    </div>
  );
}
