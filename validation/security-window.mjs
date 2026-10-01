import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, resolve } from "node:path";
import { createTestEnvironment } from "../scripts/testing/test-environment.mjs";

// Focused real-Electron check for the privileged window. This does not start OMP
// or exercise the entire GUI, and never inherits personal configuration.
const argument = process.argv[2];
const development = [
  "--development",
  "--development-untrusted",
  "--development-redirect",
  "--development-local-redirect",
].includes(argument);
if (!argument || (argument.startsWith("--") && !development))
  throw Error(
    "Usage: node validation/security-window.mjs --development | --development-untrusted | --development-redirect | --development-local-redirect | <macOS app path>",
  );
if (process.platform !== "darwin" || process.arch !== "arm64")
  throw Error("This native check currently supports verified macOS arm64 only");

const rendererRoot = resolve("out/renderer");
const requests = [];
const outsideRequests = [];
let fixtureUrl;
let outsideUrl;
const server = createServer(async (request, response) => {
  if (request.headers.host?.startsWith("external.example.test:")) {
    outsideRequests.push(request.url);
    response.writeHead(200, { "Content-Type": "text/html" });
    response.end("<!doctype html><title>outside renderer fixture</title>");
    return;
  }
  requests.push(request.url);
  if (["/external-redirect", "/local-redirect"].includes(request.url)) {
    response.writeHead(302, {
      Location: request.url === "/external-redirect" ? outsideUrl : fixtureUrl,
    });
    response.end();
    return;
  }
  try {
    const path = resolve(
      rendererRoot,
      `.${decodeURIComponent(new URL(request.url, "http://localhost").pathname)}`,
    );
    assert.ok(path.startsWith(`${rendererRoot}/`));
    const file = path.endsWith("/") ? join(path, "index.html") : path;
    const types = {
      ".html": "text/html",
      ".js": "application/javascript",
      ".css": "text/css",
      ".json": "application/json",
      ".wasm": "application/wasm",
      ".woff2": "font/woff2",
    };
    response.writeHead(200, {
      "Content-Type": types[extname(file)] ?? "text/plain",
    });
    response.end(await readFile(file));
  } catch {
    response.writeHead(404);
    response.end("fixture: missing resource");
  }
});
await new Promise((accept) => server.listen(0, "127.0.0.1", accept));
const fixtureOrigin = `http://127.0.0.1:${server.address().port}`;
fixtureUrl = `${fixtureOrigin}/index.html`;
outsideUrl = `http://external.example.test:${server.address().port}/outside.html`;
const debugging = createServer();
await new Promise((accept) => debugging.listen(0, "127.0.0.1", accept));
const debugPort = debugging.address().port;
await new Promise((accept) => debugging.close(accept));
const inheritedUrl =
  {
    "--development-untrusted":
      "data:text/html,<script>document.title=typeof desktop</script>",
    "--development-redirect": `${fixtureOrigin}/external-redirect`,
    "--development-local-redirect": `${fixtureOrigin}/local-redirect`,
  }[argument] ?? fixtureUrl;
const sandbox = createTestEnvironment({
  prefix: "d-pi-window-security-",
  fixtureEnv: { ELECTRON_RENDERER_URL: inheritedUrl },
});
const binary = development
  ? resolve("node_modules/electron/dist/Electron.app/Contents/MacOS/Electron")
  : join(resolve(argument), "Contents/MacOS/d-pi");
const artifact = development
  ? resolve("out/main/index.js")
  : join(resolve(argument), "Contents/Resources/app.asar");
