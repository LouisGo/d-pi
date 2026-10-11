import { describe, expect, it } from "vitest";
import { ToolSemanticSchema } from "../contracts/public";
import { decodeToolSemantic, toolSemanticArguments } from "./tool-semantic";

describe("fixed OMP semantic evidence before generic clipping", () => {
  it.each([true, false])(
    "keeps published agent reads internal when final metadata is present: %s",
    (withMetadata) => {
      const result = decodeToolSemantic(
        "read",
        { path: "agent://first-task" },
        {
          details: {
            resolvedPath: "/native/parent/first-task.md",
            ...(withMetadata
              ? {
                  meta: {
                    source: { type: "internal", value: "agent://first-task" },
                  },
                }
              : {}),
          },
        },
        "result",
      );
      expect(result).toMatchObject({
        kind: "generic",
        reason: "non-file",
        internalSource: "agent://first-task",
      });
      expect(ToolSemanticSchema.safeParse(result).success).toBe(true);
    },
  );
  it("retains bounded internal intent through progress and final without reparsing clipped arguments", () => {
    const intent = decodeToolSemantic(
      "read",
      { path: "agent://first-task" },
      undefined,
      "intent",
    );
    const progress = decodeToolSemantic(
      "read",
      toolSemanticArguments(intent),
      { content: [{ type: "text", text: "waiting" }] },
      "progress",
    );
    const final = decodeToolSemantic(
      "read",
      toolSemanticArguments(progress),
      { details: { resolvedPath: "/native/first-task.md" } },
      "result",
    );
    expect(final).toMatchObject({
      kind: "generic",
      reason: "non-file",
      internalSource: "agent://first-task",
    });
  });
  it("uses actual internal result source when the original args are not observed", () => {
    expect(
      decodeToolSemantic(
        "read",
        {},
        {
          details: {
            resolvedPath: "/native/first-task.md",
            meta: { source: { type: "internal", value: "agent://first-task" } },
          },
        },
        "result",
      ),
    ).toMatchObject({
      kind: "generic",
      reason: "non-file",
      internalSource: "agent://first-task",
    });
  });
  it("does not turn a failed intent or unadapted AST preview into reported file changes", () => {
    expect(
      decodeToolSemantic(
        "edit",
        { path: "/a" },
        {
          isError: true,
          content: [{ type: "text", text: "Cannot find match" }],
        },
        "result",
      ),
    ).toMatchObject({ kind: "generic" });
    expect(
      decodeToolSemantic(
        "ast_edit",
        {},
        {
          details: {
            applied: false,
            files: ["/a"],
            displayContent: "PREVIEW_PENDING_NOTICE",
          },
        },
        "result",
      ),
    ).toMatchObject({ kind: "generic", reason: "unsupported" });
    expect(
      decodeToolSemantic("edit", { path: "/a" }, { content: [] }, "result"),
    ).toMatchObject({ kind: "generic" });
  });
  it("keeps display range beyond the generic 1024 string budget", () => {
    const result = decodeToolSemantic(
      "read",
      { path: "src/a.ts:10-50" },
      {
        details: {
          resolvedPath: "/project/src/a.ts",
          displayContent: {
            text: "x".repeat(1800),
            startLine: 10,
            lineNumbers: [10, null, 50],
          },
        },
      },
      "result",
    );
    expect(result).toMatchObject({
      kind: "resource-read",
      path: "/project/src/a.ts",
      startLine: 10,
      excerpt: "x".repeat(1800),
      lineNumbers: [10, null, 50],
    });
    expect(ToolSemanticSchema.safeParse(result).success).toBe(true);
  });
  it("routes read URL/proc and write xdev/help/propose without claiming file changes", () => {
    expect(
      decodeToolSemantic(
        "read",
        { path: "https://a.test" },
        { details: { kind: "url", finalUrl: "https://b.test" } },
        "result",
      ),
    ).toMatchObject({ kind: "web-research", finalUrl: "https://b.test" });
    expect(
      decodeToolSemantic(
        "read",
        { path: "proc://42" },
        { details: { proc: { jobId: "42" } } },
        "result",
      ).kind,
    ).toBe("generic");
    expect(
      decodeToolSemantic(
        "write",
        { path: "xd://edit" },
        {
          details: {
            xdev: {
              tool: "edit",
              mode: "execute",
              inner: { path: "/a", diff: "actual", snapshotsPruned: true },
            },
          },
        },
        "result",
      ),
    ).toMatchObject({
      kind: "file-change",
      transportTool: "write",
      effectiveTool: "edit",
      partial: true,
      changes: [{ path: "/a", patch: "actual", snapshotsPruned: true }],
    });
    expect(
      decodeToolSemantic(
        "write",
        {},
        { details: { xdev: { tool: "edit", mode: "help" } } },
        "result",
      ),
    ).toMatchObject({ kind: "generic", reason: "help" });
    expect(
      decodeToolSemantic(
        "write",
        { path: "xd://propose", content: "plan" },
        undefined,
        "intent",
      ).kind,
    ).toBe("generic");
  });
  it("retains partial multi-file failures and never invents diff from write input", () => {
    const edit = decodeToolSemantic(
      "edit",
      {},
      {
        details: {
          perFileResults: [
            { path: "/a", diff: "+good" },
            { path: "/b", diff: "", isError: true },
          ],
        },
      },
      "result",
    );
    expect(edit).toMatchObject({
      kind: "file-change",
      partial: true,
      changes: [{ failed: false }, { failed: true }],
    });
    expect(
      decodeToolSemantic(
        "write",
        { path: "a", content: "new" },
        { details: { resolvedPath: "/a" } },
        "result",
      ),
    ).toMatchObject({ kind: "file-change", changes: [{ path: "/a" }] });
  });
  it("keeps native search ranges and counts; malformed structures degrade", () => {
    expect(
      decodeToolSemantic(
        "find",
        { query: "test" },
        {
          details: {
            hits: [
              { rel: "a.ts", ranges: [{ start: 5, end: 8, snippet: "real" }] },
            ],
            scopePath: "/src",
            cwd: "/project",
          },
        },
        "result",
      ),
    ).toMatchObject({
      kind: "search",
      query: "test",
      scope: "/src",
      cwd: "/project",
      hits: [{ path: "a.ts", ranges: [{ start: 5, end: 8, snippet: "real" }] }],
    });
    expect(
      decodeToolSemantic(
        "edit",
        {},
        { details: { perFileResults: "bad" } },
        "result",
      ),
    ).toMatchObject({ kind: "generic", reason: "invalid" });
  });
  it("caps lists and text and inherits native coverage", () => {
    const result = decodeToolSemantic(
      "grep",
      { pattern: "a" },
      {
        details: {
          meta: { truncation: {} },
          fileMatches: Array.from({ length: 40 }, (_, i) => ({
            path: `/${i}`,
            count: i,
          })),
        },
      },
      "result",
    );
    expect(result).toMatchObject({
      kind: "search",
      partial: true,
      truncated: true,
    });
    if (result.kind === "search") expect(result.hits).toHaveLength(8);
    expect(ToolSemanticSchema.safeParse(result).success).toBe(true);
  });
});
