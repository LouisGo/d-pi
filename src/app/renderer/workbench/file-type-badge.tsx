import { filePresentation } from "../../../modules/input/renderer/public";
import { FileTypeIcon } from "../components/icons/file-type";

export function FileTypeBadge({
  name,
  mimeType,
}: {
  name: string;
  mimeType?: string;
}) {
  const file = filePresentation(name, mimeType);
  return (
    <span
      className="composer-file-type"
      data-file-type={file.label}
      data-file-kind={file.kind}
      aria-hidden="true"
    >
      <FileTypeIcon kind={file.kind} />
      <span>{file.label}</span>
    </span>
  );
}
