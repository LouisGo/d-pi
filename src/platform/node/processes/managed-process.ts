import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
export type ProcessIdentity = {
  pid: number;
  parentPid: number;
  groupId: number;
  birth: string;
  executable: string;
};

export async function readProcessIdentity(
  pid: number,
): Promise<ProcessIdentity | null> {
  if (!Number.isSafeInteger(pid) || pid <= 1) return null;
  try {
    const { stdout } = await exec(
      "/bin/ps",
      ["-p", String(pid), "-o", "pid=,ppid=,pgid=,lstart=,comm="],
      { timeout: 2000 },
    );
    const parts = stdout.trim().split(/\s+/);
    if (parts.length < 9) return null;
    return {
      pid: Number(parts[0]),
      parentPid: Number(parts[1]),
      groupId: Number(parts[2]),
      birth: parts.slice(3, 8).join(" "),
      executable: parts.slice(8).join(" "),
    };
  } catch {
    return null;
  }
}

async function liveGroup(pid: number): Promise<number[]> {
  const { stdout } = await exec("/bin/ps", ["-axo", "pid=,pgid=,stat="], {
    timeout: 2000,
  });
  return stdout.split("\n").flatMap((line) => {
    const parts = line.trim().split(/\s+/);
    return Number(parts[1]) === pid && !parts[2]?.startsWith("Z")
      ? [Number(parts[0])]
      : [];
  });
}

/** Only an owned detached group; a reused live leader invalidates the record. */
export async function terminateManagedGroup(
  identity: ProcessIdentity,
): Promise<boolean> {
  if (identity.pid !== identity.groupId || identity.pid <= 1) return false;
  try {
    const current = await readProcessIdentity(identity.pid);
    if (
      current &&
      (current.birth !== identity.birth ||
        current.groupId !== identity.groupId ||
        current.executable !== identity.executable)
    )
      return false;
    const members = await liveGroup(identity.groupId);
    if (!members.length) return true;
    // Absence of an identity alone does not prove the leader exited: ps may fail.
    if (!current && members.includes(identity.pid)) return false;
    process.kill(-identity.groupId, "SIGKILL");
    for (let index = 0; index < 40; index++) {
      if (!(await liveGroup(identity.groupId)).length) return true;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ESRCH")
      return true;
  }
  return false;
}
