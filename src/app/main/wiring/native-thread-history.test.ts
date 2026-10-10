import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";

const exec = promisify(execFile);
const root = resolve(import.meta.dirname, "../../../..");
const binary = join(root, "resources/sdk/bun");
const entry = join(root, "runtime/thread-history.mjs");
it("forks the official native branch without changing its source, deletes only the fork and rejects changed identity", async () => {
  const directory = await mkdtemp(join(tmpdir(), "d-pi-native-history-"));
  try {
    const { stdout } = await exec(
      binary,
      [
        "--eval",
        `
      import { SessionManager } from ${JSON.stringify(join(root, "node_modules/@oh-my-pi/pi-coding-agent/src/session/session-manager.ts"))};
      const m=SessionManager.create(${JSON.stringify(directory)},${JSON.stringify(directory)});
      m.appendMessage({role:'user',content:'Native branch fixture',timestamp:Date.now()});
      await m.ensureOnDisk();
      const data={file:m.getSessionFile(),sessionId:m.getSessionId()}; await m.close();
      console.log(JSON.stringify(data));
    `,
      ],
      { timeout: 10000 },
    );
    const source: { file: string; sessionId: string } = JSON.parse(stdout);
    const original = await readFile(source.file, "utf8");
    await mkdir(source.file.slice(0, -6));
    await writeFile(
      join(source.file.slice(0, -6), "fixture.txt"),
      "Artifact retained",
    );
    const run = (
      kind: string,
      file: string,
      sessionId: string,
      retry = false,
    ) =>
      new Promise<string>((done, fail) => {
        const child = execFile(
          binary,
          [entry],
          {
            env: {
              ...process.env,
              D_PI_THREAD_HISTORY: JSON.stringify({
                kind,
                root: directory,
                directory,
                file,
                sessionId,
                destination: directory,
                retry,
              }),
            },
            timeout: 10000,
          },
          (error, result) => (error ? fail(error) : done(result)),
        );
        child.stdin?.end("permit\n");
      });
    await expect(run("delete", source.file, "wrong-id")).rejects.toThrow();
    expect(await readFile(source.file, "utf8")).toBe(original);
    const fork: { kind: string; file: string; sessionId: string } = JSON.parse(
      await run("fork", source.file, source.sessionId),
    );
    expect(fork.kind).toBe("forked");
    expect(fork.sessionId).not.toBe(source.sessionId);
    const content = await readFile(fork.file, "utf8");
    expect(
      await readFile(join(fork.file.slice(0, -6), "fixture.txt"), "utf8"),
    ).toBe("Artifact retained");
    expect(content).toContain("Native branch fixture");
    expect(content).toContain(source.file);
    expect(await readFile(source.file, "utf8")).toBe(original);
    await run("delete", fork.file, fork.sessionId);
    await expect(readFile(fork.file)).rejects.toThrow();
    await expect(run("delete", fork.file, fork.sessionId)).rejects.toThrow();
    expect(
      JSON.parse(await run("delete", fork.file, fork.sessionId, true)),
    ).toEqual({ kind: "deleted" });
    expect(await readFile(source.file, "utf8")).toBe(original);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 30000);
