import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  constants,
  cpSync,
  existsSync,
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
import { app } from "electron";
import { AppStorage } from "../../src/app/main/wiring/app-storage";
import type {
  Answer,
  Interaction,
  RuntimeView,
} from "../../src/modules/execution/contracts/public";
import { SubmissionIdSchema } from "../../src/modules/execution/contracts/public";
import { RuntimeService } from "../../src/modules/execution/main/public";
import type { DiagnosticEvent } from "../../src/platform/main/diagnostics/public";

// Build: pnpm exec electron-vite build -c validation/m2/rich-ask-native.vite.ts
// Run: pnpm exec electron out/rich-ask-native/rich-ask-native.js
// Actual managed OMP + Host + Main + SQLite, isolated configuration and extension.
const root = realpathSync(mkdtempSync(join(tmpdir(), "d-pi-rich-native-")));
app.setPath("userData", join(root, "app"));
const pause = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));
async function until(check: () => boolean, label: string) {
  const deadline = Date.now() + 12_000;
  while (!check()) {
    if (Date.now() >= deadline) throw Error(`Timeout: ${label}`);
    await pause(20);
  }
}
async function run() {
  const resources = join(root, "resources");
  mkdirSync(resources);
  cpSync(resolve("resources/sdk"), join(resources, "sdk"), {
    recursive: true,
    mode: constants.COPYFILE_FICLONE,
    dereference: false,
    verbatimSymlinks: true,
  });
  const sdkManifest = JSON.parse(
    readFileSync(join(resources, "sdk/manifest.json"), "utf8"),
  );
  assert.equal(sdkManifest.sdkVersion, "18.8.9");
  for (const name of ["pi-coding-agent", "pi-utils"])
    assert(
      realpathSync(
        join(resources, "sdk/node_modules/@oh-my-pi", name),
      ).startsWith(`${resources}/sdk/`),
    );
  const config = join(root, "config"),
    project = join(root, "project");
  mkdirSync(config);
  mkdirSync(project);
  const extension = join(config, "rich-ask-extension.mjs"),
    resultFile = join(config, "ask-results.json");
  cpSync(resolve("validation/m2/rich-ask-extension.mjs"), extension);
  let modelRequests = 0;
  const server = createServer((_request, response) => {
    modelRequests++;
    response.writeHead(500);
    response.end("No model calls expected");
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
      extensions: [extension],
      autolearn: { enabled: false },
      modelRoles: { default: "fixture/fixture", smol: "fixture/fixture" },
    }),
  );
  const store = AppStorage.open(join(root, "app.sqlite")),
    threadId = store.threads.create(project).threadId;
  let view: RuntimeView | null = null;
  const events: DiagnosticEvent[] = [];
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
  const pending = (): Interaction[] =>
    view?.interactions?.items.filter((item) => item.status === "pending") ?? [];
  const command = (kind: "allow" | "start" | "inspect") =>
    runtime.execute({ kind, threadId, traceId: randomUUID() });
  const invoke = async (mode: string) => {
    rmSync(resultFile, { force: true });
    const result = await runtime.submit({
      kind: "prepare",
      threadId,
      submissionId: SubmissionIdSchema.parse(randomUUID()),
      traceId: randomUUID(),
      revision: 0,
      text: `/d-pi-rich-fixture ${mode}`,
      origin: "free",
    });
    assert.equal(result.kind, "receipt");
    if (result.kind !== "receipt") throw Error("Preparation failed");
    const dispatched = await runtime.submit({
      kind: "dispatch",
      threadId,
      submissionId: result.receipt.submissionId,
    });
    assert.equal(dispatched.kind, "receipt");
  };
  const answer = async (item: Interaction, value: Answer) => {
    assert(
      view?.interactions?.nativeSessionKey &&
        view.interactions.connectionGeneration,
    );
    const traceId = randomUUID();
    const result = await runtime.execute({
      kind: "answer",
      threadId,
      traceId,
      id: item.id,
      nativeSessionKey: view.interactions.nativeSessionKey,
      connectionGeneration: view.interactions.connectionGeneration,
      answer: value,
    });
    assert(
      result.interactionOperations?.some(
        (operation) =>
          operation.operationId === traceId && operation.status === "written",
      ),
    );
  };
  const complete = async () => {
    await until(() => existsSync(resultFile), "native extension result");
    await until(
      () => !runtime.hasActiveWork(),
      "actual local command settlement",
    );
    return JSON.parse(readFileSync(resultFile, "utf8"));
  };
  let passed = false;
  try {
    console.log("Starting isolated native rich ask validation");
    await command("allow");
    const started = await command("start");
    assert.equal(started.phase, "ready", JSON.stringify(started));
    const binding = store.threads.nativeSessionBinding(threadId);
    assert(binding);
    await invoke("parallel");
    await until(() => pending().length === 2, "two native rich requests");
    const a = pending().find(
        (item) => item.method === "ask" && item.questions.length === 2,
      ),
      b = pending().find(
        (item) => item.method === "ask" && item.questions.length === 1,
      );
    assert(a?.method === "ask" && b?.method === "ask");
    assert.notEqual(a.id, b.id);
    assert.equal(a.questions[0]?.options[0]?.label, "  原始中文 A  ");
    assert.equal(a.questions[1]?.options[0]?.preview?.includes("```ts"), true);
    assert.equal(a.expiresAt, null);
    assert.equal(b.expiresAt, null);
    await answer(b, {
      kind: "ask",
      answers: [
        { id: "custom", selectedOptions: [], customInput: "  中文自填  " },
      ],
    });
    assert(pending().some((item) => item.id === a.id));
    await answer(a, {
      kind: "ask",
      answers: [
        { id: "single", selectedOptions: ["  原始中文 A  "] },
        { id: "multi", selectedOptions: [] },
      ],
    });
    const parallel = await complete();
    assert.equal(
      parallel.result[0].results[0].selectedOptions[0],
      "  原始中文 A  ",
    );
    assert.deepEqual(parallel.result[0].results[1].selectedOptions, []);
    assert.equal(parallel.result[1].results[0].customInput, "中文自填");
    const recorded = store.answerHistory.page(threadId).entries;
    assert(
      recorded.some(
        (entry) =>
          entry.kind === "answer" &&
          entry.status === "written" &&
          entry.answer.kind === "ask" &&
          entry.answer.answers[0]?.customInput === "  中文自填  ",
      ),
    );
    await invoke("timeout");
    await until(() => pending().length === 1, "native timed request");
    const timeoutId = pending()[0]!.id;
    const timed = await complete();
    assert.deepEqual(
      timed.result.results.map(
        (item: { selectedOptions: string[] }) => item.selectedOptions,
      ),
      [["推荐 B"], ["D"]],
    );
    assert(
      !store.answerHistory
        .page(threadId)
        .entries.some(
          (entry) =>
            entry.kind === "answer" && entry.requestKey.requestId === timeoutId,
        ),
    );
    await invoke("rpc-zero");
    const immediate = await complete();
    assert.deepEqual(
      immediate.result.results.map(
        (item: { selectedOptions: string[] }) => item.selectedOptions,
      ),
      [["推荐 B"], ["D"]],
    );
    await invoke("zero");
    await until(() => pending().length === 1, "native no-deadline dialog");
    const zero = pending()[0]!;
    await pause(300);
    assert(pending().some((item) => item.id === zero.id));
    await answer(zero, { kind: "cancel" });
    assert.equal((await complete()).result, null);
    await until(
      () => runtime.nativeResidency().kind === "warm",
      "native idle confirmation",
    );
    assert.equal((await runtime.coolIfIdle(() => true)).kind, "cooled");
    await command("start");
    assert.deepEqual(store.threads.nativeSessionBinding(threadId), binding);
    await invoke("reconnected");
    await until(
      () => pending().length === 1,
      "rich ask enabled again after reconnect",
    );
    const restored = pending()[0]!;
    assert.notEqual(restored.id, zero.id);
    await answer(restored, { kind: "cancel" });
    await complete();
    assert.equal(modelRequests, 0);
    passed = true;
    console.log(
      JSON.stringify(
        {
          commit: execFileSync("git", ["rev-parse", "HEAD"], {
            encoding: "utf8",
          }).trim(),
          sourceDirty:
            execFileSync("git", ["status", "--porcelain"], {
              encoding: "utf8",
            }).trim().length > 0,
          electron: process.versions.electron,
          omp: sdkManifest.sdkVersion,
          hostEntrySha256: createHash("sha256")
            .update(readFileSync(join(import.meta.dirname, "session-host.js")))
            .digest("hex"),
          sdkHostSha256: sdkManifest.hashes["host.mjs"],
          scenarios: [
            "parallel independent native rich requests",
            "raw option and stored custom versus native normalized custom",
            "explicit empty multi",
            "native whole-form timeout defaults",
            "direct extension RPC zero expires immediately",
            "no wire deadline then explicit cancel",
            "same native file and ID reconnect with opt-in again",
          ],
          historyEntries: store.answerHistory.page(threadId).entries.length,
          modelRequests,
          limitations: [
            "isolated Electron Main and official extension; no GUI, real provider or system IME",
            "no-deadline RPC observed for 300ms; AskTool settings translation is separate",
          ],
        },
        null,
        2,
      ),
    );
  } catch (error) {
    console.error(
      "Isolated fixture failure",
      JSON.stringify({ view, modelRequests, events: events.slice(-8) }),
    );
    throw error;
  } finally {
    if (runtime.hasActiveWork()) {
      for (const item of pending())
        await answer(item, { kind: "cancel" }).catch(() => {});
      await until(
        () => !runtime.hasActiveWork(),
        "fixture cleanup settlement",
      ).catch(() => {});
    }
    await runtime.coolIfIdle(() => true);
    const cold = runtime.nativeResidency().kind === "cold";
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
    if (passed) {
      assert(cold);
      assert(
        events.filter((event) => event.operation === "runtime:native-exit")
          .length >= 2,
      );
    }
    store.close();
    if (cold) rmSync(root, { recursive: true, force: true });
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
