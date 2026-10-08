import { contextTypeLabel } from "../../../modules/input/renderer/public";

export function FileTypeBadge({ name }: { name: string }) {
  const type = contextTypeLabel(name);
  return (
    <span
      className="composer-file-type"
      data-file-type={type}
      aria-hidden="true"
    >
      {type}
    </span>
  );
}
