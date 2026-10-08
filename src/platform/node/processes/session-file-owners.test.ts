import { spawn } from "node:child_process";
import {
  closeSync,
  mkdtempSync,
  openSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import {
  sessionExecutionOwners,
  sessionFileWriters,
} from "./session-file-owners";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
it("detects an idle OMP CLI in the same project even before it opens a session writer", async () => {
  const path = file();
  const directory = roots.at(-1)!;
  const binary = join(directory, "omp");
  symlinkSync(process.execPath, binary);
  const child = spawn(
    binary,
    ["-e", "console.log('ready');setInterval(()=>{},1000)"],
    { cwd: directory, stdio: ["ignore", "pipe", "ignore"] },
  );
  const exited = new Promise<void>((resolve) =>
    child.once("exit", () => resolve()),
  );
  try {
    await new Promise<void>((resolve, reject) => {
      child.once("error", reject);
      child.stdout.once("data", () => resolve());
    });
    expect(await sessionFileWriters(path)).toEqual([]);
    expect(await sessionExecutionOwners(path, directory)).toContain(child.pid);
    expect(await sessionExecutionOwners(path, tmpdir())).not.toContain(
      child.pid,
    );
  } finally {
    child.kill("SIGKILL");
    await exited;
  }
});
function file() {
  const root = mkdtempSync(join(tmpdir(), "d-pi-file-owners-"));
  roots.push(root);
  const file = join(root, "session with spaces.jsonl");
  writeFileSync(file, "{}\n");
  return file;
}
it("distinguishes an actual open native writer from readers and a closed historical file", async () => {
  const path = file();
  expect(await sessionFileWriters(path)).toEqual([]);
  const reader = openSync(path, "r");
  const writer = openSync(path, "a");
  try {
    expect(await sessionFileWriters(path)).toContain(process.pid);
    closeSync(writer);
    expect(await sessionFileWriters(path)).toEqual([]);
  } finally {
    closeSync(reader);
  }
});
