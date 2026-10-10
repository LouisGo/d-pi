import {
  ArrowDown01Icon,
  BubbleChatAddIcon,
  CheckmarkCircle02Icon,
  Delete02Icon,
  Edit01Icon,
  GitForkIcon,
  PinIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { IconProps } from "./common";
export function SidebarChevronIcon({ size = 14, className }: IconProps) {
  return (
    <HugeiconsIcon
      icon={ArrowDown01Icon}
      size={size}
      className={className}
      strokeWidth={1.5}
      color="currentColor"
      aria-hidden={true}
      focusable={false}
    />
  );
}
export function SidebarPinIcon({ size = 14, className }: IconProps) {
  return (
    <HugeiconsIcon
      icon={PinIcon}
      size={size}
      className={className}
      strokeWidth={1.5}
      color="currentColor"
      aria-hidden={true}
      focusable={false}
    />
  );
}
export function SidebarRenameIcon({ size = 14, className }: IconProps) {
  return (
    <HugeiconsIcon
      icon={Edit01Icon}
      size={size}
      className={className}
      strokeWidth={1.5}
      color="currentColor"
      aria-hidden={true}
      focusable={false}
    />
  );
}

export function SidebarForkIcon({ size = 14, className }: IconProps) {
  return (
    <HugeiconsIcon
      icon={GitForkIcon}
      size={size}
      className={className}
      strokeWidth={1.5}
      color="currentColor"
      aria-hidden={true}
      focusable={false}
    />
  );
}
export function SidebarDeleteIcon({ size = 14, className }: IconProps) {
  return (
    <HugeiconsIcon
      icon={Delete02Icon}
      size={size}
      className={className}
      strokeWidth={1.5}
      color="currentColor"
      aria-hidden={true}
      focusable={false}
    />
  );
}

export function NewChatIcon({ size = 14, className }: IconProps) {
  return (
    <HugeiconsIcon
      icon={BubbleChatAddIcon}
      size={size}
      className={className}
      strokeWidth={1.5}
      color="currentColor"
      aria-hidden={true}
      focusable={false}
    />
  );
}
export function SidebarCompleteIcon({ size = 14, className }: IconProps) {
  return (
    <HugeiconsIcon
      icon={CheckmarkCircle02Icon}
      size={size}
      className={className}
      strokeWidth={1.5}
      color="currentColor"
      aria-hidden={true}
      focusable={false}
    />
  );
}
