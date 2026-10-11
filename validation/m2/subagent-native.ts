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
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { app, MessageChannelMain } from "electron";
import { AppStorage } from "../../src/app/main/wiring/app-storage";
import {
  applyConversationUpdate,
  ConversationEventSchema,
  type ConversationItem,
} from "../../src/modules/conversation/contracts/public";
import {
  type RuntimeView,
  SubmissionIdSchema,
} from "../../src/modules/execution/contracts/public";
import { RuntimeService } from "../../src/modules/execution/main/public";
import type { DiagnosticEvent } from "../../src/platform/main/diagnostics/public";
import { createSubagentSupplier } from "./subagent-lifecycle.mjs";

// Actual managed OMP task/yield -> formal Host supervised transcript Worker.
// Build/run with subagent-native.vite.ts; SDK may use an isolated prepared root.
const root = realpathSync(mkdtempSync(join(tmpdir(), "d-pi-subagent-native-")));
app.setPath("userData", join(root, "app"));
const pause = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));
async function until(check: () => boolean, label: string) {
  const deadline = Date.now() + 20_000;
  while (!check()) {
    if (Date.now() >= deadline) throw Error(`Timeout: ${label}`);
    await pause(20);
  }
}
async function run() {
  console.log("subagent fixture: preparing isolated resources");
  const resources = join(root, "resources");
  mkdirSync(resources);
  cpSync(
    resolve(process.env.D_PI_SUBAGENT_SDK ?? "resources/sdk"),
    join(resources, "sdk"),
    {
      recursive: true,
      mode: constants.COPYFILE_FICLONE,
      dereference: false,
      verbatimSymlinks: true,
    },
  );
  const config = join(root, "config"),
    project = join(root, "project");
  mkdirSync(config);
  mkdirSync(project);
  const supplier = createSubagentSupplier();
  let modelRequests = 0;
  const server = createServer(async (request, response) => {
    modelRequests++;
    let body = "";
    for await (const chunk of request) body += chunk.toString();
    if (!supplier.handle(JSON.parse(body), response)) {
      response.writeHead(500);
      response.end("Unexpected model request");
    }
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
      task: { batch: true },
      async: { enabled: false },
      modelRoles: {
        default: "fixture/fixture",
        smol: "fixture/fixture",
        task: "fixture/fixture",
      },
    }),
  );
  const store = AppStorage.open(join(root, "app.sqlite"));
  const threadId = store.threads.create(project).threadId;
  const events: DiagnosticEvent[] = [];
  let view: RuntimeView | null = null;
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
    (next) => {
      view = next;
    },
    undefined,
    (event) => events.push(event),
    threadId,
  );
  const channel = new MessageChannelMain();
  const items = new Map<number, ConversationItem>();
  let conversationEvents = 0;
  channel.port1.on("message", ({ data }) => {
    const event = ConversationEventSchema.parse(data);
    conversationEvents++;
    if (event.kind === "snapshot") {
      items.clear();
      for (const item of event.items) items.set(item.id, item);
    } else {
      const next = applyConversationUpdate(items.get(event.item.id), event);
      assert(next, "Append without admitted base");
      items.set(next.id, next);
    }
  });
  channel.port1.start();
  const children = () => [...items.values()].filter((item) => item.subagent);
  const command = (kind: "allow" | "start" | "inspect") =>
    runtime.execute({ kind, threadId, traceId: randomUUID() });
  let cancelledRuntime: RuntimeService | undefined;
  let cancelledChannel: InstanceType<typeof MessageChannelMain> | undefined;
  let passed = false;
  try {
    console.log("subagent fixture: starting managed native session");
    await command("allow");
    const started = await command("start");
    assert.equal(started.phase, "ready", JSON.stringify(started));
    console.log("subagent fixture: attaching formal conversation port");
    runtime.attach(channel.port2);
    channel.port1.postMessage({ kind: "timeline-demand", active: true });
    await until(() => conversationEvents > 0, "formal port snapshot");
    console.log("subagent fixture: dispatching native task");
    const prepared = await runtime.submit({
      kind: "prepare",
      threadId,
      submissionId: SubmissionIdSchema.parse(randomUUID()),
      traceId: randomUUID(),
      revision: 0,
      text: "M2_SUBAGENT_PARENT",
      origin: "free",
    });
    assert.equal(prepared.kind, "receipt");
    if (prepared.kind !== "receipt") throw Error("Preparation failed");
    const dispatched = await runtime.submit({
      kind: "dispatch",
      threadId,
      submissionId: prepared.receipt.submissionId,
    });
    assert.equal(dispatched.kind, "receipt");
    console.log("subagent fixture: awaiting actual child calls");
    await until(
      () => supplier.releases.size === 2,
      "two actual native child model calls",
    );
    await until(
      () =>
        children().filter((item) => item.subagent?.status === "running")
          .length === 2,
      "two native child lifecycle observations",
    );
    supplier.releases.get("FIRST")();
    await until(
      () => children().some((item) => item.subagent?.status === "completed"),
      "first child completion",
    );
    const nativeBinding = store.threads.nativeSessionBinding(threadId);
    assert(nativeBinding);
    const childPath = join(
      nativeBinding.sessionFile.slice(0, -6),
      "first-task.jsonl",
    );
    console.log(
      JSON.stringify({
        childPath,
        childHeader: readFileSync(childPath, "utf8").split("\n")[0],
      }),
    );
    await until(
      () =>
        children().some(
          (item) =>
            item.subagent?.resultSource === "transcript" &&
            item.text.includes("M2_SUBAGENT_RESULT_FIRST"),
        ),
      "first actual child transcript Worker",
    );
    assert(children().some((item) => item.subagent?.status === "running"));
    supplier.releases.get("SECOND")();
    await until(
      () =>
        children().filter(
          (item) => item.subagent?.resultSource === "transcript",
        ).length === 2,
      "second actual child transcript Worker",
    );
    await until(() => !runtime.hasActiveWork(), "native task settlement");
    const binding = store.threads.nativeSessionBinding(threadId);
    assert(binding);
    const actual = children();
    assert.equal(actual.length, 2);
    for (const item of actual) {
      assert.equal(item.subagent?.status, "completed");
      assert.equal(item.subagent?.coverage, "observed");
      assert.equal(item.subagent?.parentToolCallId, "m2-lifecycle-task");
    }
    const parentLines = readFileSync(binding.sessionFile, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert(
      parentLines.some(
        (entry) =>
          entry.message?.role === "toolResult" &&
          entry.message.toolCallId === "m2-lifecycle-task" &&
          entry.message.isError === false,
      ),
    );
    assert.equal(
      supplier.requests.filter(
        (entry: { scope: string }) => entry.scope === "PARENT",
      ).length,
      2,
    );
    console.log("subagent fixture: cancelling a second native task scope");
    supplier.releases.clear();
    const cancelledThreadId = store.threads.create(project).threadId;
    cancelledRuntime = new RuntimeService(
      store,
      resources,
      root,
      {
        PATH: "/usr/bin:/bin",
        TMPDIR: tmpdir(),
        PI_CODING_AGENT_DIR: config,
        PI_CONFIG_DIR: ".isolated-fixture",
      },
      () => {},
      undefined,
      (event) => events.push(event),
      cancelledThreadId,
    );
    await cancelledRuntime.execute({
      kind: "allow",
      threadId: cancelledThreadId,
      traceId: randomUUID(),
    });
    const cancelledStarted = await cancelledRuntime.execute({
      kind: "start",
      threadId: cancelledThreadId,
      traceId: randomUUID(),
    });
    assert.equal(cancelledStarted.phase, "ready");
    cancelledChannel = new MessageChannelMain();
    const cancelledItems = new Map<number, ConversationItem>();
    cancelledChannel.port1.on("message", ({ data }) => {
      const event = ConversationEventSchema.parse(data);
      if (event.kind === "snapshot") {
        cancelledItems.clear();
        for (const item of event.items) cancelledItems.set(item.id, item);
      } else {
        const next = applyConversationUpdate(
          cancelledItems.get(event.item.id),
          event,
        );
        assert(next);
        cancelledItems.set(next.id, next);
      }
    });
    cancelledChannel.port1.start();
    cancelledRuntime.attach(cancelledChannel.port2);
    cancelledChannel.port1.postMessage({
      kind: "timeline-demand",
      active: true,
    });
    const cancelledPreparation = await cancelledRuntime.submit({
      kind: "prepare",
      threadId: cancelledThreadId,
      submissionId: SubmissionIdSchema.parse(randomUUID()),
      traceId: randomUUID(),
      revision: 0,
      text: "M2_SUBAGENT_PARENT",
      origin: "free",
    });
    assert.equal(cancelledPreparation.kind, "receipt");
    if (cancelledPreparation.kind !== "receipt")
      throw Error("Second preparation failed");
    await cancelledRuntime.submit({
      kind: "dispatch",
      threadId: cancelledThreadId,
      submissionId: cancelledPreparation.receipt.submissionId,
    });
    const cancellationChildren = () =>
      [...cancelledItems.values()].filter((item) => item.subagent);
    await until(
      () =>
        supplier.releases.size === 2 &&
        cancellationChildren().filter(
          (item) => item.subagent?.status === "running",
        ).length === 2,
      "two native children before stop",
    );
    const requestsBeforeStop = modelRequests;
    await cancelledRuntime.requestStop();
    await until(
      () =>
        cancellationChildren().filter(
          (item) => item.subagent?.status === "aborted",
        ).length === 2,
      "actual native abort lifecycle",
    );
    await until(
      () => !cancelledRuntime?.hasActiveWork(),
      "cancelled native task settlement",
    );
    await until(
      () =>
        cancellationChildren().every(
          (item) => item.subagent?.resultSource === "transcript",
        ),
      "aborted native transcript Worker finalization",
    );
    assert.equal(
      modelRequests,
      requestsBeforeStop,
      "Stop must not dispatch another model turn",
    );
    const aborted = cancellationChildren();
    passed = true;
    console.log(
      JSON.stringify(
        {
          evidence: "actual-omp-subagent-transcript",
          head: execFileSync("git", ["rev-parse", "HEAD"], {
            encoding: "utf8",
          }).trim(),
          dirty:
            execFileSync("git", ["status", "--porcelain"], {
              encoding: "utf8",
            }).trim().length > 0,
          electron: process.versions.electron,
          modelRequests,
          conversationEvents,
          sdkHostSha256: createHash("sha256")
            .update(readFileSync(join(resources, "sdk/host.mjs")))
            .digest("hex"),
          hostEntrySha256: createHash("sha256")
            .update(
              readFileSync(resolve("out/subagent-native/session-host.js")),
            )
            .digest("hex"),
          workerSha256: createHash("sha256")
            .update(
              readFileSync(resolve("out/subagent-native/subagent-worker.js")),
            )
            .digest("hex"),
          children: actual.map((item) => ({
            text: item.text,
            source: item.subagent,
          })),
          cancellation: {
            requestsBeforeStop,
            afterStop: modelRequests,
            children: aborted.map((item) => ({
              text: item.text,
              source: item.subagent,
            })),
          },
          limitations: [
            "loopback Main/Host/native/Worker; no GUI, real provider, IME or full performance trace",
          ],
        },
        null,
        2,
      ),
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        view,
        children: children(),
        modelRequests,
        events: events.slice(-8),
      }),
    );
    throw error;
  } finally {
    channel.port1.close();
    cancelledChannel?.port1.close();
    const ownedRuntimes = [
      runtime,
      ...(cancelledRuntime ? [cancelledRuntime] : []),
    ];
    for (const owned of ownedRuntimes) {
      if (owned.hasActiveWork()) {
        await owned.requestStop().catch(() => {});
        await until(
          () => !owned.hasActiveWork(),
          "cleanup native settlement",
        ).catch(() => {});
      }
      await owned.coolIfIdle(() => true);
    }
    const cold = ownedRuntimes.every(
      (owned) => owned.nativeResidency().kind === "cold",
    );
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
    if (passed) assert(cold, "Physical native cleanup unconfirmed");
    store.close();
    if (cold && passed) rmSync(root, { recursive: true, force: true });
    else console.error(`Fixture retained: ${root}`);
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
