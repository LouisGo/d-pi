import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Folder01Icon,
  GithubIcon,
  Globe02Icon,
  Moon02Icon,
  Sun03Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
export interface IconProps {
  size?: 16 | 18 | 20 | 24;
  className?: string;
}
export function FolderIcon({ size = 16, className }: IconProps) {
  return (
    <HugeiconsIcon
      icon={Folder01Icon}
      size={size}
      className={className}
      strokeWidth={1.5}
      color="currentColor"
      aria-hidden={true}
      focusable={false}
    />
  );
}
export function LightThemeIcon({ size = 16, className }: IconProps) {
  return (
    <HugeiconsIcon
      icon={Sun03Icon}
      size={size}
      className={className}
      strokeWidth={1.5}
      color="currentColor"
      aria-hidden={true}
      focusable={false}
    />
  );
}
export function DarkThemeIcon({ size = 16, className }: IconProps) {
  return (
    <HugeiconsIcon
      icon={Moon02Icon}
      size={size}
      className={className}
      strokeWidth={1.5}
      color="currentColor"
      aria-hidden={true}
      focusable={false}
    />
  );
}

export function WebsiteIcon({
  brand,
  size = 16,
  className,
}: IconProps & { brand: "github" | "generic" }) {
  return (
    <HugeiconsIcon
      icon={brand === "github" ? GithubIcon : Globe02Icon}
      size={size}
      className={className}
      strokeWidth={1.5}
      color="currentColor"
      aria-hidden={true}
      focusable={false}
    />
  );
}

export function BackIcon({ size = 16, className }: IconProps) {
  return (
    <HugeiconsIcon
      icon={ArrowLeft01Icon}
      size={size}
      className={className}
      strokeWidth={1.5}
      color="currentColor"
      aria-hidden={true}
      focusable={false}
    />
  );
}

export function ForwardIcon({ size = 16, className }: IconProps) {
  return (
    <HugeiconsIcon
      icon={ArrowRight01Icon}
      size={size}
      className={className}
      strokeWidth={1.5}
      color="currentColor"
      aria-hidden={true}
      focusable={false}
    />
  );
}
