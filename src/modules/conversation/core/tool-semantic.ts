import { match } from "ts-pattern";
import { z } from "zod";
import type {
  ToolChange,
  ToolSearchHit,
  ToolSemantic,
} from "../contracts/tool-semantic";
import { toolOutputCoverage } from "./tool-payload";

const ArgsSchema = z.object({
  path: z.string().optional(),
  file_path: z.string().optional(),
  command: z.string().optional(),
  cwd: z.string().optional(),
  pattern: z.string().optional(),
  query: z.string().optional(),
});
const DetailsSchema = z.object({
  resolvedPath: z.string().optional(),
  path: z.string().optional(),
  displayTarget: z.string().optional(),
  kind: z.string().optional(),
  isDirectory: z.boolean().optional(),
  contentType: z.string().optional(),
  url: z.string().optional(),
  finalUrl: z.string().optional(),
  displayContent: z.unknown().optional(),
  proc: z.unknown().optional(),
  cfg: z.unknown().optional(),
  xdev: z.unknown().optional(),
  diff: z.string().optional(),
  perFileResults: z.unknown().optional(),
  snapshotsPruned: z.boolean().optional(),
  firstChangedLine: z.number().int().positive().optional(),
  sourcePath: z.string().optional(),
  op: z.enum(["create", "delete", "update"]).optional(),
  fileMatches: z.unknown().optional(),
  files: z.unknown().optional(),
  hits: z.unknown().optional(),
  matchCount: z.number().int().nonnegative().optional(),
  fileCount: z.number().int().nonnegative().optional(),
  scopePath: z.string().optional(),
  searchPath: z.string().optional(),
  cwd: z.string().optional(),
  truncated: z.boolean().optional(),
  truncation: z.unknown().optional(),
  fileLimitReached: z.number().optional(),
  perFileLimitReached: z.number().optional(),
  linesTruncated: z.boolean().optional(),
});
const ResultSchema = z.object({
  details: z.unknown().optional(),
  isError: z.boolean().optional(),
});
const XdevSchema = z.object({
  tool: z.string().max(120),
  mode: z.enum(["help", "execute"]),
  args: z.unknown().optional(),
  inner: z.unknown().optional(),
});
const DisplaySchema = z.object({
  text: z.string(),
  startLine: z.number().int().positive(),
  lineNumbers: z.unknown().optional(),
});
const ChangeSchema = z.object({
  path: z.string().max(4096),
  diff: z.string().optional(),
  firstChangedLine: z.number().int().positive().optional(),
  op: z.enum(["create", "delete", "update"]).optional(),
  sourcePath: z.string().max(4096).optional(),
  isError: z.boolean().optional(),
  snapshotsPruned: z.boolean().optional(),
});
const HitSchema = z.object({
  path: z.string().max(4096).optional(),
  rel: z.string().max(4096).optional(),
  count: z.number().int().nonnegative().optional(),
  ranges: z.unknown().optional(),
  truncated: z.boolean().optional(),
});
const RangeSchema = z.object({
  start: z.number().int().positive(),
  end: z.number().int().positive(),
  snippet: z.string(),
});

