import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { readNativeHistory } from "./native-history";

it("reads bound native v3 history without modifying it, retaining branch identities and incomplete tail", async () => {
  const root = mkdtempSync(join(tmpdir(), "d-pi-history-"));
  const threadId = crypto.randomUUID();
  const directory = join(root, threadId);
  mkdirSync(directory);
  const file = join(directory, "session.jsonl");
  const binding = {
    threadId,
    configContextId: "fixture",
    sessionId: "session",
    sessionFile: file,
  };
  const body =
    [
      { type: "title", v: 1, title: "title", pad: "" },
      {
        type: "session",
        version: 3,
        id: "session",
        cwd: "/fixture",
        timestamp: "now",
      },
      {
        type: "message",
        id: "a",
        parentId: null,
        message: { role: "user", content: "A" },
      },
      {
        type: "message",
        id: "b",
        parentId: "a",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "answer" }],
        },
      },
      {
        type: "message",
        id: "c",
        parentId: "b",
        message: {
          role: "toolResult",
          toolCallId: "call-1",
          toolName: "write",
          isError: false,
          content: [
            { type: "text", text: "Wrote src/a.ts" },
            { type: "image", data: "ignored" },
          ],
        },
      },
    ]
      .map((x) => JSON.stringify(x))
      .join("\n") + '\n{"type":';
  writeFileSync(file, body);
  try {
    expect(await readNativeHistory(root, binding)).toMatchObject({
      kind: "page",
      entries: [
        { id: "a", parentId: null, role: "user", text: "A" },
        { id: "b", parentId: "a", role: "assistant", text: "answer" },
        {
          id: "c",
          role: "toolResult",
          text: "Wrote src/a.ts",
          toolEvidence: {
            toolCallId: "call-1",
            toolName: "write",
            isError: false,
            effect: "mutation",
            coverage: "text-parts-only",
            nonTextParts: 1,
          },
        },
      ],
      incompleteTail: true,
      coverage: "append-order",
    });
    expect(readFileSync(file, "utf8")).toBe(body);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it("keeps failed, successful and unknown tool results distinct and ignores results without tool identity", async () => {
  const root = mkdtempSync(join(tmpdir(), "d-pi-history-tools-"));
  const threadId = crypto.randomUUID();
  const directory = join(root, threadId);
  mkdirSync(directory);
  const file = join(directory, "session.jsonl");
  const binding = {
    threadId,
    configContextId: "fixture",
    sessionId: "session",
    sessionFile: file,
  };
  const body =
    [
      { type: "session", version: 3, id: "session" },
      {
        type: "message",
        id: "failed",
        parentId: null,
        message: {
          role: "toolResult",
          toolCallId: "call-error",
          toolName: "shell",
          isError: true,
          content: [{ type: "text", text: "boom" }],
        },
      },
      {
        type: "message",
        id: "ok-read",
        parentId: "failed",
        message: {
          role: "toolResult",
          toolCallId: "call-ok",
          toolName: "read",
          isError: false,
          content: [{ type: "text", text: "content" }],
        },
      },
      {
        type: "message",
        id: "unknown",
        parentId: "ok-read",
        message: {
          role: "toolResult",
          toolCallId: "call-unknown",
          toolName: "custom-tool",
          isError: false,
          content: [
            { type: "text", text: "done" },
            { type: "image", data: "ignored" },
          ],
        },
      },
      {
        type: "message",
        id: "orphan",
        parentId: "unknown",
        message: {
          role: "toolResult",
          content: [{ type: "text", text: "orphan" }],
        },
      },
    ]
      .map((x) => JSON.stringify(x))
      .join("\n") + "\n";
  writeFileSync(file, body);
  try {
    const page = await readNativeHistory(root, binding);
    expect(page).toMatchObject({ kind: "page" });
    if (page.kind !== "page") return;
    expect(page.entries).toMatchObject([
      {
        id: "failed",
        toolEvidence: {
          toolCallId: "call-error",
          toolName: "shell",
          isError: true,
          effect: "unknown",
          coverage: "text-parts-only",
          nonTextParts: 0,
        },
      },
      {
        id: "ok-read",
        toolEvidence: {
          toolCallId: "call-ok",
          toolName: "read",
          isError: false,
          effect: "no-mutation",
          coverage: "text-parts-only",
          nonTextParts: 0,
        },
      },
      {
        id: "unknown",
        text: "done",
        toolEvidence: {
          toolCallId: "call-unknown",
          toolName: "custom-tool",
          isError: false,
          effect: "unknown",
          coverage: "text-parts-only",
          nonTextParts: 1,
        },
      },
      { id: "orphan", text: "orphan" },
    ]);
    expect(page.entries[3]).not.toHaveProperty("toolEvidence");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it("classifies every known mutating native tool without changing its original name", async () => {
  const root = mkdtempSync(join(tmpdir(), "d-pi-history-tool-effects-"));
  const threadId = crypto.randomUUID();
  const directory = join(root, threadId);
  mkdirSync(directory);
  const file = join(directory, "session.jsonl");
  const binding = {
    threadId,
    configContextId: "fixture",
    sessionId: "session",
    sessionFile: file,
  };
  const toolNames = ["edit", "delete", "apply_patch", "ast_edit"] as const;
  const body =
    [
      { type: "session", version: 3, id: "session" },
      ...toolNames.map((toolName, index) => ({
        type: "message",
        id: `tool-${index}`,
        parentId: index === 0 ? null : `tool-${index - 1}`,
        message: {
          role: "toolResult",
          toolCallId: `call-${index}`,
          toolName,
          isError: false,
          content: [{ type: "text", text: `${toolName} succeeded` }],
        },
      })),
    ]
      .map((x) => JSON.stringify(x))
      .join("\n") + "\n";
  writeFileSync(file, body);
  try {
    const page = await readNativeHistory(root, binding);
    expect(page.kind).toBe("page");
    if (page.kind !== "page") return;
    expect(page.entries.map((entry) => entry.toolEvidence?.toolName)).toEqual(
      toolNames,
    );
    expect(page.entries.map((entry) => entry.toolEvidence?.effect)).toEqual(
      toolNames.map(() => "mutation"),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it("pages large files within a byte budget and rejects changed cursors, other Threads and unsupported versions", async () => {
  const root = mkdtempSync(join(tmpdir(), "d-pi-history-pages-"));
  const threadId = crypto.randomUUID();
  const directory = join(root, threadId);
  mkdirSync(directory);
  const file = join(directory, "session.jsonl");
  const binding = {
    threadId,
    configContextId: "fixture",
    sessionId: "session",
    sessionFile: file,
  };
  const header = { type: "session", version: 3, id: "session" };
  const body =
    JSON.stringify(header) +
    "\n" +
    Array.from({ length: 2000 }, (_, i) =>
      JSON.stringify({
        type: "message",
        id: String(i),
        parentId: i ? String(i - 1) : null,
        message: { role: "assistant", content: "x".repeat(1000) },
      }),
    ).join("\n") +
    "\n";
  writeFileSync(file, body);
  try {
    const first = await readNativeHistory(root, binding);
    if (first.kind !== "page" || !first.next)
      throw Error("Missing bounded history page");
    expect(first.entries.length).toBeGreaterThan(0);
    expect(first.entries.length).toBeLessThan(2000);
    expect(await readNativeHistory(root, binding, first.next)).toMatchObject({
      kind: "page",
      incompleteTail: false,
    });
    writeFileSync(file, body + "\n");
    expect(await readNativeHistory(root, binding, first.next)).toEqual({
      kind: "unavailable",
      reason: "changed",
    });
    expect(
      await readNativeHistory(root, {
        ...binding,
        threadId: crypto.randomUUID(),
      }),
    ).toEqual({ kind: "unavailable", reason: "denied" });
    writeFileSync(file, JSON.stringify({ ...header, version: 99 }) + "\n");
    expect(await readNativeHistory(root, binding)).toEqual({
      kind: "unavailable",
      reason: "unsupported",
    });
    expect(
      await readNativeHistory(root, binding, null, AbortSignal.abort()),
    ).toEqual({ kind: "unavailable", reason: "cancelled" });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
