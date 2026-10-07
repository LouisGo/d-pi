import { createHash } from "node:crypto";
import { lstat, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";
import {
  ReadCancelledError,
  ReadOperationError,
  throwIfReadCancelled,
} from "../../../shared/read-operation";
import { MAX_VIEW_BYTES, readProjectFile } from "../../files/main/public";
import type { ChangeScope, GitReply } from "../contracts/public";
import {
  type GitCommandResult,
  GitOutputLimitError,
  GitReadRunner,
} from "./git-read-runner";

const MAX_ENTRIES = 1000;
function createReadAttempt(
  runner: GitReadRunner,
  parentSignal?: AbortSignal,
  validate?: () => void,
) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  parentSignal?.addEventListener("abort", abort, { once: true });
  if (parentSignal?.aborted) abort();
  const signal = controller.signal;
  const pending = new Set<Promise<GitCommandResult>>();
  type CommandResult = GitCommandResult;
  function git(
    cwd: string,
    args: string[],
    maxBuffer = MAX_VIEW_BYTES + 1024,
    extraConfig: string[] = [],
  ): Promise<CommandResult> {
    throwIfReadCancelled(signal);
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
    const configArgs = [
      "-c",
      "core.quotePath=false",
      "-c",
      "core.fsmonitor=false",
    ];
    for (const entry of extraConfig) configArgs.push("-c", entry);
    const command = runner.run({
      cwd,
      args: [...configArgs, "-C", cwd, ...args],
      env,
      signal,
      validate,
      maxOutputBytes: maxBuffer,
    });
    pending.add(command);
    void command.then(
      () => pending.delete(command),
      () => pending.delete(command),
    );
    return command;
  }
  function failureReply(error: unknown): GitReply {
    if (
      error instanceof ReadCancelledError ||
      error instanceof ReadOperationError
    )
      throw error;
    if (error instanceof GitOutputLimitError) return unavailable("too-large");
    throw error;
  }
  function strictText(data: Buffer): string {
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(data);
    } catch {
      throw new ReadOperationError("malformed-output");
    }
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
  /** Read-only queries must never execute programs from project or user Git
   * configuration. A worktree-involving `git diff` runs `clean` filters (a
   * configured long-running `process` filter takes precedence), and neither
   * `--no-ext-diff` nor `--no-textconv` covers them. Neutralize every
   * effective filter driver to a passthrough, so at most `cat` plus Git's
   * internal end-of-line handling can run. The resulting comparison is a
   * filter-free current sample, not a claim of fully normalized Git semantics.
   */
  async function filterNeutralizers(cwd: string): Promise<string[]> {
    const listing = await git(
      cwd,
      ["config", "--null", "--name-only", "--list"],
      1024 * 1024,
    );
    if (!listing.ok) throw listing.failure;
    const drivers = new Set<string>();
    const text = strictText(listing.data);
    if (text && !text.endsWith("\0"))
      throw new ReadOperationError("malformed-output");
    for (const name of text.split("\0").slice(0, -1)) {
      if (!name || !/^[a-zA-Z][^\0\r\n]*\.[^\0\r\n]+$/.test(name))
        throw new ReadOperationError("malformed-output");
      const match = /^filter\.(.*)\.(clean|smudge|process)$/i.exec(name);
      if (match?.[1]) drivers.add(match[1]);
    }
    return [...drivers].flatMap((driver) => [
      `filter.${driver}.clean=cat`,
      `filter.${driver}.smudge=cat`,
      `filter.${driver}.process=`,
    ]);
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
      if (code === "ENOENT") return unavailable("missing");
      if (typeof code === "string")
        throw new ReadOperationError("io", true, { cause: error });
      throw error;
    }
    throwIfReadCancelled(signal);
    if (canonical !== root) return unavailable("changed");
    const result = await git(root, ["rev-parse", "--show-toplevel"]);
    if (!result.ok) {
      if (result.errorCode === "ENOENT") return unavailable("git-unavailable");
      if (
        result.failure.code === "process-exit" &&
        result.stderr.includes("not a git repository")
      )
        return unavailable("not-git");
      throw result.failure;
    }
    const repositoryOutput = strictText(result.data);
    if (!repositoryOutput.endsWith("\n"))
      throw new ReadOperationError("malformed-output");
    let repo: string;
    try {
      repo = await realpath(repositoryOutput.slice(0, -1));
    } catch {
      return unavailable("changed");
    }
    throwIfReadCancelled(signal);
    const within = relative(repo, root);
    return !isAbsolute(within) &&
      within !== ".." &&
      !within.startsWith(`..${sep}`)
      ? repo
      : unavailable("changed");
  }
  async function head(root: string): Promise<string | null> {
    const result = await git(root, ["rev-parse", "--verify", "HEAD"]);
    if (result.ok) {
      const value = strictText(result.data);
      if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})\n$/.test(value))
        throw new ReadOperationError("malformed-output");
      return value.slice(0, -1);
    }
    if (
      result.failure.code === "process-exit" &&
      result.stderr.trim() === "fatal: Needed a single revision"
    )
      return null;
    throw result.failure;
  }
  function parseStatus(
    data: Buffer,
    scope: ChangeScope,
  ): Extract<GitReply, { kind: "changes" }>["entries"] {
    const text = strictText(data);
    if (text && !text.endsWith("\0"))
      throw new ReadOperationError("malformed-output");
    const values = text.split("\0");
    const entries: Extract<GitReply, { kind: "changes" }>["entries"] = [];
    for (let i = 0; i < values.length - 1; ) {
      if (scope === "untracked") {
        const path = values[i++] ?? "";
        if (!valid(path)) throw new ReadOperationError("malformed-output");
        entries.push({ scope, path, status: "added" });
        continue;
      }
      const code = values[i++] ?? "";
      if (
        !/^(?:[AMDUTXB]|[RC]\d{1,3})$/.test(code) ||
        (code.length > 1 && Number(code.slice(1)) > 100)
      )
        throw new ReadOperationError("malformed-output");
      const original = values[i++] ?? "";
      const renamed = code.startsWith("R") || code.startsWith("C");
      const path = renamed ? (values[i++] ?? "") : original;
      if (!code || !valid(path) || (renamed && !valid(original)))
        throw new ReadOperationError("malformed-output");
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
    neutralizers: string[],
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
      neutralizers,
    );
  }
  async function listGitChanges(root: string): Promise<GitReply> {
    try {
      let base: string;
      try {
        base = await realpath(root);
      } catch (error) {
        const code =
          typeof error === "object" && error !== null && "code" in error
            ? error.code
            : null;
        if (code === "ENOENT") return unavailable("missing");
        if (typeof code === "string")
          throw new ReadOperationError("io", true, { cause: error });
        throw error;
      }
      throwIfReadCancelled(signal);
      const repo = await repository(base);
      if (typeof repo !== "string") return repo;
      const beforeHead = await head(base);
      const scopes = ["head-index", "index-worktree", "untracked"] as const;
      const neutralizers = await filterNeutralizers(base);
      const samples = await Promise.all(
        scopes.map((scope) => sample(base, scope, neutralizers)),
      );
      for (const item of samples) if (!item.ok) throw item.failure;
      const againNeutralizers = await filterNeutralizers(base);
      const again = await Promise.all(
        scopes.map((scope) => sample(base, scope, againNeutralizers)),
      );
      for (const item of again) if (!item.ok) throw item.failure;
      if (
        again.some(
          (item, i) => !item.ok || !item.data.equals(samples[i]!.data),
        ) ||
        JSON.stringify(againNeutralizers) !== JSON.stringify(neutralizers) ||
        (await head(base)) !== beforeHead
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
    } catch (error) {
      return failureReply(error);
    }
  }
  async function blob(
    root: string,
    reference: string,
    source: string,
  ): Promise<Extract<GitReply, { kind: "diff" }>["left"] | GitReply> {
    const size = await git(root, ["cat-file", "-s", reference]);
    if (!size.ok) throw size.failure;
    const sizeText = strictText(size.data);
    if (!/^\d+\n$/.test(sizeText))
      throw new ReadOperationError("malformed-output");
    if (Number(sizeText) > MAX_VIEW_BYTES) return unavailable("too-large");
    // Plumbing output stays raw: unlike `git show`, `cat-file -p` never runs
    // smudge or text conversion filters from project or user configuration.
    const result = await git(root, ["cat-file", "-p", reference]);
    if (!result.ok) throw result.failure;
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
  async function readGitChange(
    root: string,
    scope: ChangeScope,
    path: string,
    afterCapture?: () => Promise<void>,
  ): Promise<GitReply> {
    if (!valid(path)) return unavailable("denied");
    try {
      let base: string;
      try {
        base = await realpath(root);
      } catch (error) {
        const code =
          typeof error === "object" && error !== null && "code" in error
            ? error.code
            : null;
        if (code === "ENOENT") return unavailable("missing");
        if (typeof code === "string")
          throw new ReadOperationError("io", true, { cause: error });
        throw error;
      }
      throwIfReadCancelled(signal);
      const listing = await listGitChanges(base);
      if (listing.kind !== "changes") return listing;
      const entry = listing.entries.find(
        (value) => value.scope === scope && value.path === path,
      );
      if (!entry) return unavailable("missing");
      if (entry.status === "unmerged") return unavailable("unmerged");
      const repoPath = relative(listing.repository, join(base, path))
        .split(sep)
        .join("/");
      const previousPath = entry.previousPath
        ? relative(listing.repository, join(base, entry.previousPath))
            .split(sep)
            .join("/")
        : repoPath;
      const stagePath =
        scope === "index-worktree" ? (entry.previousPath ?? path) : path;
      const stage = await git(base, [
        "ls-files",
        "--stage",
        "-z",
        "--",
        stagePath,
      ]);
      if (!stage.ok) throw stage.failure;
      const stageText = strictText(stage.data);
      if (stageText && !stageText.endsWith("\0"))
        throw new ReadOperationError("malformed-output");
      const stageRecords = stageText.split("\0").slice(0, -1);
      for (const record of stageRecords) {
        const parsed =
          /^(100644|100755|120000|160000) (?:[0-9a-f]{40}|[0-9a-f]{64}) [0-3]\t([\s\S]+)$/.exec(
            record,
          );
        if (!parsed || !valid(parsed[2]!))
          throw new ReadOperationError("malformed-output");
      }
      if (stageRecords.some((record) => /^(120000|160000) /.test(record)))
        return unavailable("unsupported");
      if (scope === "head-index" && listing.head) {
        const tree = await git(listing.repository, [
          "ls-tree",
          "-z",
          listing.head,
          "--",
          previousPath,
        ]);
        if (!tree.ok) throw tree.failure;
        const treeText = strictText(tree.data);
        if (treeText && !treeText.endsWith("\0"))
          throw new ReadOperationError("malformed-output");
        const treeRecords = treeText.split("\0").slice(0, -1);
        for (const record of treeRecords) {
          const parsed =
            /^(100644|100755|120000|040000|160000) (?:blob|tree|commit) (?:[0-9a-f]{40}|[0-9a-f]{64})\t([\s\S]+)$/.exec(
              record,
            );
          if (!parsed || !valid(parsed[2]!))
            throw new ReadOperationError("malformed-output");
        }
        if (treeRecords.some((record) => /^(120000|160000) /.test(record)))
          return unavailable("unsupported");
      }
      if (scope !== "head-index") {
        try {
          if ((await lstat(join(base, path))).isSymbolicLink())
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
        const result = await readProjectFile(
          base,
          path,
          MAX_VIEW_BYTES,
          undefined,
          signal,
        );
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
              : result.reason === "binary" ||
                  result.reason === "invalid-encoding"
                ? "binary"
                : "failed",
        );
      };
      const left =
        scope === "head-index"
          ? listing.head && entry.status !== "added"
            ? await blob(
                base,
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
                base,
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
            : await blob(base, `:${repoPath}`, `index: ${path}`)
          : scope === "index-worktree" && entry.status === "deleted"
            ? {
                kind: "absent" as const,
                source: `working tree: ${path} (absent)`,
              }
            : await worktree();
      if (isUnavailable(left)) return left;
      if (isUnavailable(right)) return right;
      throwIfReadCancelled(signal);
      await afterCapture?.();
      throwIfReadCancelled(signal);
      const repeatLeft =
        scope === "head-index"
          ? listing.head && entry.status !== "added"
            ? await blob(
                base,
                `${listing.head}:${previousPath}`,
                `HEAD ${listing.head.slice(0, 12)}: ${entry.previousPath ?? path}`,
              )
            : left
          : scope === "index-worktree"
            ? await blob(
                base,
                `:${previousPath}`,
                `index: ${entry.previousPath ?? path}`,
              )
            : left;
      const repeatRight =
        scope === "head-index" && entry.status !== "deleted"
          ? await blob(base, `:${repoPath}`, `index: ${path}`)
          : scope !== "head-index" &&
              !(scope === "index-worktree" && entry.status === "deleted")
            ? await worktree()
            : right;
      if (isUnavailable(repeatLeft)) return repeatLeft;
      if (isUnavailable(repeatRight)) return repeatRight;
      if (
        JSON.stringify(left) !== JSON.stringify(repeatLeft) ||
        JSON.stringify(right) !== JSON.stringify(repeatRight)
      )
        return unavailable("changed");
      const after = await listGitChanges(base);
      if (after.kind !== "changes") return after;
      if (
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
    } catch (error) {
      return failureReply(error);
    }
  }

  return {
    listGitChanges,
    readGitChange,
    close: async () => {
      controller.abort();
      await Promise.allSettled([...pending]);
      parentSignal?.removeEventListener("abort", abort);
    },
  };
}
export function createProjectGitReader(
  options: ConstructorParameters<typeof GitReadRunner>[0] = {},
) {
  const runner = new GitReadRunner(options);
  return {
    list: async (root: string, signal?: AbortSignal, validate?: () => void) => {
      const attempt = createReadAttempt(runner, signal, validate);
      try {
        return await attempt.listGitChanges(root);
      } finally {
        await attempt.close();
      }
    },
    diff: async (
      root: string,
      scope: ChangeScope,
      path: string,
      signal?: AbortSignal,
      afterCapture?: () => Promise<void>,
      validate?: () => void,
    ) => {
      const attempt = createReadAttempt(runner, signal, validate);
      try {
        return await attempt.readGitChange(root, scope, path, afterCapture);
      } finally {
        await attempt.close();
      }
    },
    close: () => runner.close(),
    snapshot: () => runner.snapshot(),
  };
}
export type ProjectGitReader = ReturnType<typeof createProjectGitReader>;
export async function listGitChanges(root: string): Promise<GitReply> {
  const reader = createProjectGitReader();
  try {
    return await reader.list(root);
  } finally {
    await reader.close();
  }
}
export async function readGitChange(
  root: string,
  scope: ChangeScope,
  path: string,
  afterCapture?: () => Promise<void>,
): Promise<GitReply> {
  const reader = createProjectGitReader();
  try {
    return await reader.diff(root, scope, path, undefined, afterCapture);
  } finally {
    await reader.close();
  }
}
