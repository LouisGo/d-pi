import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { readNativeHistory, readNativeTool } from "./native-history";

it("reads a verified 10MiB artifact independently of the preview, preserves partial captures and rejects unsafe replacements", async () => {
  const root = mkdtempSync(join(tmpdir(), "d-pi-native-artifact-"));
  const threadId = crypto.randomUUID();
  mkdirSync(join(root, threadId));
  const sessionFile = join(root, threadId, "session.jsonl");
  const binding = {
    threadId,
    configContextId: "fixture",
    sessionId: "session",
    sessionFile,
  };
  const directory = sessionFile.slice(0, -6);
  mkdirSync(directory);
  const path = join(directory, "0.bash.log");
  const text = "0123456789".repeat(1024 * 1024);
  writeFileSync(path, text);
  const writeRecord = (elidedBytes = 0, error = false) =>
    writeFileSync(
      sessionFile,
      [
        { type: "session", version: 3, id: "session" },
        {
          type: "message",
          id: "call",
          parentId: null,
          message: {
            role: "assistant",
            content: [
              {
                type: "toolCall",
                id: "tool",
                name: "bash",
                arguments: { command: "output" },
              },
            ],
          },
        },
        {
          type: "message",
          id: "result",
          parentId: "call",
          message: {
            role: "toolResult",
            toolCallId: "tool",
            toolName: "bash",
            isError: false,
            content: [{ type: "text", text: "preview" }],
            details: {
              meta: {
                truncation: {
                  artifactId: "0",
                  totalBytes: text.length,
                  artifactElidedBytes: elidedBytes,
                },
                ...(error ? { artifactError: { kind: "write" } } : {}),
              },
            },
          },
        },
      ]
        .map(JSON.stringify)
        .join("\n") + "\n",
    );
  const read = async (key = "0") => {
    const page = await readNativeHistory(root, binding);
    if (page.kind !== "page") throw Error("missing fixture page");
    const record = page.entries.find((entry) => entry.id === "result");
    if (!record?.toolCursor) throw Error("missing native cursor");
    const source = {
      kind: "native-record" as const,
      threadId,
      nativeSessionKey: "session",
      recordId: "result",
      revision: page.source,
    };
    const preview = await readNativeTool(
      root,
      binding,
      source,
      record.toolCursor,
      "result",
      crypto.randomUUID(),
    );
    const full = await readNativeTool(
      root,
      binding,
      source,
      record.toolCursor,
      "result",
      crypto.randomUUID(),
      undefined,
      key,
    );
    return { preview, full, cursor: record.toolCursor };
  };
  try {
    writeRecord();
    const { preview, full, cursor } = await read();
    expect(preview).toMatchObject({
      kind: "tool-detail",
      detail: { text: "preview", coverage: "partial", artifact: { key: "0" } },
    });
    if (full.kind !== "tool-detail")
      throw Error(`missing full artifact: ${full.reason}`);
    expect(full.detail.text.length).toBe(10 * 1024 * 1024);
    expect(full.detail.text).toBe(text);
    expect(full.detail).toMatchObject({
      coverage: "observed",
      truncated: false,
      source: {
        kind: "native-artifact",
        artifactKey: "0",
        recordId: "result",
        revision: createHash("sha256").update(text).digest("hex"),
      },
    });
    expect((await read("1")).full).toMatchObject({
      kind: "tool-unavailable",
      reason: "missing",
    });
    writeFileSync(path, text.replace(/^0/, "1"));
    expect(
      await readNativeTool(
        root,
        binding,
        full.detail.source,
        cursor,
        "result",
        crypto.randomUUID(),
        undefined,
        "0",
      ),
    ).toMatchObject({ kind: "tool-unavailable", reason: "identity-changed" });
    writeFileSync(path, text);
    writeRecord(1000);
    expect((await read()).full).toMatchObject({
      kind: "tool-detail",
      detail: { coverage: "partial", truncated: true },
    });
    writeRecord(0, true);
    expect((await read()).full).toMatchObject({
      kind: "tool-unavailable",
      reason: "missing",
    });
    writeRecord();
    writeFileSync(path, "shortened externally");
    expect((await read()).full).toMatchObject({
      kind: "tool-detail",
      detail: { coverage: "partial", truncated: true },
    });
    rmSync(path);
    const foreign = join(root, "foreign.log");
    writeFileSync(foreign, text);
    symlinkSync(foreign, path);
    expect((await read()).full).toMatchObject({
      kind: "tool-unavailable",
      reason: "identity-changed",
    });
    rmSync(path);
    writeFileSync(path, text);
    writeFileSync(join(directory, "0.other.log"), text);
    expect((await read()).full).toMatchObject({
      kind: "tool-unavailable",
      reason: "identity-changed",
    });
    rmSync(join(directory, "0.other.log"));
    writeFileSync(path, "x".repeat(17 * 1024 * 1024));
    expect((await read()).full).toMatchObject({
      kind: "tool-unavailable",
      reason: "limit",
    });
    const moved = join(root, "moved-artifacts");
    renameSync(directory, moved);
    symlinkSync(moved, directory);
    expect((await read()).full).toMatchObject({
      kind: "tool-unavailable",
      reason: "identity-changed",
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
