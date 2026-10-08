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
import { readProcessIdentity } from "../../../../platform/node/processes/public";
import { NativeRequestFailure } from "./native-request-failure";
import { type NativeObservation, NativeSession } from "./native-session";

it("keeps native spawn failure distinct from local interruption and refuses reads before startup", async () => {
  const dir = mkdtempSync(join(tmpdir(), "d-pi-native-spawn-failure-"));
  const session = new NativeSession(
    {
      binary: join(dir, "missing-native"),
      directory: dir,
      environment: {},
      sessionDirectory: dir,
    },
    () => {},
  );
  try {
    await expect(session.request("get_state")).rejects.toMatchObject({
      failure: { kind: "unavailable", operation: "get_state" },
    });
    await expect(session.start()).rejects.toMatchObject({
      failure: { kind: "spawn", operation: "startup" },
    });
  } finally {
    await session.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

it("keeps an application observation defect unknown instead of attributing it to the native protocol", async () => {
  const dir = mkdtempSync(join(tmpdir(), "d-pi-native-observation-defect-"));
  const entry = join(dir, "fixture.cjs");
  writeFileSync(
    entry,
    `console.log(JSON.stringify({type:'ready'}));require('node:readline').createInterface({input:process.stdin}).on('line',line=>{const c=JSON.parse(line);console.log(JSON.stringify(c.type==='get_state'?{type:'observer_trigger'}:{type:'response',id:c.id,command:c.type,success:true}));}).on('close',()=>process.exit(0));`,
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
    (event) => {
      if (event.kind === "frame" && event.frame.type === "observer_trigger")
        throw Error("API_KEY=secret");
      events.push(event);
    },
  );
  try {
    await session.start();
    const failure: unknown = await session
      .request("get_state")
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(Error);
    expect(failure).not.toBeInstanceOf(NativeRequestFailure);
    expect(events).toContainEqual({ kind: "disconnected", reason: "unknown" });
    expect(JSON.stringify(events)).not.toContain("API_KEY");
  } finally {
    await session.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

it("keeps two registered sessions queryable through repeated owner probe timeouts", async () => {
  const dir = mkdtempSync(join(tmpdir(), "d-pi-native-live-owner-"));
  const entry = join(dir, "fixture.cjs");
  const preload = join(dir, "probe.cjs");
  const binary = join(dir, "node-with-probe");
  const probeFault = join(dir, "probe-fault");
  writeFileSync(
    binary,
    '#!/bin/sh\nexec "$D_PI_TEST_NODE" --require "$D_PI_TEST_PRELOAD" "$@"\n',
    { mode: 0o755 },
  );
  writeFileSync(
    preload,
    `const cp=require('node:child_process');const fs=require('node:fs');
const exec=cp.execFile;const sync=cp.execFileSync;
const failed=()=>fs.existsSync(process.env.D_PI_TEST_PROBE_FAULT);
cp.execFile=(file,args,options,done)=>{
 if(file==='/bin/ps'&&failed()){setTimeout(()=>done(Error('controlled ps timeout'),''),5);return;}
 return exec(file,args,options,done);
};
cp.execFileSync=(...args)=>{if(args[0]==='/bin/ps'&&failed())throw Error('controlled ps timeout');return sync(...args);};`,
  );
  writeFileSync(
    entry,
    `console.log(JSON.stringify({type:'ready'}));
require('node:readline').createInterface({input:process.stdin}).on('line',line=>{
 const c=JSON.parse(line);console.log(JSON.stringify({type:'response',id:c.id,command:c.type,success:true}));
}).on('close',()=>process.exit(0));`,
  );
  const main = await readProcessIdentity(process.pid);
  if (!main) throw Error("Main identity unavailable");
  const observations: NativeObservation[][] = [[], []];
  const sessions = observations.map(
    (events) =>
      new NativeSession(
        {
          binary,
          entry,
          directory: dir,
          environment: {
            PATH: process.env.PATH,
            D_PI_TEST_NODE: process.execPath,
            D_PI_TEST_PRELOAD: preload,
            D_PI_TEST_PROBE_FAULT: probeFault,
          },
          sessionDirectory: dir,
          supervision: {
            mainPid: process.pid,
            mainBirth: main.birth,
            token: crypto.randomUUID(),
          },
        },
        (event) => events.push(event),
      ),
  );
  try {
    await Promise.all(sessions.map((session) => session.start()));
    writeFileSync(
      probeFault,
      "fail owner probes while both processes are alive",
    );
    await new Promise((resolve) => setTimeout(resolve, 1600));
    for (const session of sessions)
      expect(await session.request("get_state")).toMatchObject({
        success: true,
      });
    for (const events of observations)
      expect(events.filter((event) => event.kind !== "frame")).toEqual([]);
  } finally {
    await Promise.all(sessions.map((session) => session.close()));
    rmSync(dir, { recursive: true, force: true });
  }
});

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
    expect(events).toContainEqual({
      kind: "disconnected",
      reason: "exit",
      failure: { kind: "unavailable", operation: "unknown" },
    });
    expect(events.filter((event) => event.kind === "exited")).toEqual([
      {
        kind: "exited",
        evidence: {
          process: "native",
          pid: expect.any(Number),
          exitCode: 0,
          signal: null,
          reason: null,
          requestedExitCode: null,
        },
      },
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
      await expect(session.request(command)).rejects.toMatchObject({
        failure: {
          kind: "protocol",
          operation: "unknown",
          requestId: expect.any(String),
        },
      });
      await session.close();
      await session.close();
      expect(events.filter((event) => event.kind !== "frame")).toEqual([
        {
          kind: "disconnected",
          reason: "protocol",
          failure: { kind: "protocol", operation: "unknown" },
        },
        {
          kind: "exited",
          evidence: {
            process: "native",
            pid: expect.any(Number),
            exitCode: null,
            signal: "SIGKILL",
            reason: command === "break_protocol" ? null : "sdk-exit",
            requestedExitCode: command === "break_protocol" ? null : 0,
          },
        },
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

it.each(["finish", "signal"])(
  "preserves %s exit evidence without attributing external signals to the watchdog",
  async (command) => {
    const dir = mkdtempSync(join(tmpdir(), "d-pi-native-exit-evidence-"));
    const entry = join(dir, "fixture.cjs");
    writeFileSync(
      entry,
      `console.log(JSON.stringify({type:'ready'}));
require('node:readline').createInterface({input:process.stdin}).on('line',line=>{
 const c=JSON.parse(line);
 if(c.type==='finish')process.exit(7);
 else if(c.type==='signal')process.kill(process.pid,'SIGTERM');
 else console.log(JSON.stringify({type:'response',id:c.id,command:c.type,success:true}));
}).on('close',()=>process.exit(0));`,
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
      await expect(session.request(command)).rejects.toThrow(
        "Native connection interrupted",
      );
      await session.close();
      expect(events.filter((event) => event.kind === "exited")).toEqual([
        {
          kind: "exited",
          evidence: {
            process: "native",
            pid: expect.any(Number),
            exitCode: null,
            signal: command === "finish" ? "SIGKILL" : "SIGTERM",
            reason: command === "finish" ? "sdk-exit" : null,
            requestedExitCode: command === "finish" ? 7 : null,
          },
        },
      ]);
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
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const encodingFailure: unknown = await session
      .request("get_state", circular)
      .catch((error: unknown) => error);
    expect(encodingFailure).toBeInstanceOf(Error);
    expect(encodingFailure).not.toBeInstanceOf(NativeRequestFailure);
    await expect(
      session.request("hold", { message: "x".repeat(1048576) }),
    ).rejects.toMatchObject({
      failure: {
        kind: "write",
        operation: "unknown",
        budget: "input-budget",
        requestId: expect.any(String),
      },
    });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const requests = Array.from({ length: 64 }, () =>
      session.request("hold").catch((error: unknown) => error),
    );
    await expect(session.request("hold")).rejects.toMatchObject({
      failure: {
        kind: "unavailable",
        operation: "unknown",
        budget: "request-limit",
      },
    });
    await vi.advanceTimersByTimeAsync(30000);
    for (const result of await Promise.all(requests))
      expect(result).toMatchObject({
        message: "Native command timed out",
        failure: {
          kind: "timeout",
          operation: "unknown",
          timeoutMs: 30000,
          requestId: expect.any(String),
        },
      });
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

it("cancels only the local wait, releases its slot and never writes abort or resends a late reply", async () => {
  const dir = mkdtempSync(join(tmpdir(), "d-pi-native-abort-"));
  const entry = join(dir, "fixture.cjs");
  writeFileSync(
    entry,
    `console.log(JSON.stringify({type:'ready'}));
const held=[];const commands=[];
require('node:readline').createInterface({input:process.stdin}).on('line',line=>{
 const c=JSON.parse(line);commands.push(c.type);
 const reply=(c,data)=>console.log(JSON.stringify({type:'response',id:c.id,command:c.type,success:true,data}));
 if(c.type==='get_state')held.push(c);
 else if(c.type==='inspect')reply(c,commands);
 else if(c.type==='flush'){for(const pending of held.splice(0))reply(pending);reply(c);}
 else reply(c);
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
    const controller = new AbortController();
    const cancelled = session.request(
      "get_state",
      {},
      { signal: controller.signal },
    );
    const rejection = expect(cancelled).rejects.toMatchObject({
      failure: {
        kind: "interrupted",
        operation: "get_state",
        requestId: expect.any(String),
      },
    });
    const remaining = Array.from({ length: 63 }, () =>
      session.request("get_state").catch((error: unknown) => error),
    );
    controller.abort();
    await rejection;
    const inspection = await session.request("inspect");
    expect(inspection.data).toEqual([
      "negotiate_protocol",
      ...Array.from({ length: 64 }, () => "get_state"),
      "inspect",
    ]);
    await session.request("flush");
    for (const response of await Promise.all(remaining))
      expect(response).toMatchObject({ success: true });
    expect((await session.request("inspect")).data).not.toContain("abort");
  } finally {
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
    const starting = expect(session.start()).rejects.toMatchObject({
      failure: { kind: "timeout", operation: "startup", timeoutMs: 30000 },
    });
    await loading;
    await vi.advanceTimersByTimeAsync(30000);
    vi.useRealTimers();
    await starting;
    await session.close();
    expect(events.filter((event) => event.kind === "exited")).toEqual([
      {
        kind: "exited",
        evidence: {
          process: "native",
          pid: expect.any(Number),
          exitCode: null,
          signal: "SIGKILL",
          reason: "sdk-exit",
          requestedExitCode: 0,
        },
      },
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

it("writes a compact image resource request into an isolated reader without encoding the image", async () => {
  const dir = mkdtempSync(join(tmpdir(), "dpi-image-pipe-"));
  const entry = join(dir, "fixture.cjs");
  writeFileSync(
    entry,
    `console.log(JSON.stringify({type:'ready'}));require('node:readline').createInterface({input:process.stdin}).on('line',line=>{const c=JSON.parse(line);console.log(JSON.stringify({type:'response',id:c.id,command:c.type,success:true,data:{bytes:c.images?.[0]?.resource.byteLength??0}}));}).on('close',()=>process.exit(0));`,
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
    const resource = { digest: "a".repeat(64), byteLength: 908202 };
    const reply = await session.request("prompt", {
      message: "解释这张图片",
      images: [{ type: "image", mimeType: "image/png", resource }],
    });
    expect(reply).toMatchObject({
      success: true,
      data: { bytes: resource.byteLength },
    });
  } finally {
    await session.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
