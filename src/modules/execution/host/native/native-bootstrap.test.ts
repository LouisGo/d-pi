import { runInNewContext } from "node:vm";
import { expect, it, vi } from "vitest";
import { nativeBootstrap } from "./native-bootstrap";

function bootstrap() {
  const births = new Map([
    [20, "Fri Oct  2 09:00:00 2026"],
    [30, "Fri Oct  2 08:00:00 2026"],
  ]);
  const unavailable = new Set<number>();
  const read = (args: string[]) => {
    const pid = Number(args[1]);
    if (unavailable.has(pid)) throw Error("ps timed out");
    return births.get(pid) ?? "";
  };
  let tick: (() => unknown) | undefined;
  const kill = vi.fn();
  const output = vi.fn((_line: string, done?: () => void) => {
    done?.();
    return true;
  });
  const fakeProcess = {
    pid: 10,
    ppid: 20,
    env: {
      D_PI_PROCESS_SUPERVISION: JSON.stringify({
        mainPid: 30,
        mainBirth: "Fri Oct 2 08:00:00 2026",
        token: "token",
      }),
    },
    exit: vi.fn(),
    kill,
    stdout: { write: output },
    stdin: { once: vi.fn() },
  };
  runInNewContext(nativeBootstrap, {
    process: fakeProcess,
    require: (name: string) =>
      name === "node:child_process"
        ? {
            execFileSync: (_file: string, args: string[]) => read(args),
            execFile: (
              _file: string,
              args: string[],
              _options: unknown,
              done: (error: Error | null, stdout: string) => void,
            ) => {
              queueMicrotask(() => {
                try {
                  done(null, read(args));
                } catch {
                  done(Error("ps timed out"), "");
                }
              });
            },
          }
        : { pathToFileURL: vi.fn() },
    setInterval: (fn: () => unknown) => {
      tick = fn;
      return { unref() {} };
    },
    setTimeout: () => ({ unref() {} }),
    clearTimeout: vi.fn(),
  });
  return {
    births,
    unavailable,
    kill,
    output,
    fakeProcess,
    tick: async () => {
      await tick?.();
    },
  };
}

it.each([20, 30])(
  "does not kill a live session when the identity probe for owner %s times out",
  async (pid) => {
    const fixture = bootstrap();
    await fixture.tick();
    fixture.unavailable.add(pid);
    await fixture.tick();
    expect(fixture.kill.mock.calls.some(([target]) => target < 0)).toBe(false);
    fixture.unavailable.clear();
    await fixture.tick();
    expect(fixture.kill.mock.calls.some(([target]) => target < 0)).toBe(false);
  },
);

it.each([20, 30])(
  "still terminates the owned group when owner %s is verifiably replaced",
  async (pid) => {
    const fixture = bootstrap();
    await fixture.tick();
    fixture.births.set(pid, "Fri Oct 2 10:00:00 2026");
    await fixture.tick();
    expect(fixture.kill).toHaveBeenCalledWith(-10, "SIGKILL");
    expect(
      JSON.parse(fixture.output.mock.calls.at(-1)?.[0] ?? ""),
    ).toMatchObject({
      type: "d_pi_native_termination",
      reason: pid === 20 ? "watchdog-owner-changed" : "watchdog-main-changed",
      requestedExitCode: null,
    });
  },
);

it.each([20, 30])(
  "terminates after liveness independently confirms owner %s is missing even when ps is unavailable",
  async (pid) => {
    const fixture = bootstrap();
    await fixture.tick();
    fixture.unavailable.add(pid);
    fixture.kill.mockImplementation((target: number) => {
      if (target === pid) throw Object.assign(Error("gone"), { code: "ESRCH" });
    });
    await fixture.tick();
    expect(fixture.kill).toHaveBeenCalledWith(-10, "SIGKILL");
    expect(JSON.parse(fixture.output.mock.calls.at(-1)?.[0] ?? "").reason).toBe(
      pid === 20 ? "watchdog-owner-missing" : "watchdog-main-missing",
    );
  },
);

it("terminates after reparenting and preserves the SDK's requested exit code", async () => {
  const orphan = bootstrap();
  orphan.fakeProcess.ppid = 21;
  await orphan.tick();
  expect(JSON.parse(orphan.output.mock.calls.at(-1)?.[0] ?? "").reason).toBe(
    "watchdog-owner-changed",
  );
  const exited = bootstrap();
  exited.fakeProcess.exit(7);
  expect(JSON.parse(exited.output.mock.calls.at(-1)?.[0] ?? "")).toMatchObject({
    reason: "sdk-exit",
    requestedExitCode: 7,
  });
});
