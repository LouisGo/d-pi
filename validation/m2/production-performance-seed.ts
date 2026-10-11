import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { app } from "electron";
import { AppStorage } from "../../src/app/main/wiring/app-storage";
import { SubmissionIdSchema } from "../../src/modules/execution/contracts/public";
import { RuntimeService } from "../../src/modules/execution/main/public";

// Allocate identities through the formal Main/Host/OMP lifecycle. Only this
// owned fixture database is written; every native process must exit before the
// separate public SessionManager dataset writer opens its native file.
const root = process.env.D_PI_PERFORMANCE_ROOT;
if (!root) throw Error("Missing isolated performance root");
const isolation = JSON.parse(
  readFileSync(join(root, "isolation.json"), "utf8"),
);
app.setPath("userData", isolation.data);
const pause = (ms: number) => new Promise((done) => setTimeout(done, ms));
async function run() {
  const server = createServer(async (request, response) => {
    for await (const _chunk of request) {
      /* Drain fixture request. */
    }
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    response.end(
      `data: ${JSON.stringify({ id: "performance-seed", object: "chat.completion.chunk", created: 1, model: "fixture", choices: [{ index: 0, delta: { role: "assistant", content: "Isolated performance seed" }, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`,
    );
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  assert(address && typeof address !== "string");
  writeFileSync(
    join(isolation.config, "models.yml"),
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
              contextWindow: 10000000,
              maxTokens: 4096,
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            },
          ],
        },
      },
    }),
  );
  writeFileSync(
    join(isolation.config, "config.yml"),
    JSON.stringify({
      autolearn: { enabled: false },
      async: { enabled: false },
      modelRoles: {
        default: "fixture/fixture",
        smol: "fixture/fixture",
        task: "fixture/fixture",
      },
    }),
  );
  const store = AppStorage.open(join(isolation.data, "drafts.sqlite"));
  const bindings = [];
  const runtimes: RuntimeService[] = [];
  try {
    for (let index = 0; index < 3; index++) {
      const { threadId } = store.threads.create(isolation.cwd);
      const runtime = new RuntimeService(
        store,
        join(root, "resources"),
        isolation.data,
        isolation.env,
        () => {},
        undefined,
        () => {},
        threadId,
      );
      runtimes.push(runtime);
      await runtime.execute({ kind: "allow", threadId, traceId: randomUUID() });
      const started = await runtime.execute({
        kind: "start",
        threadId,
        traceId: randomUUID(),
      });
      assert.equal(started.phase, "ready", JSON.stringify(started));
      const submissionId = SubmissionIdSchema.parse(randomUUID());
      const prepared = await runtime.submit({
        kind: "prepare",
        threadId,
        submissionId,
        traceId: randomUUID(),
        revision: 0,
        text: `PERFORMANCE_SEED_${index}`,
        origin: "free",
      });
      assert.equal(prepared.kind, "receipt", JSON.stringify(prepared));
      await runtime.submit({ kind: "dispatch", threadId, submissionId });
      const deadline = Date.now() + 20000;
      while (runtime.hasActiveWork()) {
        if (Date.now() > deadline)
          throw Error("Seed native work did not settle");
        await pause(20);
      }
      const binding = store.threads.nativeSessionBinding(threadId);
      assert(binding);
      bindings.push(binding);
      assert.equal((await runtime.coolIfIdle(() => true)).kind, "cooled");
      assert.equal(runtime.nativeResidency().kind, "cold");
    }
    store.threads.select(bindings[0].threadId);
    writeFileSync(
      join(root, "seed-bindings.json"),
      JSON.stringify({ bindings, allNativeCold: true }, null, 2),
    );
    console.log(
      "Seed identities allocated; all three native processes physically cold",
    );
  } finally {
    for (const runtime of runtimes) {
      if (runtime.hasActiveWork()) await runtime.requestStop();
      await runtime.coolIfIdle(() => true);
    }
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
    store.close();
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
