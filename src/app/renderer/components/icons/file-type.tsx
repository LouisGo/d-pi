import {
  type FileKind,
  fileTypeIconPaths,
} from "../../../../modules/input/renderer/public";
import type { IconProps } from "./common";

export function FileTypeIcon({
  kind = "generic",
  size = 16,
  className,
}: IconProps & { kind?: FileKind }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={true}
      focusable={false}
    >
      {fileTypeIconPaths(kind).map((path) => (
        <path key={path} d={path} />
      ))}
    </svg>
  );
}
