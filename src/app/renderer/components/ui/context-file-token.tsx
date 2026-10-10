import {
  filePresentation,
  fileTypeIconPaths,
  formatFileSize,
} from "../../../../modules/input/renderer/public";
import {
  ComposerTag,
  type ComposerTagProps,
  fileContextGlyph,
} from "../../../../modules/ui/renderer/public";

/** Read-only counterpart of the editor atom, consuming the same token recipe. */
export function ContextFileToken({
  name,
  byteLength,
  contextKind,
  referenceKind,
  ...props
}: {
  name: string;
  byteLength: number;
  contextKind?: "project" | "external" | undefined;
  referenceKind?: "file" | "directory" | undefined;
} & Omit<ComposerTagProps, "label" | "detail" | "leading" | "tone">) {
  const file = filePresentation(name, undefined, referenceKind);
  const size = contextKind === "project" ? null : formatFileSize(byteLength);
  return (
    <ComposerTag
      {...props}
      type="button"
      data-file-kind={file.kind}
      label={`${name}${referenceKind === "directory" ? "/" : ""}`}
      detail={size}
      tone={contextKind === "project" ? "teal" : "blue"}
      leading={fileContextGlyph(name, fileTypeIconPaths(file.kind), file.kind)}
    />
  );
}