const child = spawn(
  binary,
  [
    ...(development ? [resolve("out/main/index.js")] : []),
    `--remote-debugging-port=${debugPort}`,
    ...(argument === "--development-redirect"
      ? [
          "--host-resolver-rules=MAP external.example.test 127.0.0.1",
          "--no-proxy-server",
        ]
      : []),
  ],
  { cwd: sandbox.cwd, env: sandbox.env, stdio: ["ignore", "pipe", "pipe"] },
);
let stderr = "";
let startupError;
child.on("error", (error) => {
  startupError = error;
});
child.stdout.on("data", () => {});
child.stderr.on("data", (bytes) => {
  stderr = (stderr + bytes.toString()).slice(-4096);
});
const wait = async (read) => {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const result = await read();
    if (result) return result;
    if (startupError || child.exitCode !== null || child.signalCode !== null)
      throw Error(
        `Electron startup failed: ${startupError?.message ?? stderr}`,
      );
    await new Promise((accept) => setTimeout(accept, 50));
  }
  throw Error(`Electron security check timed out: ${stderr}`);
};
let socket;
try {
  const target = await wait(async () => {
    try {
      const targets = await (
        await fetch(`http://127.0.0.1:${debugPort}/json/list`, {
          signal: AbortSignal.timeout(500),
        })
      ).json();
      return targets.find((value) => value.type === "page");
    } catch {
      return undefined;
    }
  });
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((accept, reject) => {
    socket.onopen = accept;
    socket.onerror = reject;
  });
  let sequence = 0;
  const pending = new Map();
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    clearTimeout(entry.timer);
    if (message.error) entry.reject(Error(message.error.message));
    else entry.accept(message.result);
  };
  socket.onclose = () => {
    for (const entry of pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(Error("Electron debugging channel closed"));
    }
    pending.clear();
  };
  const evaluate = async (expression) => {
    const result = await new Promise((accept, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(Error("Electron evaluation timed out"));
      }, 5000);
      pending.set(id, { accept, reject, timer });
      socket.send(
        JSON.stringify({
          id,
          method: "Runtime.evaluate",
          params: { expression, returnByValue: true, awaitPromise: true },
        }),
      );
    });
    assert.equal(result.exceptionDetails, undefined);
    return result.result.value;
  };
  await wait(() =>
    evaluate(
      "document.readyState === 'complete' && location.href !== 'about:blank' && !!window.desktop",
    ),
  );
  const snapshot = await evaluate(`(async () => ({
    url: location.href,
    title: document.title,
    node: typeof process,
    require: typeof require,
    userAgent: navigator.userAgent,
    locale: await window.desktop.locale.snapshot(),
    restore: (await window.desktop.request({kind:'restore',traceId:crypto.randomUUID()})).kind
  }))()`);
  assert.equal(snapshot.node, "undefined");
  assert.equal(snapshot.require, "undefined");
  assert.equal(snapshot.restore, "ready");
  assert.equal(snapshot.title, "d-pi");
  if (["--development", "--development-local-redirect"].includes(argument)) {
    assert.equal(snapshot.url, fixtureUrl);
    assert.ok(requests.length > 0);
    if (argument === "--development-local-redirect")
      assert.ok(requests.includes("/local-redirect"));
  } else {
    assert.ok(
      snapshot.url.startsWith("file://") &&
        snapshot.url.endsWith("/renderer/index.html"),
    );
    if (argument === "--development-redirect")
      assert.deepEqual(requests, ["/external-redirect"]);
    else
      assert.equal(
        requests.length,
        0,
        "the inherited renderer URL must not be fetched",
      );
  }
  assert.deepEqual(
    outsideRequests,
    [],
    "an outside redirect must not be fetched",
  );
  const inlineExecuted = await evaluate(`(() => {
    window.__dPiInlineExecuted = false;
    const script = document.createElement('script');
    script.textContent = 'window.__dPiInlineExecuted = true';
    document.head.append(script);
    return window.__dPiInlineExecuted;
  })()`);
  assert.equal(inlineExecuted, false, "CSP must reject injected inline script");
  assert.equal(
    await evaluate("window.open('https://external.example.test/') === null"),
    true,
  );
  await evaluate("location.href = 'https://external.example.test/'; undefined");
  await new Promise((accept) => setTimeout(accept, 150));
  assert.equal(await evaluate("location.href"), snapshot.url);
  assert.deepEqual(await readdir(sandbox.sessions), []);
  const result = {
    mode: development ? argument.slice(2) : "packaged",
    runnerNode: process.version,
    artifact,
    artifactSha256: createHash("sha256")
      .update(await readFile(artifact))
      .digest("hex"),
    fixture: { inheritedUrl, outsideUrl, requests, outsideRequests },
    snapshot,
    checks: {
      expectedRendererLoaded: true,
      restrictedPreloadIpcWorks: true,
      rendererNodeUnavailable: true,
      inlineScriptBlocked: true,
      pageWindowAndNavigationDenied: true,
      nativeSessionNotStarted: true,
    },
  };
  if (process.env.D_PI_SECURITY_EVIDENCE) {
    const evidence = resolve(process.env.D_PI_SECURITY_EVIDENCE);
    await mkdir(dirname(evidence), { recursive: true });
    await writeFile(evidence, `${JSON.stringify(result, null, 2)}\n`);
  }
  console.log(`PASS: ${JSON.stringify(result)}`);
} finally {
  socket?.close();
  if (child.exitCode === null && child.signalCode === null && !startupError) {
    child.kill("SIGTERM");
    const timer = setTimeout(() => child.kill("SIGKILL"), 3000);
    await new Promise((accept) => child.once("exit", accept));
    clearTimeout(timer);
  }
  server.closeAllConnections();
  await new Promise((accept) => server.close(accept));
  sandbox.cleanup();
}
