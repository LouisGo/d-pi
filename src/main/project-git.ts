import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";
import type { ChangeScope, GitReply } from "../features/changes/contracts";
import { MAX_VIEW_BYTES, readProjectFile } from "./project-files";

const MAX_ENTRIES = 1000;
type CommandResult =
  | { ok: true; data: Buffer }
  | { ok: false; data: Buffer; errorCode: string | null; stderr: string };
function git(
  cwd: string,
  args: string[],
  maxBuffer = MAX_VIEW_BYTES + 1024,
): Promise<CommandResult> {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    GIT_OPTIONAL_LOCKS: "0",
    GIT_PAGER: "cat",
    GIT_EXTERNAL_DIFF: "",
    LC_ALL: "C",
  };
  for (const key of [
    "GIT_DIR",
    "GIT_WORK_TREE",
    "GIT_INDEX_FILE",
    "GIT_COMMON_DIR",
    "GIT_CONFIG",
    "GIT_CONFIG_GLOBAL",
    "GIT_CONFIG_SYSTEM",
  ])
    delete env[key];
  return new Promise((resolve) => {
    execFile(
      "git",
      [
        "-c",
        "core.quotePath=false",
        "-c",
        "core.fsmonitor=false",
        "-C",
        cwd,
        ...args,
      ],
      { encoding: "buffer", env, timeout: 10000, maxBuffer },
      (error, stdout, stderr) => {
        const data = Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout);
        resolve(
          error
            ? {
                ok: false,
                data,
                errorCode: typeof error.code === "string" ? error.code : null,
                stderr: Buffer.isBuffer(stderr)
                  ? stderr.toString("utf8")
                  : String(stderr),
              }
            : { ok: true, data },
        );
      },
    );
  });
}
function unavailable(
  reason: Extract<GitReply, { kind: "unavailable" }>["reason"],
): GitReply {
  return { kind: "unavailable", reason };
}
function valid(path: string): boolean {
  return (
    !!path &&
    !isAbsolute(path) &&
    !path.includes("\0") &&
    path.split(/[\\/]/).every((part) => part !== "..")
  );
}
function digest(data: Buffer): string {
  return `sha256:${createHash("sha256").update(data).digest("hex")}`;
}
function decode(data: Buffer): string | null {
  if (data.includes(0)) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(data);
  } catch {
    return null;
  }
}
async function repository(root: string): Promise<string | GitReply> {
  let canonical: string;
  try {
    canonical = await realpath(root);
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? error.code
        : null;
    return unavailable(code === "ENOENT" ? "missing" : "failed");
  }
  if (canonical !== root) return unavailable("changed");
  const result = await git(root, ["rev-parse", "--show-toplevel"]);
  if (!result.ok)
    return unavailable(
      result.errorCode === "ENOENT"
        ? "git-unavailable"
        : result.stderr.includes("not a git repository")
          ? "not-git"
          : "failed",
    );
  let repo: string;
  try {
    repo = await realpath(result.data.toString("utf8").trim());
  } catch {
    return unavailable("changed");
  }
  const within = relative(repo, root);
  return !isAbsolute(within) &&
    within !== ".." &&
    !within.startsWith(`..${sep}`)
    ? repo
    : unavailable("changed");
}
async function head(root: string): Promise<string | null> {
  const result = await git(root, ["rev-parse", "--verify", "HEAD"]);
  return result.ok ? result.data.toString("utf8").trim() : null;
}
function parseStatus(
  data: Buffer,
  scope: ChangeScope,
): Extract<GitReply, { kind: "changes" }>["entries"] {
  const values = data.toString("utf8").split("\0");
  const entries: Extract<GitReply, { kind: "changes" }>["entries"] = [];
  for (let i = 0; i < values.length - 1; ) {
    if (scope === "untracked") {
      const path = values[i++] ?? "";
      if (valid(path)) entries.push({ scope, path, status: "added" });
      continue;
    }
    const code = values[i++] ?? "";
    const original = values[i++] ?? "";
    const renamed = code.startsWith("R") || code.startsWith("C");
    const path = renamed ? (values[i++] ?? "") : original;
    if (!valid(path) || (renamed && !valid(original))) continue;
    const status = code.startsWith("A")
      ? "added"
      : code.startsWith("M")
        ? "modified"
        : code.startsWith("D")
          ? "deleted"
          : renamed
            ? "renamed"
            : code.startsWith("U")
              ? "unmerged"
              : "other";
    entries.push({
      scope,
      path,
      status,
      ...(renamed ? { previousPath: original } : {}),
    });
  }
  return entries;
}
async function sample(
  root: string,
  scope: ChangeScope,
): Promise<CommandResult> {
  if (scope === "untracked")
    return git(
      root,
      ["ls-files", "--others", "--exclude-standard", "-z", "--", "."],
      4 * 1024 * 1024,
    );
  return git(
    root,
    [
      "diff",
      "--name-status",
      "-z",
      "-M",
      "--relative",
      "--no-ext-diff",
      "--no-textconv",
      ...(scope === "head-index" ? ["--cached"] : []),
      "--",
      ".",
    ],
    4 * 1024 * 1024,
  );
}
export async function listGitChanges(root: string): Promise<GitReply> {
  try {
    const repo = await repository(root);
    if (typeof repo !== "string") return repo;
    const beforeHead = await head(root);
    const scopes = ["head-index", "index-worktree", "untracked"] as const;
    const samples = await Promise.all(
      scopes.map((scope) => sample(root, scope)),
    );
    if (samples.some((item) => !item.ok)) return unavailable("failed");
    const again = await Promise.all(scopes.map((scope) => sample(root, scope)));
    if (
      again.some(
        (item, i) => !item.ok || !item.data.equals(samples[i]!.data),
      ) ||
      (await head(root)) !== beforeHead
    )
      return unavailable("changed");
    const entries = scopes.flatMap((scope, i) =>
      parseStatus(samples[i]!.data, scope),
    );
    return {
      kind: "changes",
      repository: repo,
      head: beforeHead,
      capturedAt: new Date().toISOString(),
      coverage: "project-paths-current-sample",
      entries: entries.slice(0, MAX_ENTRIES),
      truncated: entries.length > MAX_ENTRIES,
    };
  } catch {
    return unavailable("failed");
  }
}
async function blob(
  root: string,
  reference: string,
  source: string,
): Promise<Extract<GitReply, { kind: "diff" }>["left"] | GitReply> {
  const size = await git(root, ["cat-file", "-s", reference]);
  if (!size.ok) return unavailable("failed");
  if (Number(size.data.toString("utf8").trim()) > MAX_VIEW_BYTES)
    return unavailable("too-large");
  const result = await git(root, ["show", reference]);
  if (!result.ok) return unavailable("failed");
  if (result.data.length > MAX_VIEW_BYTES) return unavailable("too-large");
  const text = decode(result.data);
  if (text === null) return unavailable("binary");
  return {
    kind: "text",
    text,
    source,
    version: digest(result.data),
    coverage: "complete",
  };
}
function isUnavailable(
  value: Extract<GitReply, { kind: "diff" }>["left"] | GitReply,
): value is GitReply {
  return value.kind === "unavailable";
}
export async function readGitChange(
  root: string,
  scope: ChangeScope,
  path: string,
  afterCapture?: () => Promise<void>,
): Promise<GitReply> {
  if (!valid(path)) return unavailable("denied");
  try {
    const listing = await listGitChanges(root);
    if (listing.kind !== "changes") return listing;
    const entry = listing.entries.find(
      (value) => value.scope === scope && value.path === path,
    );
    if (!entry) return unavailable("missing");
    if (entry.status === "unmerged") return unavailable("unmerged");
    const repoPath = relative(listing.repository, join(root, path))
      .split(sep)
      .join("/");
    const previousPath = entry.previousPath
      ? relative(listing.repository, join(root, entry.previousPath))
          .split(sep)
          .join("/")
      : repoPath;
    const stagePath =
      scope === "index-worktree" ? (entry.previousPath ?? path) : path;
    const stage = await git(root, [
      "ls-files",
      "--stage",
      "-z",
      "--",
      stagePath,
    ]);
    if (!stage.ok) return unavailable("failed");
    if (/^(120000|160000) /m.test(stage.data.toString("utf8")))
      return unavailable("unsupported");
    if (scope === "head-index" && listing.head) {
      const tree = await git(listing.repository, [
        "ls-tree",
        "-z",
        listing.head,
        "--",
        previousPath,
      ]);
      if (!tree.ok) return unavailable("failed");
      if (/^(120000|160000) /m.test(tree.data.toString("utf8")))
        return unavailable("unsupported");
    }
    if (scope !== "head-index") {
      try {
        if ((await lstat(join(root, path))).isSymbolicLink())
          return unavailable("unsupported");
      } catch (error) {
        const code =
          typeof error === "object" && error !== null && "code" in error
            ? error.code
            : null;
        if (code !== "ENOENT") return unavailable("failed");
      }
    }
    const worktree = async () => {
      const result = await readProjectFile(root, path);
      if (result.kind === "text")
        return {
          kind: "text" as const,
          text: result.text,
          source: `working tree: ${path}`,
          version: result.version,
          coverage: "complete" as const,
        };
      if (result.kind !== "unavailable") return unavailable("failed");
      if (result.reason === "missing")
        return {
          kind: "absent" as const,
          source: `working tree: ${path} (absent)`,
        };
      return unavailable(
        result.reason === "too-large"
          ? "too-large"
          : result.reason === "changed"
            ? "changed"
            : result.reason === "binary" || result.reason === "invalid-encoding"
              ? "binary"
              : "failed",
      );
    };
    const left =
      scope === "head-index"
        ? listing.head && entry.status !== "added"
          ? await blob(
              root,
              `${listing.head}:${previousPath}`,
              `HEAD ${listing.head.slice(0, 12)}: ${entry.previousPath ?? path}`,
            )
          : {
              kind: "absent" as const,
              source: listing.head
                ? "HEAD (path absent)"
                : "HEAD (unborn; absent)",
            }
        : scope === "index-worktree"
          ? await blob(
              root,
              `:${previousPath}`,
              `index: ${entry.previousPath ?? path}`,
            )
          : {
              kind: "absent" as const,
              source: "untracked (absent from index)",
            };
    const right =
      scope === "head-index"
        ? entry.status === "deleted"
          ? { kind: "absent" as const, source: `index: ${path} (absent)` }
          : await blob(root, `:${repoPath}`, `index: ${path}`)
        : scope === "index-worktree" && entry.status === "deleted"
          ? {
              kind: "absent" as const,
              source: `working tree: ${path} (absent)`,
            }
          : await worktree();
    if (isUnavailable(left)) return left;
    if (isUnavailable(right)) return right;
    await afterCapture?.();
    const repeatLeft =
      scope === "head-index"
        ? listing.head && entry.status !== "added"
          ? await blob(
              root,
              `${listing.head}:${previousPath}`,
              `HEAD ${listing.head.slice(0, 12)}: ${entry.previousPath ?? path}`,
            )
          : left
        : scope === "index-worktree"
          ? await blob(
              root,
              `:${previousPath}`,
              `index: ${entry.previousPath ?? path}`,
            )
          : left;
    const repeatRight =
      scope === "head-index" && entry.status !== "deleted"
        ? await blob(root, `:${repoPath}`, `index: ${path}`)
        : scope !== "head-index" &&
            !(scope === "index-worktree" && entry.status === "deleted")
          ? await worktree()
          : right;
    if (
      isUnavailable(repeatLeft) ||
      isUnavailable(repeatRight) ||
      JSON.stringify(left) !== JSON.stringify(repeatLeft) ||
      JSON.stringify(right) !== JSON.stringify(repeatRight)
    )
      return unavailable("changed");
    const after = await listGitChanges(root);
    if (
      after.kind !== "changes" ||
      after.repository !== listing.repository ||
      after.head !== listing.head ||
      JSON.stringify(after.entries) !== JSON.stringify(listing.entries)
    )
      return unavailable("changed");
    return {
      kind: "diff",
      repository: listing.repository,
      head: listing.head,
      path,
      ...(entry.previousPath ? { previousPath: entry.previousPath } : {}),
      scope,
      capturedAt: new Date().toISOString(),
      coverage: "single-file-current-sample",
      left,
      right,
    };
  } catch {
    return unavailable("failed");
  }
}
