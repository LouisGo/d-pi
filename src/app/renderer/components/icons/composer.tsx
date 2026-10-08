import {
  ArrowExpand01Icon,
  ArrowShrink01Icon,
  MoreHorizontalIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { IconProps } from "./common";

export function ComposerExpandIcon({ size = 16, className }: IconProps) {
  return (
    <HugeiconsIcon
      icon={ArrowExpand01Icon}
      size={size}
      className={className}
      strokeWidth={1.5}
      color="currentColor"
      aria-hidden={true}
      focusable={false}
    />
  );
}
export function ComposerCollapseIcon({ size = 16, className }: IconProps) {
  return (
    <HugeiconsIcon
      icon={ArrowShrink01Icon}
      size={size}
      className={className}
      strokeWidth={1.5}
      color="currentColor"
      aria-hidden={true}
      focusable={false}
    />
  );
}
export function MoreActionsIcon({ size = 16, className }: IconProps) {
  return (
    <HugeiconsIcon
      icon={MoreHorizontalIcon}
      size={size}
      className={className}
      strokeWidth={1.5}
      color="currentColor"
      aria-hidden={true}
      focusable={false}
    />
  );
}
export function MenuCheckIcon({ size = 16, className }: IconProps) {
  return (
    <HugeiconsIcon
      icon={Tick02Icon}
      size={size}
      className={className}
      strokeWidth={1.5}
      color="currentColor"
      aria-hidden={true}
      focusable={false}
    />
  );
}
