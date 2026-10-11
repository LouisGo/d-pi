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
import {
  type Interaction,
  type RuntimeView,
  SubmissionIdSchema,
} from "../../src/modules/execution/contracts/public";
import { RuntimeService } from "../../src/modules/execution/main/public";

// Formal Main/Host/native loopback fixture; never modifies the active Dev SDK.
const root = realpathSync(mkdtempSync(join(tmpdir(), "d-pi-approval-native-")));
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
  console.log(`Isolated approval fixture: ${root}`);
  const resources = join(root, "resources"),
    config = join(root, "config"),
    project = join(root, "project");
  for (const path of [resources, config, project]) mkdirSync(path);
  cpSync(
    resolve(process.env.D_PI_APPROVAL_SDK ?? "resources/sdk"),
    join(resources, "sdk"),
    {
      recursive: true,
      mode: constants.COPYFILE_FICLONE,
      dereference: false,
      verbatimSymlinks: true,
    },
  );
  const manifest = JSON.parse(
    readFileSync(join(resources, "sdk/manifest.json"), "utf8"),
  );
  assert.equal(manifest.sdkVersion, "18.8.9");
  let modelRequests = 0;
  const callIds = ["approval-approve", "approval-deny"];
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk.toString();
    const payload = JSON.parse(body);
    modelRequests++;
    const toolResults =
      payload.messages?.filter(
        (message: { role: string }) => message.role === "tool",
      ) ?? [];
    const frame = (delta: unknown, finish: string | null = null) => ({
      id: "approval-fixture",
      object: "chat.completion.chunk",
      created: 1,
      model: payload.model,
      choices: [{ index: 0, delta, finish_reason: finish }],
    });
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    if (toolResults.length === 0) {
      response.write(
        `data: ${JSON.stringify(frame({ role: "assistant", tool_calls: callIds.map((id, index) => ({ index, id, type: "function", function: { name: "bash", arguments: JSON.stringify({ command: `printf fixture > ${index === 0 ? "approved" : "denied"}.txt` }) } })) }))}\n\n`,
      );
      response.write(`data: ${JSON.stringify(frame({}, "tool_calls"))}\n\n`);
    } else {
      response.write(
        `data: ${JSON.stringify(frame({ role: "assistant", content: "Approval fixture finished" }))}\n\n`,
      );
      response.write(`data: ${JSON.stringify(frame({}, "stop"))}\n\n`);
    }
    response.end("data: [DONE]\n\n");
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (!address || typeof address === "string")
    throw Error("Missing loopback address");
  writeFileSync(
    join(config, "models.json"),
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
      tools: { approvalMode: "always-ask" },
      modelRoles: { default: "fixture/fixture", smol: "fixture/fixture" },
    }),
  );
  const store = AppStorage.open(join(root, "app.sqlite")),
    threadId = store.threads.create(project).threadId;
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
    undefined,
    threadId,
  );
  const pending = (): Interaction[] =>
    view?.interactions?.items.filter((item) => item.status === "pending") ?? [];
  async function answer(item: Interaction, approve: boolean) {
    assert(view?.interactions?.nativeSessionKey);
    const traceId = randomUUID();
    const result = await runtime.execute({
      kind: "answer",
      threadId,
      traceId,
      id: item.id,
      nativeSessionKey: view.interactions.nativeSessionKey,
      connectionGeneration: view.interactions.connectionGeneration,
      answer: { kind: "value", value: approve ? "Approve" : "Deny" },
    });
    assert(
      result.interactionOperations?.some(
        (op) => op.operationId === traceId && op.status === "written",
      ),
    );
  }
  let passed = false;
  let report: unknown;
  try {
    await runtime.execute({ kind: "allow", threadId, traceId: randomUUID() });
    await runtime.execute({ kind: "start", threadId, traceId: randomUUID() });
    const binding = store.threads.nativeSessionBinding(threadId);
    assert(binding);
    const prepared = await runtime.submit({
      kind: "prepare",
      threadId,
      submissionId: SubmissionIdSchema.parse(randomUUID()),
      traceId: randomUUID(),
      revision: 0,
      text: "D_PI_APPROVAL_NATIVE",
      origin: "free",
    });
    if (prepared.kind !== "receipt") throw Error("Preparation failed");
    await runtime.submit({
      kind: "dispatch",
      threadId,
      submissionId: prepared.receipt.submissionId,
    });
    await until(
      () =>
        pending().length === 2 &&
        view?.approvals?.items.filter((item) => item.status === "pending")
          .length === 2,
      "two actual native approvals and separate dialogs",
    );
    const facts = view?.approvals;
    assert.deepEqual(
      facts?.items.map((item) => item.toolCallId).sort(),
      [...callIds].sort(),
    );
    assert(
      facts?.items.every(
        (item) =>
          item.nativeSessionKey === binding.sessionId &&
          item.toolName === "bash",
      ),
    );
    assert(
      pending().every(
        (item) =>
          item.method === "select" &&
          item.policy?.reason === "approval-unassociated" &&
          item.policy.defaultOwner === "manual",
      ),
    );
    // The fixture chooses its two known commands from the actual prompts. App
    // production code deliberately does not turn prompt text into identity.
    const approve = pending().find((item) =>
      item.title.includes("approved.txt"),
    );
    const deny = pending().find((item) => item.title.includes("denied.txt"));
    assert(approve && deny);
    await pause(3000);
    assert.equal(
      store.answerHistory
        .page(threadId)
        .entries.filter((entry) => entry.kind === "answer").length,
      0,
    );
    assert(
      !existsSync(join(project, "approved.txt")) &&
        !existsSync(join(project, "denied.txt")),
    );
    await answer(deny, false);
    await until(
      () =>
        view?.approvals?.items.some(
          (item) => item.toolCallId === callIds[1] && item.status === "denied",
        ) === true,
      "exact native denial",
    );
    assert(
      view?.approvals?.items.some(
        (item) => item.toolCallId === callIds[0] && item.status === "pending",
      ),
    );
    await answer(approve, true);
    await until(() => !runtime.hasActiveWork(), "native tool turn settlement");
    assert(existsSync(join(project, "approved.txt")));
    assert(!existsSync(join(project, "denied.txt")));
    const results = readFileSync(binding.sessionFile, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .filter(
        (entry) =>
          entry.type === "message" &&
          entry.message?.role === "toolResult" &&
          callIds.includes(entry.message.toolCallId),
      );
    assert.equal(results.length, 2);
    assert.equal(
      results.find((entry) => entry.message.toolCallId === callIds[0]).message
        .isError,
      false,
    );
    assert.equal(
      results.find((entry) => entry.message.toolCallId === callIds[1]).message
        .isError,
      true,
    );
    report = {
      commit: execFileSync("git", ["rev-parse", "HEAD"], {
        encoding: "utf8",
      }).trim(),
      sourceDirty:
        execFileSync("git", ["status", "--porcelain"], {
          encoding: "utf8",
        }).trim().length > 0,
      electron: process.versions.electron,
      omp: manifest.sdkVersion,
      sdkHostSha256: manifest.hashes["host.mjs"],
      sdkApprovalSha256: manifest.hashes["native-approval-observation.mjs"],
      hostEntrySha256: createHash("sha256")
        .update(readFileSync(join(import.meta.dirname, "session-host.js")))
        .digest("hex"),
      sourceHashes: Object.fromEntries(
        [
          "runtime/host.mjs",
          "runtime/native-approval-observation.mjs",
          "src/modules/execution/contracts/approval.ts",
          "src/modules/execution/contracts/interactions.ts",
          "src/modules/execution/core/interactions/interaction-policy.ts",
          "src/modules/execution/host/session-host.ts",
          "src/modules/execution/main/runtime/runtime-service.ts",
        ].map((path) => [
          path,
          createHash("sha256").update(readFileSync(path)).digest("hex"),
        ]),
      ),
      modelRequests,
      initialFacts: facts,
      finalFacts: view?.approvals,
      writtenAnswerCount: store.answerHistory
        .page(threadId)
        .entries.filter((entry) => entry.kind === "answer").length,
      approvedFileExists: true,
      deniedFileExists: false,
      limitations: [
        "isolated formal Main/Host/native, no GUI/provider/system IME",
        "select IDs remain unassociated in production; fixture command text is not an App correlation",
        "three-second native hold; 120-second default race is covered by Host virtual-time tests",
      ],
    };
    passed = true;
  } catch (error) {
    console.error(
      "Approval fixture failure",
      JSON.stringify({ view, modelRequests, root }),
    );
    throw error;
  } finally {
    if (runtime.hasActiveWork()) await runtime.requestStop().catch(() => {});
    await until(() => !runtime.hasActiveWork(), "cleanup settlement").catch(
      () => {},
    );
    await runtime.coolIfIdle(() => true);
    const cold = runtime.nativeResidency().kind === "cold";
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
    store.close();
    if (passed) {
      assert(cold);
      console.log(
        JSON.stringify(
          { ...(report as object), finalNativeCold: cold },
          null,
          2,
        ),
      );
    }
    if (passed && cold) rmSync(root, { recursive: true, force: true });
    else console.error(`Fixture retained at ${root}`);
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
