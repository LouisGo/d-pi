import {
  Add01Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  ArrowUp02Icon,
  Attachment01Icon,
  BubbleChatIcon,
  Cancel01Icon,
  ComputerIcon,
  File01Icon,
  Folder01Icon,
  GithubIcon,
  Globe02Icon,
  LayoutLeftIcon,
  Moon02Icon,
  Settings01Icon,
  Sun03Icon,
  ToolsIcon as ToolsIconData,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { IconProps } from "../../../../modules/ui/renderer/public";

export type { IconProps } from "../../../../modules/ui/renderer/public";
export function FileIcon({ size = 16, className }: IconProps) {
  return (
    <HugeiconsIcon
      icon={File01Icon}
      size={size}
      className={className}
      strokeWidth={1.5}
      color="currentColor"
      aria-hidden={true}
      focusable={false}
    />
  );
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
  brand = "generic",
  size = 16,
  className,
}: IconProps & { brand?: "github" | "generic" }) {
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

export function ChatIcon({ size = 20, className }: IconProps) {
  return (
    <HugeiconsIcon
      icon={BubbleChatIcon}
      size={size}
      className={className}
      strokeWidth={1.5}
      color="currentColor"
      aria-hidden={true}
      focusable={false}
    />
  );
}
export function SettingsIcon({ size = 20, className }: IconProps) {
  return (
    <HugeiconsIcon
      icon={Settings01Icon}
      size={size}
      className={className}
      strokeWidth={1.5}
      color="currentColor"
      aria-hidden={true}
      focusable={false}
    />
  );
}
export function SidebarIcon({ size = 16, className }: IconProps) {
  return (
    <HugeiconsIcon
      icon={LayoutLeftIcon}
      size={size}
      className={className}
      strokeWidth={1.5}
      color="currentColor"
      aria-hidden={true}
      focusable={false}
    />
  );
}
export function CloseIcon({ size = 16, className }: IconProps) {
  return (
    <HugeiconsIcon
      icon={Cancel01Icon}
      size={size}
      className={className}
      strokeWidth={1.5}
      color="currentColor"
      aria-hidden={true}
      focusable={false}
    />
  );
}

export function AddIcon({ size = 16, className }: IconProps) {
  return (
    <HugeiconsIcon
      icon={Add01Icon}
      size={size}
      className={className}
      strokeWidth={1.5}
      color="currentColor"
      aria-hidden={true}
      focusable={false}
    />
  );
}
export function SystemThemeIcon({ size = 16, className }: IconProps) {
  return (
    <HugeiconsIcon
      icon={ComputerIcon}
      size={size}
      className={className}
      strokeWidth={1.5}
      color="currentColor"
      aria-hidden={true}
      focusable={false}
    />
  );
}

export function ToolsIcon({ size = 20, className }: IconProps) {
  return (
    <HugeiconsIcon
      icon={ToolsIconData}
      size={size}
      className={className}
      strokeWidth={1.5}
      color="currentColor"
      aria-hidden={true}
      focusable={false}
    />
  );
}

export { SearchIcon, StarIcon } from "../../../../modules/ui/renderer/public";

export function AttachmentIcon({ size = 20, className }: IconProps) {
  return (
    <HugeiconsIcon
      icon={Attachment01Icon}
      size={size}
      className={className}
      strokeWidth={1.5}
      color="currentColor"
      aria-hidden={true}
      focusable={false}
    />
  );
}
export function SendIcon({ size = 20, className }: IconProps) {
  return (
    <HugeiconsIcon
      icon={ArrowUp02Icon}
      size={size}
      className={className}
      strokeWidth={1.5}
      color="currentColor"
      aria-hidden={true}
      focusable={false}
    />
  );
}
