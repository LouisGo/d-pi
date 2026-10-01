import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { type NativeObservation, NativeSession } from "./native-session";

it("does not load an executable SDK entry before registration is allowed", async () => {
  const dir = mkdtempSync(join(tmpdir(), "d-pi-native-register-"));
  const entry = join(dir, "entry.cjs");
  const marker = join(dir, "executed");
  writeFileSync(
    entry,
    `require('node:fs').writeFileSync(${JSON.stringify(marker)},'loaded');`,
  );
  let observed: (() => void) | undefined;
  const registering = new Promise<void>((resolve) => {
    observed = resolve;
  });
  let decide: ((allowed: boolean) => void) | undefined;
  const permission = new Promise<boolean>((resolve) => {
    decide = resolve;
  });
  const session = new NativeSession(
    {
      binary: process.execPath,
      entry,
      directory: dir,
      environment: { PATH: process.env.PATH },
      sessionDirectory: dir,
      register: async () => {
        observed?.();
        return permission;
      },
    },
    () => {},
  );
  const starting = session.start();
  const rejected = expect(starting).rejects.toThrow(
    "Native startup interrupted",
  );
  try {
    await registering;
    expect(existsSync(marker)).toBe(false);
    decide?.(false);
    await rejected;
    expect(existsSync(marker)).toBe(false);
  } finally {
    decide?.(false);
    await session.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

it("confirms group shutdown including an inherited tool heartbeat after its native parent exits", async () => {
  const dir = mkdtempSync(join(tmpdir(), "d-pi-native-group-"));
  const heartbeat = join(dir, "heartbeat");
  const tool = join(dir, "tool.cjs");
  const entry = join(dir, "native.cjs");
  writeFileSync(
    tool,
    `require('node:fs').writeFileSync(${JSON.stringify(heartbeat)},String(process.pid));setInterval(()=>require('node:fs').appendFileSync(${JSON.stringify(heartbeat)},'.'),30);`,
  );
  writeFileSync(
    entry,
    `require('node:child_process').spawn(process.execPath,[${JSON.stringify(tool)}],{stdio:'ignore'});console.log(JSON.stringify({type:'ready'}));require('node:readline').createInterface({input:process.stdin}).on('line',line=>{const c=JSON.parse(line);console.log(JSON.stringify({type:'response',id:c.id,command:c.type,success:true}));}).on('close',()=>process.exit(0));`,
  );
  const session = new NativeSession(
    {
      binary: process.execPath,
      entry,
      directory: dir,
      environment: { PATH: process.env.PATH },
      sessionDirectory: dir,
    },
    () => {},
  );
  let pid: number | undefined;
  try {
    await session.start();
    for (let index = 0; index < 100 && !existsSync(heartbeat); index++)
      await new Promise((resolve) => setTimeout(resolve, 10));
    pid = Number.parseInt(readFileSync(heartbeat, "utf8"), 10);
    await session.close();
    const afterClose = readFileSync(heartbeat, "utf8");
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(readFileSync(heartbeat, "utf8")).toBe(afterClose);
  } finally {
    if (pid) {
      try {
        process.kill(pid, "SIGKILL");
      } catch {}
    }
    await session.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

it("negotiates v2, correlates commands and drains process output through EOF", async () => {
  const dir = mkdtempSync(join(tmpdir(), "d-pi-native-"));
  const binary = join(dir, "fake-omp");
  writeFileSync(
    binary,
    `#!/usr/bin/env node
console.log(JSON.stringify({type:'ready',supportedProtocolVersions:[1,2]}));
require('node:readline').createInterface({input:process.stdin}).on('line',line=>{const c=JSON.parse(line);console.log(JSON.stringify({type:'response',id:c.id,command:c.type,success:true,data:c.type==='get_state'?{isStreaming:false,sessionId:'session'}:{protocolVersion:2}}));}).on('close',()=>process.exit(0));
`,
    { mode: 0o755 },
  );
  const events: NativeObservation[] = [];
  const session = new NativeSession(
    {
      binary,
      directory: dir,
      environment: {
        PATH: process.env.PATH,
        HOME: dir,
        TMPDIR: dir,
        PI_CODING_AGENT_DIR: join(dir, "config"),
        PI_CONFIG_DIR: ".isolated-config",
      },
      sessionDirectory: join(dir, "sessions"),
    },
    (e) => events.push(e),
  );
  try {
    await session.start();
    expect(await session.request("get_state")).toMatchObject({
      success: true,
      data: { sessionId: "session" },
    });
    await session.close();
    expect(events).toContainEqual({ kind: "disconnected", reason: "exit" });
    expect(events.filter((event) => event.kind === "exited")).toEqual([
      { kind: "exited" },
    ]);
  } finally {
    await session.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

it.each(["break_protocol", "bad_response"])(
  "reports confirmed process close once after %s and cannot send again",
  async (command) => {
    const dir = mkdtempSync(join(tmpdir(), "d-pi-native-protocol-"));
    const entry = join(dir, "fixture.cjs");
    writeFileSync(
      entry,
      `console.log(JSON.stringify({type:'ready'}));
require('node:readline').createInterface({input:process.stdin}).on('line',line=>{
 const c=JSON.parse(line);
 if(c.type==='break_protocol') process.stdout.write('not-json\\n');
 else if(c.type==='bad_response') { console.log(JSON.stringify({type:'response',id:c.id,command:c.type,success:'true'})); setTimeout(()=>process.exit(0),40); }
 else console.log(JSON.stringify({type:'response',id:c.id,command:c.type,success:true}));
}).on('close',()=>process.exit(0));
`,
    );
    const events: NativeObservation[] = [];
    const session = new NativeSession(
      {
        binary: process.execPath,
        entry,
        directory: dir,
        environment: {
          PATH: process.env.PATH,
          HOME: dir,
          TMPDIR: dir,
          PI_CODING_AGENT_DIR: join(dir, "config"),
          PI_CONFIG_DIR: ".isolated-config",
        },
        sessionDirectory: join(dir, "sessions"),
      },
      (event) => events.push(event),
    );
    try {
      await session.start();
      await expect(session.request(command)).rejects.toThrow(
        "Native connection interrupted",
      );
      await session.close();
      await session.close();
      expect(events.filter((event) => event.kind !== "frame")).toEqual([
        { kind: "disconnected", reason: "protocol" },
        { kind: "exited" },
      ]);
      await expect(session.request("get_state")).rejects.toThrow(
        "Native connection unavailable",
      );
    } finally {
      await session.close();
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

it("ends in-flight waits when close begins, while still waiting for process exit", async () => {
  const dir = mkdtempSync(join(tmpdir(), "d-pi-native-close-waits-"));
  const entry = join(dir, "fixture.cjs");
  writeFileSync(
    entry,
    `console.log(JSON.stringify({type:'ready'}));
require('node:readline').createInterface({input:process.stdin}).on('line',line=>{
 const c=JSON.parse(line);
 if(c.type==='negotiate_protocol') console.log(JSON.stringify({type:'response',id:c.id,command:c.type,success:true}));
}).on('close',()=>setTimeout(()=>process.exit(0),500));`,
  );
  const events: NativeObservation[] = [];
  const session = new NativeSession(
    {
      binary: process.execPath,
      entry,
      directory: dir,
      environment: { PATH: process.env.PATH },
      sessionDirectory: dir,
    },
    (event) => events.push(event),
  );
  try {
    await session.start();
    let settled = false;
    const waiting = session.request("get_state").catch((error: unknown) => {
      settled = true;
      return error;
    });
    const closing = session.close();
    expect(session.close()).toBe(closing);
    expect(() => session.write("{}\n")).toThrow("Native connection closed");
    await expect(session.request("get_state")).rejects.toThrow(
      "Native connection unavailable",
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(settled).toBe(true);
    expect(events.some((event) => event.kind === "exited")).toBe(false);
    expect(await waiting).toMatchObject({
      message: "Native connection interrupted",
    });
    await closing;
    expect(events.filter((event) => event.kind === "exited")).toHaveLength(1);
  } finally {
    await session.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

it("releases the request budget on timeout and never resends commands when late replies arrive", async () => {
  const dir = mkdtempSync(join(tmpdir(), "d-pi-native-timeout-"));
  const entry = join(dir, "fixture.cjs");
  writeFileSync(
    entry,
    `console.log(JSON.stringify({type:'ready'}));
const waiting=[];
const respond=(c,data={})=>console.log(JSON.stringify({type:'response',id:c.id,command:c.type,success:true,data}));
require('node:readline').createInterface({input:process.stdin}).on('line',line=>{
 const c=JSON.parse(line);
 if(c.type==='hold') waiting.push(c);
 else if(c.type==='flush') { for(const old of waiting) respond(old); respond(c,{seen:waiting.length}); }
 else respond(c);
}).on('close',()=>process.exit(0));`,
  );
  const session = new NativeSession(
    {
      binary: process.execPath,
      entry,
      directory: dir,
      environment: { PATH: process.env.PATH },
      sessionDirectory: dir,
    },
    () => {},
  );
  try {
    await session.start();
    await expect(
      session.request("hold", { message: "x".repeat(1048576) }),
    ).rejects.toThrow("Native input budget exceeded");
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const requests = Array.from({ length: 64 }, () =>
      session.request("hold").catch((error: unknown) => error),
    );
    await expect(session.request("hold")).rejects.toThrow(
      "Native connection unavailable",
    );
    await vi.advanceTimersByTimeAsync(30000);
    for (const result of await Promise.all(requests))
      expect(result).toMatchObject({ message: "Native command timed out" });
    vi.useRealTimers();
    expect(await session.request("flush")).toMatchObject({
      data: { seen: 64 },
    });
    expect(await session.request("get_state")).toMatchObject({ success: true });
  } finally {
    vi.useRealTimers();
    await session.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

it("closes the native process when ready times out", async () => {
  const dir = mkdtempSync(join(tmpdir(), "d-pi-native-ready-timeout-"));
  const entry = join(dir, "fixture.cjs");
  writeFileSync(
    entry,
    `console.log(JSON.stringify({type:'fixture_loaded'}));require('node:readline').createInterface({input:process.stdin}).on('close',()=>process.exit(0));`,
  );
  const events: NativeObservation[] = [];
  let loaded: (() => void) | undefined;
  const loading = new Promise<void>((resolve) => {
    loaded = resolve;
  });
  const session = new NativeSession(
    {
      binary: process.execPath,
      entry,
      directory: dir,
      environment: { PATH: process.env.PATH },
      sessionDirectory: dir,
    },
    (event) => {
      events.push(event);
      if (event.kind === "frame" && event.frame.type === "fixture_loaded")
        loaded?.();
    },
  );
  try {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const starting = expect(session.start()).rejects.toThrow(
      "Native startup timed out",
    );
    await loading;
    await vi.advanceTimersByTimeAsync(30000);
    vi.useRealTimers();
    await starting;
    await session.close();
    expect(events.filter((event) => event.kind === "exited")).toEqual([
      { kind: "exited" },
    ]);
    await expect(session.request("get_state")).rejects.toThrow(
      "Native connection unavailable",
    );
  } finally {
    vi.useRealTimers();
    await session.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
