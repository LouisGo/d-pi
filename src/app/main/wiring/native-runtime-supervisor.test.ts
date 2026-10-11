import { expect, it, vi } from "vitest";
import type { NativeResidency } from "../../../modules/execution/contracts/public";
import {
  NativeRuntimeSupervisor,
  nativeWarmBudget,
} from "./native-runtime-supervisor";

it("bounds idle warm natives independently of selected and protected work, then expires remaining idle resources", async () => {
  let now = 0;
  let selected = "selected";
  const runtime = (initial: NativeResidency) => {
    let state = initial;
    return {
      nativeResidency: () => state,
      coolIfIdle: vi.fn(async (allow: () => boolean) => {
        if (!allow())
          return { kind: "retained" as const, reason: "selected" as const };
        state = { kind: "cold" };
        return { kind: "cooled" as const };
      }),
    };
  };
  const a = runtime({ kind: "warm" }),
    b = runtime({ kind: "warm" }),
    active = runtime({ kind: "protected", reason: "active-work" }),
    focused = runtime({ kind: "warm" });
  const registry = new Map([
    ["a", a],
    ["b", b],
    ["active", active],
    ["selected", focused],
  ]);
  const supervisor = new NativeRuntimeSupervisor(
    registry,
    () => selected,
    { maxWarm: 1, idleMs: 100 },
    () => now,
  );
  await supervisor.sweep();
  expect(a.coolIfIdle).toHaveBeenCalledOnce();
  expect(b.coolIfIdle).not.toHaveBeenCalled();
  expect(active.coolIfIdle).not.toHaveBeenCalled();
  expect(focused.coolIfIdle).not.toHaveBeenCalled();
  expect(supervisor.snapshot().protected).toBe(2);
  now = 100;
  await supervisor.sweep();
  expect(b.coolIfIdle).toHaveBeenCalledOnce();
  selected = "a";
  await supervisor.sweep();
  now = 150;
  await supervisor.sweep();
  expect(focused.coolIfIdle).not.toHaveBeenCalled();
  now = 200;
  await supervisor.sweep();
  expect(focused.coolIfIdle).toHaveBeenCalledOnce();
  supervisor.close();
});

it("rejects a cooldown if selection or registry identity changes while its native probe waits, without duplicating attempts", async () => {
  let selected: string | null = null;
  let allow: (() => boolean) | undefined;
  let finish: (() => void) | undefined;
  const runtime = {
    nativeResidency: () => ({ kind: "warm" as const }),
    coolIfIdle: vi.fn(async (check: () => boolean) => {
      allow = check;
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      return { kind: "retained" as const, reason: "reading-demand" as const };
    }),
  };
  const registry = new Map([["a", runtime]]);
  const supervisor = new NativeRuntimeSupervisor(registry, () => selected, {
    maxWarm: 0,
    idleMs: 100,
  });
  const pending = supervisor.sweep();
  expect(allow?.()).toBe(true);
  selected = "a";
  expect(allow?.()).toBe(false);
  selected = null;
  registry.delete("a");
  expect(allow?.()).toBe(false);
  registry.set("a", runtime);
  await supervisor.sweep();
  expect(runtime.coolIfIdle).toHaveBeenCalledOnce();
  finish?.();
  await pending;
  expect(supervisor.snapshot().items[0]?.retained).toBe("reading-demand");
  supervisor.close();
});

it("uses bounded engineering overrides and falls back for invalid native warm budgets", () => {
  expect(nativeWarmBudget({})).toEqual({ maxWarm: 2, idleMs: 60_000 });
  expect(
    nativeWarmBudget({
      D_PI_NATIVE_WARM_LIMIT: "0",
      D_PI_NATIVE_IDLE_MS: "1000",
    }),
  ).toEqual({ maxWarm: 0, idleMs: 1000 });
  expect(
    nativeWarmBudget({
      D_PI_NATIVE_WARM_LIMIT: "99999",
      D_PI_NATIVE_IDLE_MS: "Infinity",
    }),
  ).toEqual({ maxWarm: 2, idleMs: 60_000 });
});

it("keeps at most two physical cooldown attempts and cancels maintenance permits on close", async () => {
  const finish: (() => void)[] = [];
  const allows: (() => boolean)[] = [];
  const registry = new Map(
    Array.from({ length: 10 }, (_, index) => [
      String(index),
      {
        nativeResidency: () => ({ kind: "warm" as const }),
        coolIfIdle: vi.fn(async (allow: () => boolean) => {
          allows.push(allow);
          await new Promise<void>((resolve) => finish.push(resolve));
          return { kind: "retained" as const, reason: "permission" as const };
        }),
      },
    ]),
  );
  const supervisor = new NativeRuntimeSupervisor(registry, () => null, {
    maxWarm: 0,
    idleMs: 1000,
  });
  const pending = supervisor.sweep();
  expect(allows).toHaveLength(2);
  await supervisor.sweep();
  expect(allows).toHaveLength(2);
  supervisor.close();
  expect(allows.every((allow) => !allow())).toBe(true);
  for (const complete of finish) complete();
  await pending;
  await supervisor.sweep();
  expect(allows).toHaveLength(2);
});

it("starts one idle maintenance timer and releases it on close", async () => {
  vi.useFakeTimers();
  let residency: NativeResidency = { kind: "warm" };
  const runtime = {
    nativeResidency: () => residency,
    coolIfIdle: vi.fn(async () => {
      residency = { kind: "cold" };
      return { kind: "cooled" as const };
    }),
  };
  const supervisor = new NativeRuntimeSupervisor(
    new Map([["a", runtime]]),
    () => null,
    { maxWarm: 1, idleMs: 1000 },
  );
  try {
    supervisor.start();
    supervisor.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(runtime.coolIfIdle).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(runtime.coolIfIdle).toHaveBeenCalledOnce();
    supervisor.close();
    residency = { kind: "warm" };
    await vi.advanceTimersByTimeAsync(5000);
    expect(runtime.coolIfIdle).toHaveBeenCalledOnce();
  } finally {
    supervisor.close();
    vi.useRealTimers();
  }
});

it("holds timed-out cooldown slots until the same physical runtime is confirmed cold", async () => {
  const states: NativeResidency[] = Array.from({ length: 4 }, () => ({
    kind: "warm",
  }));
  const runtimes = states.map((_, index) => ({
    nativeResidency: () => states[index] ?? { kind: "cold" as const },
    coolIfIdle: vi.fn(async () => {
      states[index] = { kind: "protected", reason: "unconfirmed" };
      return { kind: "retained" as const, reason: "unconfirmed" as const };
    }),
  }));
  const supervisor = new NativeRuntimeSupervisor(
    new Map(runtimes.map((runtime, index) => [String(index), runtime])),
    () => null,
    { maxWarm: 0, idleMs: 1000 },
  );
  await supervisor.sweep();
  expect(supervisor.snapshot().cooldownSlots).toBe(2);
  await supervisor.sweep();
  expect(runtimes[2]?.coolIfIdle).not.toHaveBeenCalled();
  expect(runtimes[3]?.coolIfIdle).not.toHaveBeenCalled();
  states[0] = { kind: "cold" };
  await supervisor.sweep();
  expect(runtimes[2]?.coolIfIdle).toHaveBeenCalledOnce();
  expect(runtimes[3]?.coolIfIdle).not.toHaveBeenCalled();
  expect(supervisor.snapshot().cooldownSlots).toBe(2);
  supervisor.close();
});
