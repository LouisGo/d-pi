import type { CSSProperties } from "react";
import type { ProjectReferenceEntry } from "../../../modules/files/contracts/public";
import { useI18n } from "../../../modules/preferences/renderer/public";
import { Button, TextInput } from "../../../modules/ui/renderer/public";
import { FolderIcon } from "../components/icons/common";
import { FileTypeBadge } from "./file-type-badge";
export type SuggestionPosition = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  offset: string;
};
export function ReferenceSuggestions({
  inline,
  manual,
  query,
  onQuery,
  onKey,
  listboxId,
  optionId,
  position,
  entries,
  selected,
  disabled,
  searchPending,
  searchFailed,
  truncated,
  onChoose,
  onRefresh,
  onClose,
}: {
  inline: boolean;
  manual: boolean;
  query: string;
  onQuery: (value: string) => void;
  onKey: (event: KeyboardEvent) => boolean;
  listboxId: string;
  optionId: (index: number) => string;
  position?: SuggestionPosition | undefined;
  entries: ProjectReferenceEntry[];
  selected: number;
  disabled: boolean;
  searchPending: boolean;
  searchFailed: boolean;
  truncated: boolean;
  onChoose: (entry: ProjectReferenceEntry) => void;
  onRefresh: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  return (
    <div
      className={inline ? "reference-suggestions" : "reference-search"}
      style={
        inline && position
          ? ({
              "--suggestion-top": `${position.top}px`,
              "--suggestion-offset": position.offset,
              "--suggestion-left": `${position.left}px`,
              "--suggestion-width": `${position.width}px`,
              "--suggestion-height": `${position.maxHeight}px`,
            } as CSSProperties)
          : undefined
      }
      role="region"
      aria-label={t("attachment.searchLabel")}
    >
      {manual && (
        <TextInput
          aria-label={t("attachment.searchLabel")}
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          onKeyDown={(event) => {
            if (onKey(event.nativeEvent)) event.preventDefault();
          }}
          autoFocus
        />
      )}
      {searchPending ? (
        <div
          id={listboxId}
          role="listbox"
          aria-label={t("attachment.searchLabel")}
        >
          <p role="status">{t("attachment.searching")}</p>
        </div>
      ) : searchFailed ? (
        <div
          id={listboxId}
          role="listbox"
          aria-label={t("attachment.searchLabel")}
        >
          <p role="alert">{t("attachment.searchFailed")}</p>
        </div>
      ) : (
        <div
          id={listboxId}
          className="reference-options"
          role="listbox"
          aria-label={t("attachment.searchLabel")}
        >
          {entries.map((entry, index) => (
            <Button
              key={entry.path}
              id={optionId(index)}
              tabIndex={-1}
              data-reference-kind={entry.kind}
              data-reference-path={entry.path}
              className="w-full justify-start text-left"
              variant={selected === index ? "navigation" : "ghost"}
              data-active={selected === index}
              role="option"
              aria-label={entry.path}
              disabled={disabled}
              aria-selected={selected === index}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onChoose(entry)}
            >
              {entry.kind === "directory" ? (
                <FolderIcon className="shrink-0" />
              ) : (
                <FileTypeBadge name={entry.path} />
              )}
              <span className="reference-name">
                {entry.path.split("/").at(-1)}
                {entry.kind === "directory" ? "/" : ""}
              </span>
              <span className="reference-directory">
                {entry.path.includes("/")
                  ? entry.path.slice(0, entry.path.lastIndexOf("/"))
                  : t(
                      entry.kind === "directory"
                        ? "attachment.directoryKind"
                        : "attachment.fileKind",
                    )}
              </span>
            </Button>
          ))}
          {!entries.length && <p>{t("attachment.noMatches")}</p>}
        </div>
      )}
      {truncated && <p>{t("attachment.searchLimited")}</p>}
      {manual && (
        <div className="reference-search-actions">
          <Button
            variant="ghost"
            disabled={searchPending}
            onClick={() => {
              onRefresh();
            }}
          >
            {t("attachment.refreshSearch")}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              onClose();
            }}
          >
            {t("attachment.cancelSearch")}
          </Button>
        </div>
      )}
    </div>
  );
}
