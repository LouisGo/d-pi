import {
  ArrowDown02Icon,
  BrainIcon,
  Copy01Icon,
  StopIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { IconProps } from "../../../../modules/ui/renderer/public";
export function StopResponseIcon({ size = 16, className }: IconProps) {
  return (
    <HugeiconsIcon
      icon={StopIcon}
      size={size}
      className={className}
      strokeWidth={1.5}
      color="currentColor"
      aria-hidden={true}
      focusable={false}
    />
  );
}

export function CopyIcon({ size = 16, className }: IconProps) {
  return (
    <HugeiconsIcon
      icon={Copy01Icon}
      size={size}
      className={className}
      strokeWidth={1.5}
      color="currentColor"
      aria-hidden={true}
      focusable={false}
    />
  );
}
export function ToBottomIcon({ size = 16, className }: IconProps) {
  return (
    <HugeiconsIcon
      icon={ArrowDown02Icon}
      size={size}
      className={className}
      strokeWidth={1.5}
      color="currentColor"
      aria-hidden={true}
      focusable={false}
    />
  );
}
export function ThinkingIcon({ size = 16, className }: IconProps) {
  return (
    <HugeiconsIcon
      icon={BrainIcon}
      size={size}
      className={className}
      strokeWidth={1.5}
      color="currentColor"
      aria-hidden={true}
      focusable={false}
    />
  );
}
