import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";

const exec = promisify(execFile);
const FailureSchema = z.object({
  code: z.literal(1),
  stdout: z.string(),
  stderr: z.string(),
});

async function lsof(arguments_: string[]): Promise<string> {
  try {
    const result = await exec("/usr/sbin/lsof", ["-n", "-P", ...arguments_], {
      timeout: 3000,
      maxBuffer: 256 * 1024,
    });
    if (result.stderr.trim()) throw Error("Session owner probe unavailable");
    return result.stdout;
  } catch (error) {
    const empty = FailureSchema.safeParse(error);
    if (empty.success && !empty.data.stdout.trim() && !empty.data.stderr.trim())
      return "";
    throw Error("Session owner probe unavailable");
  }
}

/** macOS open-file snapshot. Readers do not occupy execution; probe errors are unknown. */
export async function sessionFileWriters(path: string): Promise<number[]> {
  const output = await lsof(["-F", "pfa", "--", path]);
  const writers = new Set<number>();
  let pid: number | undefined;
  for (const field of output.split("\n")) {
    if (field.startsWith("p")) {
      pid = Number(field.slice(1));
      if (!Number.isSafeInteger(pid) || pid <= 1)
        throw Error("Invalid session owner");
    } else if (field === "aw" || field === "au") {
      if (!pid) throw Error("Invalid session owner");
      writers.add(pid);
    }
  }
  return [...writers];
}

/** An idle CLI can retain the session in memory without an open writer FD.
 * Without a cooperating CLI protocol its project-local session cannot be
 * distinguished reliably, so treat a live OMP in this cwd as occupied too.
 */
export async function sessionExecutionOwners(
  path: string,
  directory: string,
): Promise<number[]> {
  const [writers, cwd] = await Promise.all([
    sessionFileWriters(path),
    lsof(["-a", "-d", "cwd", "-F", "p", "--", directory]),
  ]);
  const owners = new Set(writers);
  const pids = cwd
    .split("\n")
    .filter((field) => field.startsWith("p"))
    .map((field) => Number(field.slice(1)));
  if (pids.some((pid) => !Number.isSafeInteger(pid) || pid <= 1))
    throw Error("Invalid session owner");
  if (!pids.length) return [...owners];
  const { stdout } = await exec(
    "/bin/ps",
    ["-p", pids.join(","), "-o", "pid=,comm=,args="],
    { timeout: 3000, maxBuffer: 256 * 1024 },
  );
  for (const row of stdout.split("\n")) {
    const parsed = /^\s*(\d+)\s+(.+)$/.exec(row);
    if (!parsed) continue;
    // Command text stays local: it may contain user arguments or credentials.
    const command = parsed[2] ?? "";
    if (
      /(?:^|[\/\s])omp(?:\s|$)/.test(command) ||
      (command.includes("@oh-my-pi/pi-coding-agent") &&
        /cli\.[cm]?[jt]s(?:\s|$)/.test(command))
    )
      owners.add(Number(parsed[1]));
  }
  return [...owners];
}
