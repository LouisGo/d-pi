import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { type NativeObservation, NativeSession } from "./native-session";

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
      environment: process.env,
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

it("reports confirmed process close once after protocol disconnection and cannot send again", async () => {
  const dir = mkdtempSync(join(tmpdir(), "d-pi-native-protocol-"));
  const entry = join(dir, "fixture.cjs");
  writeFileSync(
    entry,
    `console.log(JSON.stringify({type:'ready'}));
require('node:readline').createInterface({input:process.stdin}).on('line',line=>{
 const c=JSON.parse(line);
 if(c.type==='break_protocol') process.stdout.write('not-json\\n');
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
      environment: process.env,
      sessionDirectory: join(dir, "sessions"),
    },
    (event) => events.push(event),
  );
  try {
    await session.start();
    await expect(session.request("break_protocol")).rejects.toThrow(
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
});
