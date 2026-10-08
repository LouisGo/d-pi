import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import {
  listProjectNativeHistory,
  readProjectNativeHistory,
} from "./project-history";

it("discovers CLI history for the selected project without adopting it or reading another project's history", async () => {
  const root = mkdtempSync(join(tmpdir(), "d-pi-cli-history-"));
  const threadId = crypto.randomUUID();
  const project = join(root, "project");
  const sessions = join(root, "sessions");
  mkdirSync(project);
  mkdirSync(join(sessions, "bucket"), { recursive: true });
  const sessionId = crypto.randomUUID();
  const contents = `${JSON.stringify({ type: "title", title: "CLI session" })}\n${JSON.stringify({ type: "session", version: 3, id: sessionId, cwd: project })}\n${JSON.stringify({ type: "message", id: "first", parentId: null, message: { role: "user", content: [{ type: "text", text: "hello" }] } })}\n`;
  const file = join(sessions, "bucket", "cli.jsonl");
  writeFileSync(file, contents);
  writeFileSync(
    join(sessions, "bucket", "foreign.jsonl"),
    contents.replace(project, "/foreign"),
  );
  symlinkSync(file, join(sessions, "bucket", "alias.jsonl"));
  try {
    const catalog = await listProjectNativeHistory(sessions, project);
    expect(catalog.kind).toBe("catalog");
    if (catalog.kind !== "catalog") throw Error("missing catalog");
    expect(catalog.sessions).toHaveLength(1);
    const session = catalog.sessions[0];
    if (!session) throw Error("missing session");
    expect(session.title).toBe("CLI session");
    expect(
      await readProjectNativeHistory(
        sessions,
        project,
        threadId,
        session.key,
        null,
      ),
    ).toMatchObject({
      kind: "page",
      entries: [{ role: "user", text: "hello" }],
    });
    expect(
      await readProjectNativeHistory(
        sessions,
        "/foreign",
        threadId,
        session.key,
        null,
      ),
    ).toMatchObject({ kind: "unavailable" });
    expect(readFileSync(file, "utf8")).toBe(contents);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it("keeps the manual project picker bounded at 200 while the App index uses continuation", async () => {
  const root = mkdtempSync(join(tmpdir(), "d-pi-cli-picker-cap-"));
  const project = join(root, "project");
  const sessions = join(root, "sessions");
  mkdirSync(project);
  mkdirSync(join(sessions, "bucket"), { recursive: true });
  try {
    for (let n = 0; n < 201; n++)
      writeFileSync(
        join(sessions, "bucket", `${n}.jsonl`),
        `${JSON.stringify({ type: "session", version: 3, id: `id-${n}`, cwd: project })}\n`,
      );
    const catalog = await listProjectNativeHistory(sessions, project);
    expect(catalog).toMatchObject({ kind: "catalog", partial: true });
    if (catalog.kind !== "catalog") throw Error("missing catalog");
    expect(catalog.sessions).toHaveLength(200);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
