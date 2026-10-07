import { Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

export function SearchIcon({
  size = 16,
  className,
}: {
  size?: 16 | 18 | 20 | 24;
  className?: string;
}) {
  return (
    <HugeiconsIcon
      icon={Search01Icon}
      size={size}
      className={className}
      strokeWidth={1.5}
      color="currentColor"
      aria-hidden={true}
      focusable={false}
    />
  );
}
