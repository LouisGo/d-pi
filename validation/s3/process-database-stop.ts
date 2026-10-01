import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { AppStorage } from "../../src/app/main/wiring/app-storage";
import { SubmissionIdSchema } from "../../src/modules/execution/contracts/public";
import { RuntimeService } from "../../src/modules/execution/main/runtime-service";
import { TraceIdSchema } from "../../src/shared/identity";

export async function databaseStop(
  root: string,
  resources: string,
  log: (value: unknown) => void,
): Promise<void> {
  const scope = join(root, "a");
  let providerRequests = 0;
  const server = createServer(async (request, response) => {
    providerRequests++;
    for await (const _ of request) {
      /* drain isolated provider input */
    }
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    response.write(
      `data: ${JSON.stringify({ id: "fixture", object: "chat.completion.chunk", created: 1, model: "fixture", choices: [{ index: 0, delta: { role: "assistant", content: "streaming fixture" }, finish_reason: null }] })}\n\n`,
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw Error("Missing isolated provider address");
  const models = JSON.parse(
    readFileSync(join(scope, "config", "models.yml"), "utf8"),
  );
  models.providers.fixture.baseUrl = `http://127.0.0.1:${address.port}/v1`;
  writeFileSync(join(scope, "config", "models.yml"), JSON.stringify(models));
  const store = AppStorage.open(join(root, "app.sqlite"));
  const draft = store.drafts.create(realpathSync(scope));
  store.drafts.save(draft.threadId, 0, "LOCAL_STREAMING_INPUT");
  let paused = false;
  let streaming = false;
  const runtime = new RuntimeService(
    store,
    dirname(resources),
    scope,
    {
      PATH: "/usr/bin:/bin",
      HOME: root,
      TMPDIR: root,
      PI_CODING_AGENT_DIR: join(scope, "config"),
      PI_CONFIG_DIR: ".fixture-no-project",
      D_PI_FAULT_SCOPE: scope,
      D_PI_FAULT_TOOL: join(root, "tool.mjs"),
      D_PI_FAULT_BUN: join(resources, "bun"),
    },
    (view) => {
      paused = view.control?.paused === true && view.control.stopping === false;
      streaming = view.control?.streaming === true;
      log({
        event: "runtime",
        phase: view.phase,
        paused,
        message: view.message,
      });
    },
    (reply) => log({ event: "submission", kind: reply.kind }),
    (event) => log({ event: "diagnostic", ...event }),
    draft.threadId,
  );
  for (const kind of ["allow", "start"] as const)
    await runtime.execute({
      kind,
      threadId: draft.threadId,
      traceId: TraceIdSchema.parse(randomUUID()),
    });
  const submissionId = SubmissionIdSchema.parse(randomUUID());
  await runtime.submit({
    kind: "prepare",
    threadId: draft.threadId,
    submissionId,
    traceId: TraceIdSchema.parse(randomUUID()),
    revision: 1,
    text: "LOCAL_STREAMING_INPUT",
  });
  await runtime.submit({
    kind: "dispatch",
    threadId: draft.threadId,
    submissionId,
  });
  const wait = async (predicate: () => boolean) => {
    for (let index = 0; index < 200; index++) {
      if (predicate()) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw Error("Database stop condition timeout");
  };
  await wait(
    () => store.submissions.submission(submissionId)?.state === "acknowledged",
  );
  await wait(() => streaming && providerRequests > 0);
  const before = store.submissions.submission(submissionId);
  const blocker = new DatabaseSync(join(root, "app.sqlite"));
  blocker.exec("BEGIN IMMEDIATE");
  let writeFailed = false;
  try {
    store.drafts.save(draft.threadId, 1, "blocked-write");
  } catch {
    writeFailed = true;
  }
  if (!writeFailed) throw Error("SQLite write failure not established");
  await runtime.requestStop();
  await wait(() => paused);
  const after = store.submissions.submission(submissionId);
  if (
    !before ||
    !after ||
    before.acknowledgedAt !== after.acknowledgedAt ||
    after.text !== "LOCAL_STREAMING_INPUT"
  )
    throw Error("Persisted ACK or input lost while stopping");
  const binding = store.threads.nativeSessionBinding(draft.threadId);
  if (!binding) throw Error("Missing native history binding");
  await wait(() => existsSync(binding.sessionFile));
  const history = readFileSync(binding.sessionFile, "utf8").trim().split("\n");
  for (const line of history) JSON.parse(line);
  log({
    event: "database-unwritable-stop",
    writeFailed,
    actualNativePaused: paused,
    nativeStreamingBeforeStop: true,
    persistedAcknowledgementReadable: true,
    nativeHistoryReadable: true,
  });
  blocker.exec("ROLLBACK");
  blocker.close();
  server.closeAllConnections();
  server.close();
  store.close();
}
