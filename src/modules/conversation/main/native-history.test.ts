import { createHash } from "node:crypto";
import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { readNativeHistory, readNativeImage } from "./native-history";

it.each(["inline", "blob"])(
  "retains real times and lazy %s image references while leaving the native file untouched",
  async (format) => {
    const root = mkdtempSync(join(tmpdir(), "d-pi-history-media-"));
    const threadId = crypto.randomUUID();
    mkdirSync(join(root, threadId));
    const sessionFile = join(root, threadId, "session.jsonl");
    const binding = {
      threadId,
      configContextId: "fixture",
      sessionId: "session",
      sessionFile,
    };
    const timestamp = 1791500000000;
    const data =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jfX8AAAAASUVORK5CYII=";
    const digest = createHash("sha256")
      .update(Buffer.from(data, "base64"))
      .digest("hex");
    const blobs = join(root, "blobs");
    mkdirSync(blobs);
    writeFileSync(join(blobs, digest), Buffer.from(data, "base64"));
    const body =
      [
        { type: "session", version: 3, id: "session" },
        {
          type: "message",
          id: "image-user",
          parentId: null,
          timestamp: new Date(timestamp).toISOString(),
          message: {
            role: "user",
            timestamp,
            content: [
              { type: "text", text: "What is this?\n[image: shot.png]\n" },
              {
                type: "image",
                mimeType: "image/png",
                data: format === "blob" ? `blob:sha256:${digest}` : data,
              },
            ],
          },
        },
      ]
        .map((value) => JSON.stringify(value))
        .join("\n") + "\n";
    writeFileSync(sessionFile, body);
    try {
      const page = await readNativeHistory(root, binding);
      if (page.kind !== "page") throw Error("missing page");
      const entry = page.entries[0];
      expect(entry).toMatchObject({
        timestamp,
        displayText: "What is this?",
        images: [{ index: 0, mimeType: "image/png", name: "shot.png", digest }],
      });
      expect(JSON.stringify(page)).not.toContain(data);
      expect(entry?.mediaCursor).toBeDefined();
      const image = await readNativeImage(
        root,
        binding,
        entry!.mediaCursor!,
        entry!.id,
        0,
        undefined,
        blobs,
      );
      expect(image).toEqual({
        kind: "image",
        dataUrl: `data:image/png;base64,${data}`,
      });
      if (format === "blob") {
        expect(
          await readNativeImage(
            root,
            binding,
            entry!.mediaCursor!,
            entry!.id,
            0,
          ),
        ).toMatchObject({ kind: "unavailable" });
        writeFileSync(join(blobs, digest), Buffer.from("wrong bytes"));
        expect(
          await readNativeImage(
            root,
            binding,
            entry!.mediaCursor!,
            entry!.id,
            0,
            undefined,
            blobs,
          ),
        ).toMatchObject({ kind: "unavailable", reason: "changed" });
      }
      expect(
        await readNativeImage(root, binding, entry!.mediaCursor!, "wrong", 0),
      ).toMatchObject({ kind: "unavailable" });
      expect(readFileSync(sessionFile, "utf8")).toBe(body);
      renameSync(sessionFile, `${sessionFile}.old`);
      writeFileSync(sessionFile, body);
      expect(
        await readNativeImage(root, binding, entry!.mediaCursor!, entry!.id, 0),
      ).toMatchObject({ kind: "unavailable", reason: "changed" });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);

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
          content: [
            { type: "thinking", thinking: "reasoning" },
            { type: "text", text: "answer" },
          ],
          stopReason: "aborted",
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
        {
          id: "b",
          parentId: "a",
          role: "assistant",
          text: "answer",
          thinking: "reasoning",
          state: "aborted",
        },
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

it("projects bounded tool execution observations with real identity, arguments from verified ancestry, and excludes image data while keeping body intact", async () => {
  const root = mkdtempSync(join(tmpdir(), "d-pi-history-tool-obs-"));
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
      { type: "title", title: "Tool Observation Run" },
      { type: "session", version: 3, id: "session" },
      {
        type: "message",
        id: "user-1",
        parentId: null,
        message: { role: "user", content: "Please write file" },
      },
      {
        type: "message",
        id: "asst-1",
        parentId: "user-1",
        message: {
          role: "assistant",
          content: [
            { type: "text", text: "Writing..." },
            {
              type: "toolCall",
              id: "call-1",
              name: "write",
              arguments: { path: "out.txt", content: "data" },
            },
          ],
        },
      },
      {
        type: "custom",
        customType: "tool_execution_start",
        data: { toolCallId: "call-1", toolName: "write" },
        id: "start-1",
        parentId: "asst-1",
      },
      {
        type: "message",
        id: "tool-res-1",
        parentId: "start-1",
        message: {
          role: "toolResult",
          toolCallId: "call-1",
          toolName: "write",
          isError: false,
          content: [
            { type: "text", text: "Wrote out.txt successfully" },
            {
              type: "image",
              mimeType: "image/png",
              data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jfX8AAAAASUVORK5CYII=",
            },
          ],
          details: { path: "/tmp/out.txt", bytes: 4 },
        },
      },
    ]
      .map((x) => JSON.stringify(x))
      .join("\n") + "\n";
  writeFileSync(file, body);
  try {
    const page = await readNativeHistory(root, binding);
    expect(page.kind).toBe("page");
    if (page.kind !== "page") return;
    const entry = page.entries.find((e) => e.id === "tool-res-1");
    expect(entry).toBeDefined();
    expect(entry?.text).toBe("Wrote out.txt successfully");
    expect(entry?.toolEvidence).toMatchObject({
      toolCallId: "call-1",
      toolName: "write",
      isError: false,
      effect: "mutation",
      coverage: "text-parts-only",
    });
    expect(entry?.tool).toBeDefined();
    expect(entry?.tool).toEqual({
      toolCallId: "call-1",
      name: "write",
      lifecycle: "completed",
      observed: ["record"],
      coverage: "partial",
      truncated: true,
      arguments: {
        value: { path: "out.txt", content: "data" },
        truncated: false,
      },
      result: {
        value: {
          content: [
            { type: "text", text: "Wrote out.txt successfully" },
            { type: "image", mimeType: "image/png" },
          ],
          details: { path: "/tmp/out.txt", bytes: 4 },
        },
        truncated: true,
      },
    });
    expect(JSON.stringify(entry?.tool)).not.toContain("iVBORw0KGgoAAAANSUhEUg");
    expect(entry?.tool?.backgroundState).toBeUndefined();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it("marks lifecycle failed when isError is true, and marks coverage partial when ancestry is missing", async () => {
  const root = mkdtempSync(join(tmpdir(), "d-pi-history-tool-failed-"));
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
        id: "tool-fail-1",
        parentId: null,
        message: {
          role: "toolResult",
          toolCallId: "call-err",
          toolName: "shell",
          isError: true,
          content: [{ type: "text", text: "command failed" }],
          details: { exitCode: 1 },
        },
      },
    ]
      .map((x) => JSON.stringify(x))
      .join("\n") + "\n";
  writeFileSync(file, body);
  try {
    const page = await readNativeHistory(root, binding);
    expect(page.kind).toBe("page");
    if (page.kind !== "page") return;
    const entry = page.entries.find((e) => e.id === "tool-fail-1");
    expect(entry?.tool).toBeDefined();
    expect(entry?.tool).toMatchObject({
      toolCallId: "call-err",
      name: "shell",
      lifecycle: "failed",
      observed: ["record"],
      coverage: "partial",
      truncated: false,
      result: {
        value: {
          content: [{ type: "text", text: "command failed" }],
          details: { exitCode: 1 },
        },
        truncated: false,
      },
    });
    expect(entry?.tool?.arguments).toBeUndefined();
    expect(entry?.state).toBe("failed");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it("marks lifecycle unknown when isError is missing, and ignores records without tool identity", async () => {
  const root = mkdtempSync(join(tmpdir(), "d-pi-history-tool-unk-"));
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
        id: "tool-unk-1",
        parentId: null,
        message: {
          role: "toolResult",
          toolCallId: "call-unk",
          toolName: "custom",
          content: "done",
        },
      },
      {
        type: "message",
        id: "tool-noid-1",
        parentId: "tool-unk-1",
        message: {
          role: "toolResult",
          content: "no tool identity",
        },
      },
    ]
      .map((x) => JSON.stringify(x))
      .join("\n") + "\n";
  writeFileSync(file, body);
  try {
    const page = await readNativeHistory(root, binding);
    expect(page.kind).toBe("page");
    if (page.kind !== "page") return;
    const unkEntry = page.entries.find((e) => e.id === "tool-unk-1");
    expect(unkEntry?.tool).toBeDefined();
    expect(unkEntry?.tool).toMatchObject({
      toolCallId: "call-unk",
      name: "custom",
      lifecycle: "unknown",
      observed: ["record"],
      coverage: "partial",
    });
    const noIdEntry = page.entries.find((e) => e.id === "tool-noid-1");
    expect(noIdEntry?.tool).toBeUndefined();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it("recovers arguments by verified ancestry and does not pair by global toolCallId across turns", async () => {
  const root = mkdtempSync(join(tmpdir(), "d-pi-history-tool-ancestry-"));
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
        id: "turn1-asst",
        parentId: null,
        message: {
          role: "assistant",
          content: [
            {
              type: "toolCall",
              id: "reused-id",
              name: "read",
              arguments: { path: "turn1.txt" },
            },
          ],
        },
      },
      {
        type: "message",
        id: "turn1-res",
        parentId: "turn1-asst",
        message: {
          role: "toolResult",
          toolCallId: "reused-id",
          toolName: "read",
          isError: false,
          content: "turn 1 result",
        },
      },
      {
        type: "message",
        id: "turn2-asst",
        parentId: "turn1-res",
        message: {
          role: "assistant",
          content: [
            {
              type: "toolCall",
              id: "reused-id",
              name: "read",
              arguments: { path: "turn2.txt" },
            },
          ],
        },
      },
      {
        type: "message",
        id: "turn2-res",
        parentId: "turn2-asst",
        message: {
          role: "toolResult",
          toolCallId: "reused-id",
          toolName: "read",
          isError: false,
          content: "turn 2 result",
        },
      },
    ]
      .map((x) => JSON.stringify(x))
      .join("\n") + "\n";
  writeFileSync(file, body);
  try {
    const page = await readNativeHistory(root, binding);
    expect(page.kind).toBe("page");
    if (page.kind !== "page") return;
    const res1 = page.entries.find((e) => e.id === "turn1-res");
    const res2 = page.entries.find((e) => e.id === "turn2-res");
    expect(res1?.tool?.arguments?.value).toEqual({ path: "turn1.txt" });
    expect(res2?.tool?.arguments?.value).toEqual({ path: "turn2.txt" });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it("retains truthful partial coverage and available factual arguments/result for saved tool execution", async () => {
  const root = mkdtempSync(join(tmpdir(), "d-pi-history-tool-observed-"));
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
        id: "asst-plain",
        parentId: null,
        message: {
          role: "assistant",
          content: [
            {
              type: "toolCall",
              id: "call-plain",
              name: "read",
              arguments: { path: "hello.txt" },
            },
          ],
        },
      },
      {
        type: "message",
        id: "res-plain",
        parentId: "asst-plain",
        message: {
          role: "toolResult",
          toolCallId: "call-plain",
          toolName: "read",
          isError: false,
          content: [{ type: "text", text: "hello world" }],
        },
      },
    ]
      .map((x) => JSON.stringify(x))
      .join("\n") + "\n";
  writeFileSync(file, body);
  try {
    const page = await readNativeHistory(root, binding);
    expect(page.kind).toBe("page");
    if (page.kind !== "page") return;
    const entry = page.entries.find((e) => e.id === "res-plain");
    expect(entry?.tool).toEqual({
      toolCallId: "call-plain",
      name: "read",
      lifecycle: "completed",
      observed: ["record"],
      coverage: "partial",
      truncated: false,
      arguments: {
        value: { path: "hello.txt" },
        truncated: false,
      },
      result: {
        value: {
          content: [{ type: "text", text: "hello world" }],
        },
        truncated: false,
      },
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it("returns unavailable unsupported on malformed non-header JSON line within a page", async () => {
  const root = mkdtempSync(join(tmpdir(), "d-pi-history-malformed-"));
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
    JSON.stringify({ type: "session", version: 3, id: "session" }) +
    "\n" +
    "this is not valid json {{{{\n";
  writeFileSync(file, body);
  try {
    const page = await readNativeHistory(root, binding);
    expect(page).toEqual({
      kind: "unavailable",
      reason: "unsupported",
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it("omits tool DTO when toolCallId or toolName exceeds schema max limits, preserving readable entry body", async () => {
  const root = mkdtempSync(join(tmpdir(), "d-pi-history-oversized-id-"));
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
  const oversizedId = "x".repeat(513);
  const oversizedName = "n".repeat(121);
  const body =
    [
      { type: "session", version: 3, id: "session" },
      {
        type: "message",
        id: "res-oversized-id",
        parentId: null,
        message: {
          role: "toolResult",
          toolCallId: oversizedId,
          toolName: "read",
          isError: false,
          content: "readable text",
        },
      },
      {
        type: "message",
        id: "res-oversized-name",
        parentId: null,
        message: {
          role: "toolResult",
          toolCallId: "call-ok",
          toolName: oversizedName,
          isError: false,
          content: "other readable text",
        },
      },
    ]
      .map((x) => JSON.stringify(x))
      .join("\n") + "\n";
  writeFileSync(file, body);
  try {
    const page = await readNativeHistory(root, binding);
    expect(page.kind).toBe("page");
    if (page.kind !== "page") return;
    const entry1 = page.entries.find((e) => e.id === "res-oversized-id");
    expect(entry1).toBeDefined();
    expect(entry1?.text).toBe("readable text");
    expect(entry1?.tool).toBeUndefined();
    const entry2 = page.entries.find((e) => e.id === "res-oversized-name");
    expect(entry2).toBeDefined();
    expect(entry2?.text).toBe("other readable text");
    expect(entry2?.tool).toBeUndefined();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it("pages large files within a byte budget and rejects replaced cursors, other Threads and unsupported versions", async () => {
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
    writeFileSync(`${file}.replacement`, body + "\n");
    renameSync(`${file}.replacement`, file);
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

it("keeps a saved history snapshot readable while new messages append, and refresh sees the new tail", async () => {
  const root = mkdtempSync(join(tmpdir(), "d-pi-history-active-"));
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
  const records = [
    { type: "session", version: 3, id: "session" },
    ...Array.from({ length: 1100 }, (_, i) => ({
      type: "message",
      id: String(i),
      parentId: i ? String(i - 1) : null,
      message: { role: "assistant", content: "x".repeat(1000) },
    })),
  ];
  writeFileSync(file, records.map((x) => JSON.stringify(x)).join("\n") + "\n");
  try {
    const first = await readNativeHistory(root, binding);
    if (first.kind !== "page" || !first.next)
      throw Error("expected first snapshot page");
    appendFileSync(
      file,
      JSON.stringify({
        type: "message",
        id: "new-generation",
        parentId: "1099",
        message: { role: "assistant", content: "new output" },
      }) + "\n",
    );
    const second = await readNativeHistory(root, binding, first.next);
    expect(second.kind).toBe("page");
    if (second.kind !== "page") return;
    expect(second.source).toBe(first.source);
    expect(second.next).toBeNull();
    expect([...first.entries, ...second.entries]).toHaveLength(1100);
    expect(second.entries.some((e) => e.id === "new-generation")).toBe(false);
    const refreshed = await readNativeHistory(root, binding);
    expect(refreshed.kind).toBe("page");
    if (refreshed.kind !== "page" || !refreshed.next)
      throw Error("expected refreshed page");
    const tail = await readNativeHistory(root, binding, refreshed.next);
    expect(tail.kind === "page" && tail.entries.at(-1)?.text).toBe(
      "new output",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it("returns a message larger than the ordinary page budget as one complete body", async () => {
  const root = mkdtempSync(join(tmpdir(), "d-pi-history-large-body-"));
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
  const text = "连续正文\n".repeat(110_000);
  writeFileSync(
    file,
    [
      { type: "session", version: 3, id: "session" },
      {
        type: "message",
        id: "large",
        parentId: null,
        message: { role: "assistant", content: text },
      },
    ]
      .map((record) => JSON.stringify(record))
      .join("\n") + "\n",
  );
  try {
    let page = await readNativeHistory(root, binding);
    const entries = [];
    for (let count = 0; count < 3; count++) {
      if (page.kind !== "page") throw Error("expected complete history page");
      entries.push(...page.entries);
      if (!page.next) break;
      page = await readNativeHistory(root, binding, page.next);
    }
    expect(entries).toMatchObject([{ id: "large", text }]);
    expect(entries).toHaveLength(1);
    expect(page.kind === "page" && page.next).toBeNull();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it("reads saved CLI history when its recorded canonical worktree no longer exists", async () => {
  const root = mkdtempSync(join(tmpdir(), "d-pi-deleted-cwd-"));
  const file = join(root, "session.jsonl");
  const cwd = join(root, "deleted-worktree");
  writeFileSync(
    file,
    [
      { type: "session", version: 3, id: "native", cwd },
      {
        type: "message",
        id: "entry",
        parentId: null,
        message: { role: "user", content: "preserved" },
      },
    ]
      .map((row) => JSON.stringify(row))
      .join("\n") + "\n",
  );
  try {
    expect(
      await readNativeHistory(
        root,
        {
          threadId: crypto.randomUUID(),
          configContextId: "fixture",
          sessionId: "native",
          sessionFile: file,
        },
        null,
        undefined,
        cwd,
      ),
    ).toMatchObject({ kind: "page", entries: [{ text: "preserved" }] });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it("continues a short frozen prefix at its committed newline and retains old image authorization", async () => {
  const root = mkdtempSync(join(tmpdir(), "d-pi-history-continuation-"));
  const threadId = crypto.randomUUID();
  mkdirSync(join(root, threadId));
  const sessionFile = join(root, threadId, "session.jsonl");
  const binding = {
    threadId,
    sessionFile,
    sessionId: "session",
    configContextId: "fixture",
  };
  const data =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jfX8AAAAASUVORK5CYII=";
  const completed =
    [
      { type: "session", version: 3, id: "session" },
      {
        type: "message",
        id: "image",
        parentId: null,
        message: {
          role: "user",
          content: [{ type: "image", mimeType: "image/png", data }],
        },
      },
    ]
      .map((value) => JSON.stringify(value))
      .join("\n") + "\n";
  const tail = JSON.stringify({
    type: "message",
    id: "tail",
    parentId: "image",
    message: { role: "assistant", content: "completed later" },
  });
  writeFileSync(sessionFile, completed + tail.slice(0, 30));
  try {
    const first = await readNativeHistory(root, binding);
    if (
      first.kind !== "page" ||
      !first.continuation ||
      !first.entries[0]?.mediaCursor
    )
      throw Error("expected bound continuation and image");
    expect(first.incompleteTail).toBe(true);
    expect(first.continuation.offset).toBe(Buffer.byteLength(completed));
    const partial = await readNativeHistory(root, binding, {
      ...first.continuation,
      append: true,
    });
    expect(partial.kind === "page" && partial.entries).toEqual([]);
    appendFileSync(sessionFile, tail.slice(30) + "\n");
    const appended = await readNativeHistory(root, binding, {
      ...first.continuation,
      append: true,
    });
    expect(appended).toMatchObject({
      kind: "page",
      entries: [{ id: "tail", text: "completed later" }],
      next: null,
      incompleteTail: false,
    });
    expect(
      await readNativeImage(
        root,
        binding,
        first.entries[0].mediaCursor,
        "image",
        0,
      ),
    ).toMatchObject({ kind: "image" });
    writeFileSync(`${sessionFile}.replacement`, completed);
    renameSync(`${sessionFile}.replacement`, sessionFile);
    expect(
      await readNativeHistory(root, binding, {
        ...first.continuation,
        append: true,
      }),
    ).toEqual({ kind: "unavailable", reason: "changed" });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