/** OMP 18.8.9 pure adapter. Extract BEFORE projectToolPayload, never from its clipped JSON. */
export function decodeToolSemantic(
  name: string,
  argsInput: unknown,
  result: unknown,
  phase: ToolSemantic["phase"],
  isError?: boolean,
): ToolSemantic {
  const coverage =
    result === undefined
      ? { partial: false, truncated: false }
      : toolOutputCoverage(result);
  const base = {
    transportTool: name.slice(0, 120),
    effectiveTool: name.slice(0, 120),
    phase,
    ...coverage,
  };
  const generic = (
    reason: Extract<ToolSemantic, { kind: "generic" }>["reason"],
  ): ToolSemantic => ({ ...base, kind: "generic", reason });
  const clip = (text: string | undefined, limit = 2048) => {
    if ((text?.length ?? 0) > limit) base.partial = base.truncated = true;
    return (text ?? "").slice(0, limit);
  };
  const list = (value: unknown, limit = 8): unknown[] => {
    if (!Array.isArray(value)) return [];
    if (value.length > limit) base.partial = base.truncated = true;
    return value.slice(0, limit);
  };
  const envelope = ResultSchema.safeParse(result ?? {});
  let detailInput = envelope.success ? envelope.data.details : undefined;
  let args = ArgsSchema.safeParse(argsInput ?? {});
  if (!args.success) return generic("invalid");
  let details = DetailsSchema.safeParse(detailInput ?? {});
  if (!details.success) return generic("invalid");
  // A delegated result retains the outer call identity; inner is metadata, not a new tool result.
  if (details.data.xdev !== undefined) {
    const xdev = XdevSchema.safeParse(details.data.xdev);
    if (!xdev.success) return generic("invalid");
    base.effectiveTool = xdev.data.tool;
    if (xdev.data.mode === "help") return generic("help");
    detailInput = xdev.data.inner;
    details = DetailsSchema.safeParse(detailInput ?? {});
    args = ArgsSchema.safeParse(xdev.data.args ?? {});
    if (!details.success || !args.success) return generic("invalid");
    const innerCoverage = toolOutputCoverage({ details: detailInput });
    base.partial ||= innerCoverage.partial;
    base.truncated ||= innerCoverage.truncated;
  }
  const d = details.data;
  const a = args.data;
  base.partial ||= Boolean(
    d.truncated ||
      d.truncation ||
      d.fileLimitReached ||
      d.perFileLimitReached ||
      d.linesTruncated,
  );
  base.truncated ||= Boolean(d.truncated || d.truncation || d.linesTruncated);
  const target =
    d.resolvedPath ?? d.path ?? d.displayTarget ?? a.path ?? a.file_path ?? "";
  if (target.length > 4096) return generic("invalid");
  if (d.proc !== undefined || d.cfg !== undefined) return generic("non-file");
  if (
    base.effectiveTool === "read" &&
    (d.kind === "url" || /^https?:\/\//.test(target))
  ) {
    const url = d.url ?? target;
    if (url.length > 4096 || (d.finalUrl?.length ?? 0) > 4096)
      return generic("invalid");
    return {
      ...base,
      kind: "web-research",
      url,
      ...(d.finalUrl ? { finalUrl: d.finalUrl } : {}),
    };
  }
  // Internal transports must not be inferred to be filesystem operations.
  if (/^[a-z][\w+.-]*:\/\//i.test(target)) {
    if (
      base.effectiveTool !== "read" ||
      /^(proc|cfg|agent|xd):\/\//.test(target)
    )
      return generic("non-file");
  }
  return match(base.effectiveTool)
    .with("bash", "exec", () => {
      const command = clip(a.command);
      return {
        ...base,
        kind: "command" as const,
        command,
        ...(a.cwd && a.cwd.length <= 4096 ? { cwd: a.cwd } : {}),
      };
    })
    .with("read", () => {
      const display = DisplaySchema.safeParse(d.displayContent);
      const excerpt = clip(display.success ? display.data.text : "");
      let lineNumbers: (number | null)[] | undefined;
      if (display.success && Array.isArray(display.data.lineNumbers)) {
        const parsed = z
          .array(z.number().int().positive().nullable())
          .safeParse(list(display.data.lineNumbers, 64));
        if (parsed.success) lineNumbers = parsed.data;
        else base.partial = true;
      }
      return {
        ...base,
        kind: "resource-read" as const,
        path: target,
        resourceType: d.isDirectory
          ? ("directory" as const)
          : d.contentType?.startsWith("image/")
            ? ("image" as const)
            : target.includes("://")
              ? ("internal" as const)
              : ("file" as const),
        excerpt,
        ...(display.success ? { startLine: display.data.startLine } : {}),
        ...(lineNumbers ? { lineNumbers } : {}),
      };
    })
    .with("grep", "find", "glob", () => {
      const hits: ToolSearchHit[] = [];
      const values = d.hits ?? d.fileMatches ?? d.files;
      if (values !== undefined && !Array.isArray(values))
        return generic("invalid");
      for (const value of list(values)) {
        const parsed = HitSchema.safeParse(
          typeof value === "string" ? { path: value } : value,
        );
        if (!parsed.success || !(parsed.data.path ?? parsed.data.rel)) {
          base.partial = true;
          continue;
        }
        const hit = parsed.data;
        const ranges: ToolSearchHit["ranges"] = [];
        for (const raw of list(hit.ranges)) {
          const range = RangeSchema.safeParse(raw);
          if (!range.success || range.data.end < range.data.start) {
            base.partial = true;
            continue;
          }
          ranges.push({ ...range.data, snippet: clip(range.data.snippet) });
        }
        base.partial ||= hit.truncated === true;
        hits.push({
          path: hit.path ?? hit.rel ?? "",
          ranges,
          ...(hit.count !== undefined ? { count: hit.count } : {}),
        });
      }
      const scope = d.scopePath ?? d.searchPath ?? a.path ?? "";
      if (scope.length > 4096) return generic("invalid");
      const query = clip(a.query ?? a.pattern);
      const excerpt = clip(
        typeof d.displayContent === "string" ? d.displayContent : undefined,
      );
      return {
        ...base,
        kind: "search" as const,
        query,
        scope,
        ...(d.cwd !== undefined && d.cwd.length <= 4096 ? { cwd: d.cwd } : {}),
        hits,
        excerpt,
        ...(d.matchCount !== undefined ? { matchCount: d.matchCount } : {}),
        ...(d.fileCount !== undefined ? { fileCount: d.fileCount } : {}),
      };
    })
    .with("edit", "write", "apply_patch", () => {
      // A result without native change metadata is not proof of the intent path changing.
      if (
        phase === "result" &&
        d.perFileResults === undefined &&
        !d.path &&
        !d.resolvedPath &&
        d.diff === undefined
      )
        return generic("unsupported");
      const values =
        d.perFileResults ?? (target ? [{ ...d, path: target }] : []);
      if (!Array.isArray(values)) return generic("invalid");
      const changes: ToolChange[] = [];
      for (const value of list(values)) {
        const parsed = ChangeSchema.safeParse(value);
        if (!parsed.success) {
          base.partial = true;
          continue;
        }
        const change = parsed.data;
        const patch = change.diff !== undefined ? clip(change.diff) : undefined;
        base.partial ||= Boolean(change.isError || change.snapshotsPruned);
        changes.push({
          path: change.path,
          failed:
            change.isError === true ||
            (isError ?? (envelope.success && envelope.data.isError)) === true,
          snapshotsPruned: change.snapshotsPruned === true,
          ...(patch !== undefined ? { patch } : {}),
          ...(change.firstChangedLine
            ? { firstChangedLine: change.firstChangedLine }
            : {}),
          ...(change.op ? { operation: change.op } : {}),
          ...(change.sourcePath ? { sourcePath: change.sourcePath } : {}),
        });
      }
      return { ...base, kind: "file-change" as const, changes };
    })
    .otherwise(() => generic("unsupported"));
}

/** Retain already bounded intent, never reconstitute clipped generic JSON. */
export function toolSemanticArguments(
  semantic: ToolSemantic | undefined,
): unknown {
  if (!semantic) return {};
  return match(semantic)
    .with({ kind: "command" }, (s) => ({ command: s.command, cwd: s.cwd }))
    .with({ kind: "resource-read" }, (s) => ({ path: s.path }))
    .with({ kind: "web-research" }, (s) => ({ path: s.url }))
    .with({ kind: "search" }, (s) => ({ path: s.scope, query: s.query }))
    .with({ kind: "file-change" }, (s) => ({ path: s.changes[0]?.path }))
    .with({ kind: "generic" }, () => ({}))
    .exhaustive();
}
