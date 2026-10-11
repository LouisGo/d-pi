import { randomUUID } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { runNativeSubagentWorker } from "./subagent-read";

const hooks = vi.hoisted(() => ({
  beforeOpen: undefined as ((path: unknown) => Promise<void>) | undefined,
}));
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    open: async (...args: Parameters<typeof actual.open>) => {
      await hooks.beforeOpen?.(args[0]);
      return actual.open(...args);
    },
  };
});
const header = (id: string, parentSession?: string) =>
  JSON.stringify({ type: "session", id, parentSession });
const message = (content: unknown) =>
  JSON.stringify({ type: "message", message: { role: "assistant", content } });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "d-pi-child-read-"));
  const parentSessionFile = join(root, "parent.jsonl");
  const dir = join(root, "parent");
  await mkdir(dir);
  await writeFile(parentSessionFile, `${header("parent-id")}\n`);
  const task = {
    operationId: randomUUID(),
    traceId: randomUUID(),
    parentSessionFile,
    parentSessionId: "parent-id",
    owner: {
      id: "child",
      parentToolCallId: "call",
      sessionFile: join(dir, "child.jsonl"),
    },
  };
  return {
    task,
    root,
    close: () => rm(root, { recursive: true, force: true }),
  };
}
it.each([
  {
    arguments: { data: { answer: 42 }, error: null },
    expected: '{"answer":42}',
  },
  { arguments: { data: null, error: "exact error" }, expected: "exact error" },
])(
  "reads complete native child records with yield semantics and real parent identity",
  async ({ arguments: args, expected }) => {
    const f = await fixture();
    try {
      await writeFile(
        f.task.owner.sessionFile,
        `${header("child-id", f.task.parentSessionFile)}\n${message([
          { type: "text", text: "finished" },
          { type: "toolCall", name: "yield", arguments: args },
        ])}\n${message([{ type: "text", text: "incomplete" }])}`,
      );
      expect(await runNativeSubagentWorker(f.task)).toMatchObject({
        operationId: f.task.operationId,
        traceId: f.task.traceId,
        status: "available",
        text: expected,
        childSessionId: "child-id",
        truncated: true,
      });
    } finally {
      await f.close();
    }
  },
);
it.each(["foreign-parent", "foreign-path", "symlink", "parent-id"])(
  "rejects %s instead of attributing another transcript",
  async (kind) => {
    const f = await fixture();
    try {
      const body = `${header("child-id", kind === "foreign-parent" ? "/foreign.jsonl" : f.task.parentSessionFile)}\n${message([{ type: "text", text: "secret" }])}\n`;
      await writeFile(f.task.owner.sessionFile, body);
      if (kind === "foreign-path") {
        f.task.owner.sessionFile = join(f.root, "other.jsonl");
        await writeFile(f.task.owner.sessionFile, body);
      }
      if (kind === "symlink") {
        await rm(f.task.owner.sessionFile);
        const target = join(f.root, "other.jsonl");
        await writeFile(target, body);
        await symlink(target, f.task.owner.sessionFile);
      }
      if (kind === "parent-id") f.task.parentSessionId = "wrong-id";
      expect(await runNativeSubagentWorker(f.task)).toMatchObject({
        status: "unavailable",
        reason: "transcript-unavailable",
      });
    } finally {
      await f.close();
    }
  },
);
it("bounds source bytes and UTF-8 output before crossing the worker boundary", async () => {
  const f = await fixture();
  try {
    await writeFile(
      f.task.owner.sessionFile,
      `${header("child-id", f.task.parentSessionFile)}\n${message([{ type: "text", text: "中".repeat(30000) }])}\n`,
    );
    const result = await runNativeSubagentWorker(f.task);
    expect(result.status).toBe("available");
    if (result.status === "available") {
      expect(Buffer.byteLength(result.text)).toBeLessThanOrEqual(65536);
      expect(result.text).not.toContain("�");
      expect(result.truncated).toBe(true);
    }
    await writeFile(f.task.owner.sessionFile, "x".repeat(1048577));
    expect(await runNativeSubagentWorker(f.task)).toMatchObject({
      status: "unavailable",
      reason: "transcript-too-large",
    });
  } finally {
    await f.close();
  }
});

it("rejects an artifact directory replaced after canonical validation but before opening its child", async () => {
  const f = await fixture();
  try {
    const dir = join(f.root, "parent"),
      foreign = join(f.root, "foreign");
    await mkdir(foreign);
    const body = (text: string) =>
      `${header("child-id", f.task.parentSessionFile)}\n${message([{ type: "text", text }])}\n`;
    await writeFile(f.task.owner.sessionFile, body("owned"));
    await writeFile(
      join(foreign, "child.jsonl"),
      body("FOREIGN_DIRECTORY_RESULT"),
    );
    const canonicalParent = await realpath(f.task.parentSessionFile);
    let replaced = false;
    hooks.beforeOpen = async (path) => {
      if (path !== canonicalParent) return;
      hooks.beforeOpen = undefined;
      await rename(dir, join(f.root, "previous"));
      await symlink(foreign, dir);
      replaced = true;
    };
    const result = await runNativeSubagentWorker(f.task);
    expect(replaced).toBe(true);
    expect(result).toMatchObject({
      status: "unavailable",
      reason: "transcript-unavailable",
    });
  } finally {
    hooks.beforeOpen = undefined;
    await f.close();
  }
});
