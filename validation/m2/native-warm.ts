import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  constants,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { arch, platform, release, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { app, MessageChannelMain } from "electron";
import { AppStorage } from "../../src/app/main/wiring/app-storage";
import { NativeRuntimeSupervisor } from "../../src/app/main/wiring/native-runtime-supervisor";
import type { RuntimeView } from "../../src/modules/execution/contracts/public";
import { RuntimeService } from "../../src/modules/execution/main/public";
import {
  type DiagnosticEvent,
  Diagnostics,
} from "../../src/platform/main/diagnostics/public";

// Build: pnpm exec electron-vite build -c validation/m2/native-warm.vite.ts
// Run: pnpm exec electron out/native-warm/native-warm.js
// Isolated configuration, SQLite and projects; no external model calls.
const root = realpathSync(mkdtempSync(join(tmpdir(), "d-pi-native-warm-")));
app.setPath("userData", join(root, "app"));
const pause = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));
async function until(check: () => boolean, description: string) {
  const deadline = Date.now() + 12_000;
  while (!check()) {
    if (Date.now() >= deadline) throw Error(`Timeout: ${description}`);
    await pause(20);
  }
}
function releasedLease(sessionFile: string) {
  const lease = new DatabaseSync(
    join(dirname(sessionFile), ".d-pi-execution.sqlite"),
  );
  try {
    lease.exec("PRAGMA busy_timeout=0; BEGIN EXCLUSIVE");
    assert.equal(
      lease.prepare("SELECT COUNT(*) AS count FROM owner").get()?.count,
      0,
    );
    lease.exec("ROLLBACK");
  } finally {
    lease.close();
  }
}

