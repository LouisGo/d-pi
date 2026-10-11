import type { GitReply } from "../../../modules/changes/contracts/public";
import type { FileReply } from "../../../modules/files/contracts/public";
import type { useI18n } from "../../../modules/preferences/renderer/public";

type UnavailableReason = Extract<
  FileReply | GitReply,
  { kind: "unavailable" }
>["reason"];
export function fileReadReason(
  reply: UnavailableReason,
  t: ReturnType<typeof useI18n>["t"],
): string {
  if (reply === "not-git") return t("ui.files.notGit");
  if (reply === "git-unavailable") return t("ui.files.gitUnavailable");
  if (reply === "missing") return t("ui.files.reason.missing");
  if (reply === "denied") return t("ui.files.reason.denied");
  if (reply === "binary") return t("ui.files.reason.binary");
  if (reply === "invalid-encoding") return t("ui.files.reason.encoding");
  if (reply === "too-large") return t("ui.files.reason.large");
  if (reply === "changed") return t("ui.files.reason.changed");
  if (reply === "unmerged") return t("ui.files.reason.unmerged");
  if (reply === "unsupported") return t("ui.files.reason.unsupported");
  if (reply === "not-file") return t("ui.files.reason.notFile");
  return t("ui.files.reason.failed");
}
