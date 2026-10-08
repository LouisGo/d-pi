import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, expect, it, vi } from "vitest";
import { readProcessIdentity } from "../../../../platform/node/processes/public";
import { SessionExecutionLease } from "./session-execution-lease";

const roots: string[] = [];
const root = () => {
  const path = mkdtempSync(join(tmpdir(), "d-pi-session-lease-"));
  roots.push(path);
  return path;
};
const main = {
  pid: 10,
  parentPid: 2,
  groupId: 2,
  birth: "main",
  executable: "/main",
};
const native = {
  pid: 20,
  parentPid: 3,
  groupId: 20,
  birth: "native",
  executable: "/bun",
};
function stale(directory: string) {
  const db = new DatabaseSync(join(directory, ".d-pi-execution.sqlite"));
  db.prepare("INSERT OR REPLACE INTO owner VALUES(1,?,?)").run(
    JSON.stringify(main),
    JSON.stringify(native),
  );
  db.close();
}
const dependencies = () => ({
  identify: vi.fn(async () => null),
  exists: vi.fn(() => false),
  terminate: vi.fn(async () => true),
});
afterEach(() => {
  for (const path of roots.splice(0))
    rmSync(path, { recursive: true, force: true });
});

it("owns execution across independent App connections until confirmed native shutdown", async () => {
  const directory = root();
  const lease = await SessionExecutionLease.acquire(
    directory,
    main,
    dependencies(),
  );
  lease.register(native);
  await expect(
    SessionExecutionLease.acquire(directory, main, dependencies()),
  ).rejects.toThrow("occupied");
  lease.release(false);
  await expect(
    SessionExecutionLease.acquire(directory, main, dependencies()),
  ).rejects.toThrow("occupied");
  lease.release(true);
  const next = await SessionExecutionLease.acquire(
    directory,
    main,
    dependencies(),
  );
  next.release(true);
});

it("cleans only the registered orphan group before publishing a new owner", async () => {
  const directory = root();
  const lease = await SessionExecutionLease.acquire(
    directory,
    main,
    dependencies(),
  );
  lease.register(native);
  // Model OS release on process exit without marking the native group dead.
  lease.release(true);
  stale(directory);
  const deps = dependencies();
  const next = await SessionExecutionLease.acquire(
    directory,
    { ...main, birth: "next" },
    deps,
  );
  expect(deps.terminate).toHaveBeenCalledWith(native);
  next.release(true);
});

it.each(["live", "unknown", "unconfirmed"])(
  "fails closed for %s ownership without replacing the native record",
  async (reason) => {
    const directory = root();
    const lease = await SessionExecutionLease.acquire(
      directory,
      main,
      dependencies(),
    );
    lease.register(native);
    lease.release(true);
    stale(directory);
    const deps = dependencies();
    if (reason === "live") deps.identify.mockResolvedValue(main as never);
    if (reason === "unknown") deps.exists.mockReturnValue(true);
    if (reason === "unconfirmed") deps.terminate.mockResolvedValue(false);
    await expect(
      SessionExecutionLease.acquire(
        directory,
        { ...main, birth: "next" },
        deps,
      ),
    ).rejects.toThrow();
    const db = new DatabaseSync(join(directory, ".d-pi-execution.sqlite"));
    expect(
      JSON.parse(
        String(db.prepare("SELECT native FROM owner WHERE id=1").get()?.native),
      ),
    ).toEqual(native);
    db.close();
  },
);

it("an actual crashed App releases the kernel lease but leaves registered cleanup evidence", async () => {
  const directory = root();
  const file = join(directory, ".d-pi-execution.sqlite");
  const seed = await SessionExecutionLease.acquire(
    directory,
    main,
    dependencies(),
  );
  seed.register(native);
  seed.release(true);
  stale(directory);
  const child = spawn(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import {DatabaseSync} from 'node:sqlite'; const db=new DatabaseSync(${JSON.stringify(file)}); db.exec('PRAGMA locking_mode=EXCLUSIVE; BEGIN EXCLUSIVE; COMMIT'); console.log('locked'); setInterval(()=>{},1000);`,
    ],
    { stdio: ["ignore", "pipe", "ignore"] },
  );
  await new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.stdout.once("data", () => resolve());
  });
  await expect(
    SessionExecutionLease.acquire(directory, main, dependencies()),
  ).rejects.toThrow("occupied");
  child.kill("SIGKILL");
  await new Promise<void>((resolve) => child.once("exit", () => resolve()));
  const deps = dependencies();
  const recovered = await SessionExecutionLease.acquire(
    directory,
    { ...main, birth: "new" },
    deps,
  );
  expect(deps.terminate).toHaveBeenCalledOnce();
  recovered.release(true);
});

it("verifies and terminates an actual registered orphan process group before recovery", async () => {
  const directory = root();
  const seed = await SessionExecutionLease.acquire(
    directory,
    main,
    dependencies(),
  );
  seed.release(true);
  const child = spawn(
    process.execPath,
    ["-e", "console.log('ready');setInterval(()=>{},1000)"],
    { detached: true, stdio: ["ignore", "pipe", "ignore"] },
  );
  const exited = new Promise<void>((resolve) =>
    child.once("exit", () => resolve()),
  );
  try {
    await new Promise<void>((resolve, reject) => {
      child.once("error", reject);
      child.stdout.once("data", () => resolve());
    });
    const identity = await readProcessIdentity(child.pid ?? 0);
    if (!identity) throw Error("child identity unavailable");
    const db = new DatabaseSync(join(directory, ".d-pi-execution.sqlite"));
    db.prepare("INSERT OR REPLACE INTO owner VALUES(1,?,?)").run(
      JSON.stringify({ ...main, pid: 2000000000 }),
      JSON.stringify(identity),
    );
    db.close();
    const current = await readProcessIdentity(process.pid);
    if (!current) throw Error("Main identity unavailable");
    const resumed = await SessionExecutionLease.acquire(directory, current);
    await exited;
    expect(await readProcessIdentity(identity.pid)).toBeNull();
    expect(resumed.release(true)).toBe(true);
  } finally {
    child.kill("SIGKILL");
  }
});
