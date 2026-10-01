import { execFile } from "node:child_process";
import { afterEach, expect, it, vi } from "vitest";
import { type ProcessIdentity, terminateManagedGroup } from "./managed-process";

vi.mock("node:child_process", async () => {
  const { promisify } = await import("node:util");
  const exec = vi.fn();
  Reflect.set(
    exec,
    promisify.custom,
    (...args: unknown[]) =>
      new Promise((resolve, reject) => {
        exec(...args, (error: Error | null, stdout: string) =>
          error ? reject(error) : resolve({ stdout }),
        );
      }),
  );
  return { execFile: exec };
});
afterEach(() => vi.restoreAllMocks());
const identity: ProcessIdentity = {
  pid: 12345,
  parentPid: 12344,
  groupId: 12345,
  birth: "Thu Oct 1 10:00:00 2026",
  executable: "/fixture/bun",
};

it("refuses to kill a live group leader whose birth identity cannot be verified", async () => {
  vi.mocked(execFile).mockImplementation(((
    _file: string,
    args: string[],
    _options: unknown,
    callback: (error: Error | null, stdout: string) => void,
  ) => {
    if (args.includes("-p")) callback(Error("identity unavailable"), "");
    else callback(null, "12345 12345 S\n12346 12345 S\n");
    return {};
  }) as typeof execFile);
  const kill = vi.spyOn(process, "kill").mockReturnValue(true);
  expect(await terminateManagedGroup(identity)).toBe(false);
  expect(kill).not.toHaveBeenCalled();
});

it("refuses a reused PID with a different recorded birth before group termination", async () => {
  vi.mocked(execFile).mockImplementation(((
    _file: string,
    _args: string[],
    _options: unknown,
    callback: (error: Error | null, stdout: string) => void,
  ) => {
    callback(null, "12345 12344 12345 Thu Oct 1 11:00:00 2026 /fixture/bun\n");
    return {};
  }) as typeof execFile);
  const kill = vi.spyOn(process, "kill").mockReturnValue(true);
  expect(await terminateManagedGroup(identity)).toBe(false);
  expect(kill).not.toHaveBeenCalled();
});
