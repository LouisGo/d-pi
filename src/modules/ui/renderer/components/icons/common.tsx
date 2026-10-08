import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  RefreshIcon as RefreshGlyph,
  Search01Icon,
  StarIcon as StarGlyph,
  Tick01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";

type IconProps = {
  size?: 16 | 18 | 20 | 24;
  className?: string;
};

function Icon({
  icon,
  size = 16,
  className,
}: IconProps & { icon: IconSvgElement }) {
  return (
    <HugeiconsIcon
      icon={icon}
      size={size}
      className={className}
      strokeWidth={1.5}
      color="currentColor"
      aria-hidden={true}
      focusable={false}
    />
  );
}

export function SearchIcon(props: IconProps) {
  return <Icon {...props} icon={Search01Icon} />;
}

export function StarIcon(props: IconProps) {
  return <Icon {...props} icon={StarGlyph} />;
}

export function CheckIcon(props: IconProps) {
  return <Icon {...props} icon={Tick01Icon} />;
}

export function ChevronDownIcon(props: IconProps) {
  return <Icon {...props} icon={ArrowDown01Icon} />;
}

export function ChevronUpIcon(props: IconProps) {
  return <Icon {...props} icon={ArrowUp01Icon} />;
}

export function RefreshIcon(props: IconProps) {
  return <Icon {...props} icon={RefreshGlyph} />;
}
