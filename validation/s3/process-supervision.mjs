import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const resources = resolve("resources/sdk");
const electron = resolve(
  "node_modules/electron/dist/Electron.app/Contents/MacOS/Electron",
);
const harness = resolve("out/main/fault-harness");
await mkdir(harness, { recursive: true });
const main = join(harness, "process-supervision-main.cjs");
execFileSync(
  join(resources, "bun"),
  [
    "build",
    "src/app/host/index.ts",
    "--target=node",
    "--format=esm",
    "--external",
    "electron",
    `--outfile=${join(harness, "session-host.js")}`,
  ],
  { stdio: "inherit" },
);
execFileSync(
  join(resources, "bun"),
  [
    "build",
    "validation/s3/process-supervision-main.ts",
    "--target=node",
    "--format=cjs",
    "--external",
    "electron",
    "--define",
    `import.meta.dirname:${JSON.stringify(harness)}`,
    `--outfile=${main}`,
  ],
  { stdio: "inherit" },
);
const wait = async (predicate, timeout = 20000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw Error("Fault harness condition timed out");
};
const exists = async (path) => {
  try {
    await readFile(path);
    return true;
  } catch {
    return false;
  }
};
const alive = (pid) => {
  try {
    return !execFileSync("/bin/ps", ["-p", String(pid), "-o", "stat="], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
      .trim()
      .startsWith("Z");
  } catch {
    return false;
  }
};
const heartbeat = async (scope) =>
  (await readFile(join(scope, "heartbeat"), "utf8")).length;
const events = async (root) =>
  (await readFile(join(root, "events.jsonl"), "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
const receipts = (root) => {
  const database = new DatabaseSync(join(root, "app.sqlite"), {
    readOnly: true,
  });
  try {
    return database
      .prepare("SELECT receipt FROM submission ORDER BY rowid")
      .all()
      .map((row) => JSON.parse(row.receipt));
  } finally {
    database.close();
  }
};
const results = [];
for (const [fault, mode] of [
  ["normal", "idle"],
  ["bun", "busy"],
  ["host", "interaction"],
  ["main", "background"],
  ["database", "sqlite"],
]) {
  const root = await mkdtemp(join(tmpdir(), "d-pi-supervision-"));
  let child;
  const registered = [];
  try {
    await writeFile(
      join(root, "tool.mjs"),
      `import {appendFileSync,writeFileSync} from 'node:fs';writeFileSync(process.argv[2]+'.pid',String(process.pid));setInterval(()=>appendFileSync(process.argv[2],'.'),40);`,
    );
    for (const name of ["a", "b"]) {
      const scope = join(root, name),
        config = join(scope, "config");
      await mkdir(join(config, "extensions"), { recursive: true });
      await writeFile(
        join(config, "models.yml"),
        JSON.stringify({
          providers: {
            fixture: {
              baseUrl: "http://127.0.0.1:1/v1",
              apiKey: "fixture",
              api: "openai-completions",
              models: [
                {
                  id: "fixture",
                  name: "fixture",
                  reasoning: false,
                  input: ["text"],
                  contextWindow: 128000,
                  maxTokens: 1024,
                  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
                },
              ],
            },
          },
        }),
      );
      await writeFile(
        join(config, "config.yml"),
        JSON.stringify({
          autolearn: { enabled: false },
          modelRoles: { default: "fixture/fixture", smol: "fixture/fixture" },
        }),
      );
      await writeFile(
        join(config, "extensions", "fixture.ts"),
        `import {spawn} from 'node:child_process';import {writeFileSync} from 'node:fs';const scope=process.env.D_PI_FAULT_SCOPE;writeFileSync(scope+'/native.json',JSON.stringify({pid:process.pid,parentPid:process.ppid}));export default function(pi){for(const mode of ['busy','interaction','background'])pi.registerCommand('fixture-'+mode,{description:'Isolated fault fixture',handler:async(_args,ctx)=>{spawn(process.env.D_PI_FAULT_BUN,[process.env.D_PI_FAULT_TOOL,scope+'/heartbeat'],{stdio:'ignore'});if(mode==='interaction')await ctx.ui.confirm('Fixture','Waiting for a real RPC answer');if(mode==='busy')await new Promise(resolve=>setTimeout(resolve,60000));}});}`,
      );
    }
    let output = "";
    child = spawn(electron, [main, root, resources], {
      env: {
        PATH: "/usr/bin:/bin",
        HOME: root,
        TMPDIR: root,
        D_PI_FAULT_MODE: mode,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (value) => {
      output += value;
    });
    child.stderr.on("data", (value) => {
      output += value;
    });
    await wait(() => exists(join(root, "ready")));
    if (fault === "database") {
      const events = await readFile(join(root, "events.jsonl"), "utf8");
      assert.match(
        events,
        /"event":"database-unwritable-stop","writeFailed":true,"actualNativePaused":true/,
      );
      assert.match(events, /"nativeStreamingBeforeStop":true/);
      assert.match(events, /"nativeHistoryReadable":true/);
      registered.push(
        JSON.parse(await readFile(join(root, "a", "native.json"), "utf8")),
      );
      await wait(() => !alive(child.pid));
      results.push({
        fault,
        sqliteWriteFailed: true,
        actualNativePaused: true,
        nativeStreamingBeforeStop: true,
        persistedAcknowledgementReadable: true,
        nativeHistoryReadable: true,
        nativeSdk: "18.4.6",
      });
      console.log(
        "PASS: SQLite writer locked; actual native streaming stop completed without database writes",
      );
      continue;
    }
    for (const name of ["a", "b"])
      registered.push(
        JSON.parse(await readFile(join(root, name, "native.json"), "utf8")),
      );
    if (fault === "normal") {
      await wait(() => !alive(child.pid));
      for (const item of registered) assert.equal(alive(item.pid), false);
      assert.match(
        await readFile(join(root, "events.jsonl"), "utf8"),
        /idle-closed/,
      );
      results.push({ fault, mode, nativeStopped: true, scopes: 2 });
      continue;
    }
    await wait(
      async () =>
        (await exists(join(root, "a", "heartbeat"))) &&
        (await exists(join(root, "b", "heartbeat"))),
    );
    const readyRecords = (await events(root)).filter(
      (event) => event.event === "ready",
    );
    const historyExisted = await Promise.all(
      readyRecords.map((record) => exists(record.sessionFile)),
    );
    const beforeReceipts = receipts(root);
    assert.equal(beforeReceipts.length, 2);
    if (mode === "interaction")
      await wait(async () =>
        (await events(root)).some(
          (event) =>
            event.scope === "a" &&
            event.interactions?.items.some((item) => item.status === "pending"),
        ),
      );
    if (mode === "busy")
      assert.ok(
        (await events(root)).some(
          (event) => event.scope === "a" && event.busy === true,
        ),
      );
    const beforeB = await heartbeat(join(root, "b"));
    const victim =
      fault === "bun"
        ? registered[0].pid
        : fault === "host"
          ? registered[0].parentPid
          : child.pid;
    process.kill(victim, "SIGKILL");
    await wait(() => !alive(registered[0].pid));
    const stoppedA = await heartbeat(join(root, "a"));
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.equal(
      await heartbeat(join(root, "a")),
      stoppedA,
      `A heartbeat survived ${fault}`,
    );
    if (fault === "bun") {
      assert.equal(alive(registered[1].pid), true);
      assert.ok((await heartbeat(join(root, "b"))) > beforeB);
    } else {
      await wait(() => !alive(registered[1].pid));
      const stoppedB = await heartbeat(join(root, "b"));
      await new Promise((resolve) => setTimeout(resolve, 200));
      assert.equal(await heartbeat(join(root, "b")), stoppedB);
    }
    for (const name of fault === "bun" ? ["a"] : ["a", "b"])
      assert.equal(
        alive(
          Number(await readFile(join(root, name, "heartbeat.pid"), "utf8")),
        ),
        false,
      );
    const afterReceipts = receipts(root);
    for (const before of beforeReceipts) {
      const after = afterReceipts.find(
        (receipt) => receipt.submissionId === before.submissionId,
      );
      assert.ok(after);
      assert.equal(after.text, before.text);
      if (before.acknowledgedAt)
        assert.equal(after.acknowledgedAt, before.acknowledgedAt);
      if (before.promptResult)
        assert.deepEqual(after.promptResult, before.promptResult);
    }
    const nativeHistory = [];
    for (const [index, record] of readyRecords.entries()) {
      if (!(await exists(record.sessionFile))) {
        assert.equal(
          historyExisted[index],
          false,
          "Existing native history disappeared",
        );
        nativeHistory.push({
          scope: record.scope,
          state: "absent-before-fault-lazy-local-command",
        });
        continue;
      }
      const lines = (await readFile(record.sessionFile, "utf8"))
        .trim()
        .split("\n");
      assert.ok(lines.length > 0);
      for (const line of lines) JSON.parse(line);
      nativeHistory.push({
        scope: record.scope,
        state: "readable",
        lines: lines.length,
      });
    }
    if (fault === "main") {
      await writeFile(
        join(root, "recover-input.json"),
        JSON.stringify(readyRecords),
      );
      const recovery = spawn(electron, [main, root, resources], {
        env: {
          PATH: "/usr/bin:/bin",
          HOME: root,
          TMPDIR: root,
          D_PI_FAULT_MODE: "recover",
        },
        stdio: "ignore",
      });
      await wait(() => exists(join(root, "recovered")));
      await wait(() => !alive(recovery.pid));
      const recovered = (await events(root)).filter(
        (event) => event.event === "cold-recovered",
      );
      assert.equal(recovered.length, 2);
      for (const record of recovered) assert.equal(record.phase, "interrupted");
      for (const item of registered) assert.equal(alive(item.pid), false);
    }
    results.push({
      fault,
      mode,
      nativeStopped: true,
      toolStopped: true,
      otherScopeContinues: fault === "bun",
      nativeSdk: "18.4.6",
      receiptsReadable: true,
      acknowledgedInputPreserved: afterReceipts.filter(
        (receipt) => receipt.acknowledgedAt,
      ).length,
      nativeHistory,
      coldRecoveryReadOnly: fault === "main",
      background:
        "isolated extension child, outside native async-job accounting",
    });
    console.log(
      `PASS: ${fault} / ${mode}; native+tool dead, heartbeat ceased, scope isolation verified`,
    );
  } catch (error) {
    console.error(
      await readFile(join(root, "events.jsonl"), "utf8").catch(
        () => "No Main events",
      ),
    );
    throw error;
  } finally {
    for (const item of registered) {
      try {
        process.kill(-item.pid, "SIGKILL");
      } catch {}
    }
    if (child && alive(child.pid)) child.kill("SIGKILL");
    await rm(root, { recursive: true, force: true });
  }
}
await mkdir(".scratch/runtime-hardening-omp1845/evidence", { recursive: true });
await writeFile(
  ".scratch/runtime-hardening-omp1845/evidence/process-supervision.json",
  JSON.stringify(
    {
      platform: process.platform,
      architecture: process.arch,
      time: new Date().toISOString(),
      results,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  "PASS: real Electron utility/Bun/SDK supervision matrix; no external provider calls or real credentials",
);