async function run() {
  // An existing Dev app may hold the shared preparation mutex. Snapshot the
  // immutable managed tree into this fixture; Runtime verifies every hash again.
  const resources = join(root, "resources");
  mkdirSync(resources);
  cpSync(resolve("resources/sdk"), join(resources, "sdk"), {
    recursive: true,
    mode: constants.COPYFILE_FICLONE,
    dereference: false,
    verbatimSymlinks: true,
  });
  for (const name of ["pi-coding-agent", "pi-utils"])
    assert(
      realpathSync(
        join(resources, "sdk/node_modules/@oh-my-pi", name),
      ).startsWith(`${resources}/sdk/`),
    );
  const sdkManifest = JSON.parse(
    readFileSync(join(resources, "sdk/manifest.json"), "utf8"),
  );
  const config = join(root, "config");
  mkdirSync(config);
  let modelRequests = 0;
  const server = createServer((_request, response) => {
    modelRequests++;
    response.writeHead(500);
    response.end("No model calls expected in native residency validation");
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  assert(address && typeof address !== "string");
  writeFileSync(
    join(config, "models.yml"),
    JSON.stringify({
      providers: {
        fixture: {
          baseUrl: `http://127.0.0.1:${address.port}/v1`,
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
  writeFileSync(
    join(config, "config.yml"),
    JSON.stringify({
      autolearn: { enabled: false },
      modelRoles: { default: "fixture/fixture", smol: "fixture/fixture" },
    }),
  );
  const store = AppStorage.open(join(root, "app.sqlite"));
  const diagnostics = new Diagnostics(join(root, "logs"));
  const events: DiagnosticEvent[] = [];
  const runtimes = new Map<RuntimeView["threadId"], RuntimeService>();
  const views = new Map<RuntimeView["threadId"], RuntimeView>();
  let selected: string | null = null;
  const supervisor = new NativeRuntimeSupervisor(runtimes, () => selected, {
    maxWarm: 0,
    idleMs: 1000,
  });
  const snapshots: unknown[] = [];
  let reader: InstanceType<typeof MessageChannelMain> | undefined;
  let passed = false;
  const act = (
    runtime: RuntimeService,
    threadId: RuntimeView["threadId"],
    kind: "allow" | "start" | "inspect",
  ) => runtime.execute({ kind, threadId, traceId: randomUUID() });
  try {
    for (let index = 0; index < 3; index++) {
      const project = join(root, `project-${index}`);
      mkdirSync(project);
      const thread = store.threads.create(project);
      const runtime = new RuntimeService(
        store,
        resources,
        root,
        {
          PATH: "/usr/bin:/bin",
          TMPDIR: tmpdir(),
          PI_CODING_AGENT_DIR: config,
          PI_CONFIG_DIR: ".isolated-fixture",
        },
        (view) => views.set(thread.threadId, view),
        undefined,
        (event) => {
          events.push(event);
          diagnostics.record(event);
        },
        thread.threadId,
      );
      runtimes.set(thread.threadId, runtime);
      await act(runtime, thread.threadId, "allow");
      const started = await act(runtime, thread.threadId, "start");
      assert.equal(
        started.phase,
        "ready",
        `Native start: ${JSON.stringify({ phase: started.phase, message: started.message, recoveryFailure: started.recoveryFailure })}`,
      );
      await until(
        () => runtime.nativeResidency().kind === "warm",
        `native ${index} idle confirmation`,
      );
      assert.equal(views.get(thread.threadId)?.model, "fixture/fixture");
    }
    const ids = [...runtimes.keys()];
    const selectedId = ids[0],
      readId = ids[1],
      coldId = ids[2];
    assert(selectedId && readId && coldId);
    const readingRuntime = runtimes.get(readId),
      background = runtimes.get(coldId);
    assert(readingRuntime && background);
    const original = store.threads.nativeSessionBinding(readId);
    const backgroundBinding = store.threads.nativeSessionBinding(coldId);
    assert(original && backgroundBinding);
    selected = selectedId;
    reader = new MessageChannelMain();
    let received = false;
    reader.port1.on("message", () => {
      received = true;
    });
    reader.port1.start();
    readingRuntime.attach(reader.port2);
    reader.port1.postMessage({ kind: "timeline-demand", active: true });
    await until(() => received, "actual timeline demand snapshot");
    snapshots.push(supervisor.snapshot());
    await supervisor.sweep();
    assert.equal(background.nativeResidency().kind, "cold");
    assert.equal(readingRuntime.nativeResidency().kind, "warm");
    assert.equal(runtimes.get(selectedId)?.nativeResidency().kind, "warm");
    assert(
      supervisor
        .snapshot()
        .items.some(
          (item) =>
            item.threadId === readId && item.retained === "reading-demand",
        ),
    );
    releasedLease(backgroundBinding.sessionFile);
    snapshots.push(supervisor.snapshot());
    reader.port1.postMessage({ kind: "timeline-demand", active: false });
    reader.port1.close();
    await pause(1100);
    await supervisor.sweep();
    assert.equal(readingRuntime.nativeResidency().kind, "cold");
    releasedLease(original.sessionFile);
    assert.equal(views.get(readId)?.phase, "allowed");
    snapshots.push(supervisor.snapshot());
    await act(readingRuntime, readId, "start");
    await until(
      () => readingRuntime.nativeResidency().kind === "warm",
      "same native session restored",
    );
    assert.deepEqual(store.threads.nativeSessionBinding(readId), original);
    assert.equal(views.get(readId)?.model, "fixture/fixture");
    snapshots.push(supervisor.snapshot());
    assert.equal(modelRequests, 0);
    passed = true;
  } finally {
    reader?.port1.close();
    reader?.port2.close();
    supervisor.close();
    selected = null;
    for (const runtime of runtimes.values()) {
      if (runtime.nativeResidency().kind === "warm")
        await runtime.coolIfIdle(() => true);
    }
    await diagnostics.close();
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
    const allCold = [...runtimes.values()].every(
      (runtime) => runtime.nativeResidency().kind === "cold",
    );
    if (passed) {
      assert(
        allCold,
        "every owned physical native must finalize before cleanup",
      );
      const exits = events.filter(
        (event) => event.operation === "runtime:native-exit",
      );
      assert(
        exits.length >= 4,
        "actual native exits include the resumed instance",
      );
      for (const exit of exits) {
        assert(exit.processPid);
        assert.throws(() => process.kill(exit.processPid ?? 0, 0), /ESRCH/);
      }
      const persisted = readFileSync(join(root, "logs/main.jsonl"), "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
      assert(
        persisted.some(
          (event) =>
            event.operation === "runtime:cooldown" &&
            event.code === "cooldown-warm-to-cold",
        ),
      );
      assert(
        persisted.some(
          (event) =>
            event.operation === "runtime:cooldown" &&
            event.code === "cooldown-reading-demand",
        ),
      );
      const report = {
        commit: execFileSync("git", ["rev-parse", "HEAD"], {
          encoding: "utf8",
        }).trim(),
        sourceDirty:
          execFileSync("git", ["status", "--porcelain"], {
            encoding: "utf8",
          }).trim().length > 0,
        validationEntrySha256: createHash("sha256")
          .update(readFileSync(import.meta.filename))
          .digest("hex"),
        hostEntrySha256: createHash("sha256")
          .update(readFileSync(join(import.meta.dirname, "session-host.js")))
          .digest("hex"),
        platform: `${platform()}-${arch()}`,
        osRelease: release(),
        electron: process.versions.electron,
        node: process.versions.node,
        omp: sdkManifest.sdkVersion,
        sdkSource: sdkManifest.sdkSource,
        sdkHashes: {
          host: sdkManifest.hashes["host.mjs"],
          bun: sdkManifest.hashes.bun,
        },
        scenarios: [
          "three real native sessions",
          "selected protection",
          "actual MessagePort reader protection",
          "confirmed group and lease cleanup",
          "same session file and ID cold restore",
          "persisted typed cooldown trace",
        ],
        modelRequests,
        nativeExits: exits.length,
        snapshots,
        limitations: [
          "standalone Electron Main validation; no GUI or provider turn",
          "not the complete WB03 production workbench performance trace",
        ],
      };
      console.log(JSON.stringify(report, null, 2));
    }
    store.close();
    if (allCold) rmSync(root, { recursive: true, force: true });
    else
      console.error(
        `Physical cleanup unconfirmed; isolated fixture retained at ${root}`,
      );
  }
}

app
  .whenReady()
  .then(run)
  .then(() => app.exit(0))
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
