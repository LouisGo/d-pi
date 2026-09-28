const { app, utilityProcess } = require("electron");
const { randomUUID } = require("node:crypto");
const {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  statSync,
  realpathSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { createServer } = require("node:http");
const root = mkdtempSync(join(tmpdir(), "d-pi-host-smoke-"));
app.setPath("userData", join(root, "app"));
let host;
let server;
let finished = false;
let completedPrompts = 0;
let acknowledged = false;
let target;
const threadId = randomUUID();
function sendLocalPrompt() {
  acknowledged = false;
  host.postMessage({
    kind: "dispatch",
    value: {
      submissionId: randomUUID(),
      threadId,
      traceId: randomUUID(),
      revision: completedPrompts + 1,
      text: "/model",
      requestId: randomUUID(),
      target,
    },
  });
}
const fail = (message) => {
  console.error(message);
  return finish(1);
};
async function finish(code) {
  if (finished) return;
  finished = true;
  clearTimeout(deadline);
  if (host) {
    host.kill();
    host = undefined;
  }
  if (server) {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
  rmSync(root, { recursive: true, force: true });
  app.exit(code);
}
const deadline = setTimeout(() => fail("Host smoke timeout"), 30000);
app
  .whenReady()
  .then(async () => {
    const config = join(root, "config");
    const project = join(root, "project");
    mkdirSync(config);
    mkdirSync(project);
    server = createServer((_req, res) => {
      res.writeHead(500);
      res.end("No model calls expected in startup smoke");
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    writeFileSync(
      join(config, "models.yml"),
      JSON.stringify({
        providers: {
          fixture: {
            baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
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
    const identity = statSync(project, { bigint: true });
    host = utilityProcess.fork(resolve("out/main/session-host.js"), [], {
      serviceName: "d-pi S2 isolated Host check",
    });
    host.on("message", (message) => {
      if (message.kind === "failed" || message.kind === "interrupted")
        return fail(`Host failed: ${message.code || message.reason}`);
      if (message.kind === "ready") {
        if (
          !message.state.sessionFile ||
          !message.state.model ||
          message.state.model.id !== "fixture"
        )
          return fail("Unexpected native identity/model");
        console.log(
          "PASS: Electron utility Host negotiated official OMP, isolated model and managed native session",
        );
        target = {
          processInstanceId: message.processInstanceId,
          connectionGeneration: message.connectionGeneration,
          configContextId: "isolated-smoke",
          nativeSessionRef: message.state.sessionFile,
        };
        sendLocalPrompt();
      }
      if (message.kind === "submission") {
        if (message.event.kind !== "ack")
          return fail("Local prompt was not acknowledged");
        acknowledged = true;
      }
      if (
        message.kind === "state" &&
        target &&
        acknowledged &&
        !message.busy &&
        !message.pendingInteraction
      ) {
        completedPrompts++;
        if (completedPrompts < 2) sendLocalPrompt();
        else {
          console.log(
            "PASS: two official local-only /model prompts returned idle after ACK, allowing idle shutdown",
          );
          host.postMessage({ kind: "close-idle" });
        }
      }
    });
    host.on("exit", (code) => {
      host = undefined;
      if (code === 0) {
        console.log("PASS: idle Host and native process closed");
        void finish(0);
      } else void fail(`Host exit ${code}`);
    });
    host.postMessage({
      kind: "start",
      threadId,
      traceId: randomUUID(),
      processInstanceId: randomUUID(),
      connectionGeneration: randomUUID(),
      configContextId: "isolated-smoke",
      binary: resolve("resources/omp/omp"),
      identity: {
        directory: realpathSync(project),
        device: identity.dev.toString(),
        inode: identity.ino.toString(),
      },
      environment: {
        PATH: "/usr/bin:/bin",
        HOME: root,
        TMPDIR: tmpdir(),
        PI_CODING_AGENT_DIR: config,
        PI_CONFIG_DIR: ".fixture-no-project-config",
      },
      sessionDirectory: join(root, "sessions"),
    });
  })
  .catch((error) => fail(error.message));
