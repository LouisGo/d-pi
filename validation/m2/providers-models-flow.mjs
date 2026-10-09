import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createTestEnvironment } from "../../scripts/testing/test-environment.mjs";
import { createCdpClient } from "./cdp.mjs";
import { wait } from "./wait.mjs";

// Run once against an already-built isolated checkout. On failure the original
// Electron and localhost server stay alive for inspection; --resume attaches
// to that same instance and never launches another one.
const option = (name, fallback) =>
  process.argv.includes(name)
    ? process.argv[process.argv.indexOf(name) + 1]
    : fallback;
const source = resolve(option("--source", "."));
const evidence = resolve(
  option("--evidence", ".scratch/providers-models/evidence"),
);
const sessionPath = join(evidence, "gui-session.json");
const reportPath = join(evidence, "gui-flow.json");
mkdirSync(evidence, { recursive: true });
const sha = (file) =>
  createHash("sha256").update(readFileSync(file)).digest("hex");
function buildIdentity() {
  const main = readFileSync(join(source, "out/main/index.js"), "utf8");
  const identity = main.match(
    /var define_D_PI_BUILD_default = \{([^}]+)\}/,
  )?.[1];
  assert.ok(identity, "Compiled Main build identity exists");
  const rendererHtml = readFileSync(
    join(source, "out/renderer/index.html"),
    "utf8",
  );
  const rendererJs = rendererHtml.match(/src="\.\/assets\/([^"]+\.js)"/)?.[1];
  const sdk = JSON.parse(
    readFileSync(join(source, "resources/sdk/manifest.json"), "utf8"),
  );
  return {
    source,
    version: identity.match(/version: "([^"]+)"/)?.[1],
    commit: identity.match(/commit: "([^"]+)"/)?.[1],
    dirty: identity.includes("dirty: true"),
    id: identity.match(/id: "([^"]+)"/)?.[1],
    mainSha256: sha(join(source, "out/main/index.js")),
    preloadSha256: sha(join(source, "out/preload/index.cjs")),
    rendererAsset: rendererJs,
    rendererSha256: rendererJs
      ? sha(join(source, "out/renderer/assets", rendererJs))
      : null,
    sdkManifestSha256: sha(join(source, "resources/sdk/manifest.json")),
    sdkResourcesMatchManifest: Object.entries({
      ...sdk.hashes,
      [sdk.sdkImportFix.file]: sdk.sdkImportFix.sha256,
    }).every(
      ([file, expected]) =>
        sha(join(source, "resources/sdk", file)) === expected,
    ),
    sdk,
  };
}
let session, child, server, socket;
async function startFixtureServer(requestsPath, port = 0) {
  const requests = JSON.parse(readFileSync(requestsPath, "utf8"));
  const endpoint = createServer((req, res) => {
    // Record transport method/path only, excluding headers and request text.
    const request = { method: req.method, path: req.url };
    requests.push(request);
    writeFileSync(requestsPath, JSON.stringify(requests));
    if (
      req.method === "POST" &&
      req.url === "/v1/chat/completions" &&
      option("--stage", "full") === "confirm" &&
      requests.filter((request) => request.method === "POST").length === 1
    ) {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
        if (body.length > 1048576) req.destroy();
      });
      req.on("end", () => {
        try {
          request.model = JSON.parse(body).model;
          writeFileSync(requestsPath, JSON.stringify(requests));
          res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
          });
          const base = {
            id: "chatcmpl-local-fixture",
            object: "chat.completion.chunk",
            created: 1780000000,
            model: request.model,
          };
          res.write(
            `data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: { role: "assistant", content: "Local model verified." }, finish_reason: null }] })}\n\n`,
          );
          res.write(
            `data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 8, completion_tokens: 4, total_tokens: 12 } })}\n\n`,
          );
          res.end("data: [DONE]\n\n");
        } catch {
          res.writeHead(400);
          res.end();
        }
      });
      return;
    }
    if (req.method !== "GET") {
      res.writeHead(503);
      res.end();
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        object: "list",
        data: [{ id: "gpt-fixture-a" }, { id: "gpt-fixture-b" }],
      }),
    );
  });
  await new Promise((done, fail) => {
    endpoint.once("error", fail);
    endpoint.listen(port, "127.0.0.1", done);
  });
  return endpoint;
}
const report = {
  startedAt: new Date().toISOString(),
  checks: [],
  screenshots: [],
  observations: [],
};
const record = (step, details = {}) => {
  report.checks.push({ step, ...details });
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  process.stdout.write(`PASS ${step}\n`);
};
if (process.argv.includes("--resume")) {
  session = JSON.parse(readFileSync(sessionPath, "utf8"));
  Object.assign(report, JSON.parse(readFileSync(reportPath, "utf8")));
  if (process.argv.includes("--continue-confirmation")) {
    assert.equal(
      session.confirmationRelaunched,
      true,
      "Continue the already launched confirmation instance",
    );
    server = await startFixtureServer(
      session.requestsPath,
      Number(new URL(session.baseUrl).port),
    );
    report.harnessAdjustments ??= [];
    report.harnessAdjustments.push({
      failure: report.failure,
      reason:
        "Count native localhost model discovery GET separately from the one model generation POST; Electron and native Host remain unchanged.",
    });
    delete report.failure;
    record("continue-same-confirmation-Electron-after-harness-adjustment", {
      pid: session.pid,
    });
  }
  if (process.argv.includes("--relaunch")) {
    assert.ok(
      !session.confirmationRelaunched,
      "Only one rebuilt confirmation may relaunch this fixture",
    );
    const previousProcess = spawnSync(
      "/bin/ps",
      ["-p", String(session.pid), "-o", "comm=,args="],
      { encoding: "utf8" },
    ).stdout;
    if (previousProcess.trim()) {
      assert.ok(
        previousProcess.includes(source) &&
          previousProcess.includes(`--remote-debugging-port=${session.port}`),
        "Owned fixture Electron identity",
      );
      process.kill(session.pid, "SIGTERM");
      await wait(
        () =>
          !spawnSync("/bin/ps", ["-p", String(session.pid), "-o", "pid="], {
            encoding: "utf8",
          }).stdout.trim(),
        10000,
        "previous fixture Electron stopped",
      );
    }
    report.previousAttempt = { build: report.build, failure: report.failure };
    delete report.failure;
    delete report.completedAt;
    server = await startFixtureServer(
      session.requestsPath,
      Number(new URL(session.baseUrl).port),
    );
    session.environment ??= {
      PATH: [
        dirname(process.execPath),
        "/usr/bin",
        "/bin",
        "/usr/sbin",
        "/sbin",
      ].join(":"),
      HOME: join(session.root, "home"),
      USERPROFILE: join(session.root, "home"),
      APPDATA: join(session.root, "home/AppData/Roaming"),
      LOCALAPPDATA: join(session.root, "home/AppData/Local"),
      TMPDIR: join(session.root, "tmp"),
      TMP: join(session.root, "tmp"),
      TEMP: join(session.root, "tmp"),
      PWD: session.cwd,
      XDG_CONFIG_HOME: join(session.root, "xdg/config"),
      XDG_DATA_HOME: join(session.root, "xdg/data"),
      XDG_STATE_HOME: join(session.root, "xdg/state"),
      XDG_CACHE_HOME: join(session.root, "xdg/cache"),
      D_PI_DATA_DIR: session.data,
      PI_CODING_AGENT_DIR: session.config,
      PI_CODING_AGENT_SESSION_DIR: session.sessions,
      PI_CONFIG_DIR: ".omp",
      OMP_PROFILE: "",
      PI_PROFILE: "",
      LANG: "C.UTF-8",
      LC_ALL: "C.UTF-8",
      CI: "1",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: join(session.root, "home/.gitconfig"),
      GIT_TERMINAL_PROMPT: "0",
    };
    session.build = buildIdentity();
    session.confirmationRelaunched = true;
    child = spawn(
      join(
        source,
        "node_modules/electron/dist/Electron.app/Contents/MacOS/Electron",
      ),
      [source, "--lang=zh-CN", `--remote-debugging-port=${session.port}`],
      { env: session.environment, stdio: ["ignore", "pipe", "pipe"] },
    );
    session.pid = child.pid;
    child.stdout.resume();
    child.stderr.resume();
    child.unref();
    child.stdout.unref();
    child.stderr.unref();
    report.build = session.build;
    writeFileSync(sessionPath, JSON.stringify(session, null, 2));
    record("one-necessary-rebuilt-confirmation-same-data", {
      pid: child.pid,
      root: session.root,
    });
  }
} else {
  const isolated = createTestEnvironment({
    prefix: "d-pi-providers-models-gui-",
  });
  const threadId = randomUUID(),
    workingDirectoryId = randomUUID();
  const db = new DatabaseSync(join(isolated.data, "drafts.sqlite"));
  db.exec(
    "CREATE TABLE workspace(id TEXT PRIMARY KEY,directory TEXT NOT NULL UNIQUE,execution_trust TEXT NOT NULL);CREATE TABLE thread(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,revision INTEGER NOT NULL,body TEXT NOT NULL);CREATE TABLE desktop(id INTEGER PRIMARY KEY,active_thread TEXT,theme TEXT NOT NULL,density TEXT NOT NULL);PRAGMA user_version=1;",
  );
  db.prepare("INSERT INTO workspace VALUES(?,?,'browse')").run(
    workingDirectoryId,
    isolated.cwd,
  );
  db.prepare("INSERT INTO thread VALUES(?,?,0,'')").run(
    threadId,
    workingDirectoryId,
  );
  db.prepare("INSERT INTO desktop VALUES(1,?,'light','normal')").run(threadId);
  db.close();
  const requestsPath = join(isolated.root, "localhost-requests.json");
  writeFileSync(requestsPath, "[]");
  server = await startFixtureServer(requestsPath);
  const baseUrl = `http://127.0.0.1:${server.address().port}/v1`;
  const catalog = JSON.parse(
    readFileSync(
      join(
        source,
        "resources/sdk/node_modules/@oh-my-pi/pi-catalog/src/models.json",
      ),
      "utf8",
    ),
  );
  const rules = JSON.parse(
    readFileSync(
      join(
        source,
        "resources/sdk/node_modules/@oh-my-pi/pi-catalog/src/compat/rules.json",
      ),
      "utf8",
    ),
  );
  const disabledProviders = [
    ...new Set([
      ...Object.keys(catalog),
      ...rules.auth.providers.map(
        (provider) => provider.storeAs ?? provider.id,
      ),
      "local",
      "apple",
      "web",
    ]),
  ].filter((provider) => provider !== "openai");
  writeFileSync(
    join(isolated.config, "models.yml"),
    JSON.stringify(
      {
        providers: {
          openai: {
            baseUrl,
            api: "openai-completions",
            auth: "oauth",
            models: ["a", "b"].map((suffix) => ({
              id: `gpt-fixture-${suffix}`,
              name: `GPT Fixture ${suffix.toUpperCase()}`,
              reasoning: suffix === "b",
              input: ["text", "image"],
              contextWindow: 128000,
              maxTokens: 16000,
              cost: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0 },
            })),
          },
        },
      },
      null,
      2,
    ),
  );
  writeFileSync(
    join(isolated.config, "config.yml"),
    JSON.stringify(
      {
        autolearn: { enabled: false },
        disabledProviders,
        enabledModels: ["openai/gpt-fixture-*"],
        modelRoles: {
          default: "openai/gpt-fixture-a",
          smol: "openai/gpt-fixture-a",
        },
      },
      null,
      2,
    ),
  );
  const ports = createServer();
  await new Promise((done) => ports.listen(0, "127.0.0.1", done));
  const port = ports.address().port;
  await new Promise((done) => ports.close(done));
  session = {
    root: isolated.root,
    data: isolated.data,
    config: isolated.config,
    cwd: isolated.cwd,
    sessions: isolated.sessions,
    threadId,
    workingDirectoryId,
    baseUrl,
    port,
    requestsPath,
    build: buildIdentity(),
    environment: isolated.env,
  };
  child = spawn(
    join(
      source,
      "node_modules/electron/dist/Electron.app/Contents/MacOS/Electron",
    ),
    [source, "--lang=zh-CN", `--remote-debugging-port=${port}`],
    { env: isolated.env, stdio: ["ignore", "pipe", "pipe"] },
  );
  session.pid = child.pid;
  child.stdout.resume();
  child.stderr.on("data", () => {});
  writeFileSync(sessionPath, JSON.stringify(session, null, 2));
  report.build = session.build;
  report.isolation = {
    homeSeparate: true,
    appDataSeparate: true,
    nativeConfigSeparate: true,
    nativeSessionsSeparate: true,
    disabledProviders: disabledProviders.length,
    initialTrust: "browse",
  };
  record("launch-one-isolated-Electron", { pid: child.pid });
}

const target = await wait(
  async () => {
    try {
      return (
        await (
          await fetch(`http://127.0.0.1:${session.port}/json/list`, {
            signal: AbortSignal.timeout(1000),
          })
        ).json()
      ).find((entry) => entry.type === "page");
    } catch {
      return null;
    }
  },
  30000,
  "isolated Electron CDP target",
);
socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((done, fail) => {
  socket.onopen = done;
  socket.onerror = fail;
});
const cdp = createCdpClient(socket);
async function evaluate(expression) {
  const reply = await cdp.call("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (reply.exceptionDetails)
    throw Error(reply.exceptionDetails.text || "Renderer evaluation failed");
  return reply.result.value;
}
const visible = `(el)=>!!el&&!el.closest('[hidden],[inert]')&&el.getBoundingClientRect().width>0&&getComputedStyle(el).visibility!=='hidden'`;
async function click(name, selector = "button") {
  const lookup = `(()=>{const scope=document.querySelector('.ui-settings-modal:not([hidden])')??document;return [...scope.querySelectorAll(${JSON.stringify(selector)})].filter(${visible}).find(el=>!el.disabled&&(el.getAttribute('aria-label')===${JSON.stringify(name)}||el.textContent.trim()===${JSON.stringify(name)}));})()`;
  await wait(() => evaluate(`!!${lookup}`), 30000, `visible action ${name}`);
  await evaluate(
    `(()=>{const el=${lookup};el.scrollIntoView({block:'nearest'});el.click();})()`,
  );
}
async function mouse(selector) {
  const rect = await evaluate(
    `(()=>{const el=[...document.querySelectorAll(${JSON.stringify(selector)})].find(${visible});if(!el)throw Error('Missing mouse target');el.scrollIntoView({block:'nearest'});const r=el.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`,
  );
  await cdp.call("Input.dispatchMouseEvent", { type: "mouseMoved", ...rect });
  await cdp.call("Input.dispatchMouseEvent", {
    type: "mousePressed",
    ...rect,
    button: "left",
    clickCount: 1,
  });
  await cdp.call("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    ...rect,
    button: "left",
    clickCount: 1,
  });
}
async function input(selector, value) {
  await evaluate(
    `(()=>{const el=[...document.querySelectorAll(${JSON.stringify(selector)})].find(${visible});if(!el)throw Error('Missing input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`,
  );
}
async function key(key, code = key, keyCode) {
  await cdp.call("Input.dispatchKeyEvent", {
    type: "keyDown",
    key,
    code,
    ...(keyCode
      ? { windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode }
      : {}),
  });
  await cdp.call("Input.dispatchKeyEvent", {
    type: "keyUp",
    key,
    code,
    ...(keyCode
      ? { windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode }
      : {}),
  });
}
async function snapshot() {
  return evaluate(
    `window.desktop.configuration.request({kind:'snapshot',scope:{kind:'thread',threadId:${JSON.stringify(session.threadId)},workingDirectoryId:${JSON.stringify(session.workingDirectoryId)}},traceId:crypto.randomUUID()})`,
  );
}
async function inspectRuntime() {
  const reply = await evaluate(
    `window.desktop.runtime.request({kind:'inspect',threadId:${JSON.stringify(session.threadId)},traceId:crypto.randomUUID()})`,
  );
  assert.equal(reply.kind, "view");
  return reply.view;
}
async function runtime() {
  return evaluate("window.__providersRuntime");
}
async function settledProviders() {
  await wait(
    () =>
      evaluate(
        "!!document.querySelector('.providers-settings')&&!document.querySelector('.configuration-page [role=status]')",
      ),
    30000,
    "provider query settled",
  );
}
async function shot(name) {
  await evaluate(
    "new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)))",
  );
  const { data } = await cdp.call("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  const file = join(evidence, `${name}.png`);
  writeFileSync(file, Buffer.from(data, "base64"));
  const layout = await evaluate(
    `(()=>{const elements=['.ui-settings-modal','.providers-workspace','.providers-rail','.providers-detail','.ui-popover-popup','.model-picker'];return {viewport:{width:innerWidth,height:innerHeight},theme:document.documentElement.dataset.theme,rects:elements.map(selector=>{const el=[...document.querySelectorAll(selector)].find(${visible});if(!el)return null;const r=el.getBoundingClientRect();return{selector,x:r.x,y:r.y,width:r.width,height:r.height,clientWidth:el.clientWidth,scrollWidth:el.scrollWidth};}).filter(Boolean),brands:[...document.querySelectorAll('svg[data-brand]')].filter(${visible}).map(el=>el.dataset.brand)};})()`,
  );
  report.screenshots.push({
    name,
    file,
    sha256: sha(file),
    buildId: session.build.id ?? session.build.commit,
    ...layout,
  });
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  return file;
}
async function theme(value) {
  await click("外观");
  await evaluate(
    `(()=>{const el=[...document.querySelectorAll('button[aria-label="主题"]')].find(${visible});if(!el)throw Error('Theme control missing');el.click();})()`,
  );
  await wait(() =>
    evaluate(
      `!![...document.querySelectorAll('[role=option]')].find(el=>el.dataset.value===${JSON.stringify(value)})`,
    ),
  );
  await evaluate(
    `[...document.querySelectorAll('[role=option]')].find(el=>el.dataset.value===${JSON.stringify(value)}).click()`,
  );
  await wait(() =>
    evaluate(
      `document.documentElement.dataset.theme===${JSON.stringify(value)}`,
    ),
  );
  await click("服务商与模型");
  await settledProviders();
}
async function picker() {
  await click("切换模型");
  await wait(() =>
    evaluate(
      `!![...document.querySelectorAll('.model-picker')].find(${visible})`,
    ),
  );
  await wait(() =>
    evaluate("!document.querySelector('.model-picker [role=status]')"),
  );
}
async function closeSettings() {
  await key("Escape", "Escape", 27);
  await wait(() =>
    evaluate("!document.querySelector('.ui-settings-modal:not([hidden])')"),
  );
}

try {
  await wait(
    () =>
      evaluate(
        "!!window.desktop?.configuration&&!!document.querySelector('.composer-model-picker')",
      ),
    30000,
    "workbench restored",
  );
  await evaluate(
    `window.__providersRuntimeUnsubscribe?.();window.__providersRuntimeUnsubscribe=window.desktop.runtime.subscribe(view=>{if(view.threadId===${JSON.stringify(session.threadId)})window.__providersRuntime=view;});true`,
  );
  await evaluate(
    `window.__providersRuntime=${JSON.stringify(await inspectRuntime())}`,
  );
  if (option("--stage", "full") === "confirm") {
    const state = await runtime();
    if (state.phase === "interrupted" || state.phase === "failed")
      await click("重新准备会话");
    const ready = await wait(
      async () => {
        const value = await runtime();
        if (value.phase === "interrupted" || value.phase === "failed")
          throw Object.assign(
            Error("Rebuilt native Host interrupted before ready"),
            { code: "VALIDATION_WAIT_TIMEOUT" },
          );
        return value.phase === "ready" && value;
      },
      35000,
      "rebuilt isolated native Host ready",
    );
    const actual = await inspectRuntime();
    assert.equal(actual.phase, "ready");
    assert.equal(actual.trusted, true);
    record("explicit-project-trust-and-native-host-readback", {
      phase: ready.phase,
      model: actual.model,
      trusted: actual.trusted,
      connectionGeneration: actual.connectionGeneration,
    });
  }
  if (option("--stage", "full") === "full") {
    await click("设置");
    await click("服务商与模型");
    await wait(
      () => evaluate("!!document.querySelector('.providers-settings')"),
      30000,
      "native catalog rendered",
    );
    await click("OpenAI");
    await settledProviders();
    const before = await snapshot();
    assert.equal(before.kind, "snapshot");
    const fixture = before.models.filter((model) =>
      model.id.startsWith("gpt-fixture-"),
    );
    assert.equal(fixture.length, 2);
    assert.equal(
      before.providers.find((provider) => provider.id === "openai")
        .apiKeyEditable,
      true,
    );
    assert.equal(
      before.providers.find((provider) => provider.id === "openai")
        .keyValidation,
      "none",
    );
    assert.equal(
      before.providers.find((provider) => provider.id === "openai").authState,
      "required",
    );
    record("native-provider-catalog-before-key", {
      coverage: before.coverage,
      providerCount: before.providers.length,
      models: fixture.map(({ provider, id, available }) => ({
        provider,
        id,
        available,
      })),
    });
    await input(".providers-key-form input", "fixture-raw-key");
    await click("保存到原生凭据库");
    const saved = await wait(
      async () => {
        const value = await snapshot();
        return (
          value.providers.find((provider) => provider.id === "openai")
            ?.authState === "configured" && value
        );
      },
      30000,
      "raw native key saved and read back",
    );
    assert.equal(
      saved.models.find((model) => model.id === "gpt-fixture-a").available,
      true,
    );
    assert.deepEqual(
      JSON.parse(readFileSync(session.requestsPath, "utf8")),
      [],
    );
    record("raw-key-native-roundtrip-without-probe", {
      provider: "openai",
      accountType: saved.providers
        .find((provider) => provider.id === "openai")
        .accounts.map((account) => account.type),
      localhostRequests: 0,
    });
    await click("添加自定义模型");
    for (const [name, value] of [
      ["model-id", "gpt-fixture-custom"],
      ["model-name", "GPT Fixture Custom"],
      ["model-base-url", session.baseUrl],
      ["model-api", "openai-completions"],
    ])
      await input(`input[name="${name}"]`, value);
    await click("保存模型");
    await wait(async () =>
      (await snapshot()).models.some(
        (model) => model.id === "gpt-fixture-custom" && model.custom,
      ),
    );
    const nativeModels = readFileSync(
      join(session.config, "models.yml"),
      "utf8",
    );
    assert.ok(nativeModels.includes("gpt-fixture-custom"));
    record("custom-model-native-file-and-snapshot", {
      id: "gpt-fixture-custom",
      nativeFile: "models.yml",
      hash: sha(join(session.config, "models.yml")),
    });
    await input(".providers-model-toolbar input", "gpt-fixture");
    await click("收藏 GPT Fixture B");
    await wait(() =>
      evaluate(
        `!!document.querySelector('button[aria-label="取消收藏 GPT Fixture B"]')`,
      ),
    );
    await click("在选择器中显示 GPT Fixture A", '[role="switch"]');
    await wait(() =>
      evaluate(
        `document.querySelector('[role="switch"][aria-label="在选择器中显示 GPT Fixture A"]')?.getAttribute('aria-checked')==='false'`,
      ),
    );
    const restored = await evaluate(
      "window.desktop.request({kind:'restore',traceId:crypto.randomUUID()})",
    );
    assert.ok(
      restored.preferences.modelPicker.favorites.includes(
        JSON.stringify(["openai", "gpt-fixture-b"]),
      ),
    );
    assert.ok(
      restored.preferences.modelPicker.hidden.includes(
        JSON.stringify(["openai", "gpt-fixture-a"]),
      ),
    );
    record("device-favorite-and-visibility-persisted", {
      favorites: restored.preferences.modelPicker.favorites,
      hidden: restored.preferences.modelPicker.hidden,
    });
    await shot("providers-light");
    await theme("dark");
    await shot("providers-dark");
    await mouse(".providers-model-toolbar input");
    const mouseFocus = await evaluate(
      "(()=>{const el=document.activeElement,c=getComputedStyle(el);return {editable:el.tagName==='INPUT',focusVisible:el.matches(':focus-visible'),outlineStyle:c.outlineStyle,outlineWidth:c.outlineWidth};})()",
    );
    assert.equal(mouseFocus.editable, true);
    assert.ok(
      mouseFocus.outlineStyle === "none" || mouseFocus.outlineWidth === "0px",
    );
    record("ordinary-mouse-input-focus-no-outline", mouseFocus);
    await closeSettings();
    await picker();
    await wait(() =>
      evaluate("document.activeElement?.classList.contains('ui-input')"),
    );
    await input(".model-picker-search input", "gpt-fixture");
    await key("ArrowDown", "ArrowDown", 40);
    assert.ok(await evaluate("!!document.activeElement?.dataset.modelId"));
    record("picker-search-and-arrow-key", {
      focusedModel: await evaluate("document.activeElement.dataset.modelId"),
    });
    await shot("picker-dark");
    await key("Escape", "Escape", 27);
    await wait(() => evaluate("!document.querySelector('.model-picker')"));
    assert.equal(
      await evaluate("document.activeElement?.getAttribute('aria-label')"),
      "切换模型",
    );
    record("picker-escape-focus-return");
    await picker();
    await click("管理服务商与模型");
    await wait(() =>
      evaluate(
        "!!document.querySelector('.ui-settings-modal:not([hidden]) .providers-settings')",
      ),
    );
    record("picker-manage-entry-opens-provider-settings");
    await theme("light");
    await closeSettings();
    await picker();
    await input(".model-picker-search input", "gpt-fixture");
    await shot("picker-light");
    await evaluate(
      `document.querySelector('[data-model-id="gpt-fixture-b"]').click()`,
    );
    const browsing = await wait(async () => {
      const value = await runtime();
      return value.selectedModel?.modelId === "gpt-fixture-b" && value;
    });
    assert.equal(browsing.trusted, false);
    assert.equal(browsing.phase, "browse");
    record("composer-model-intent-before-project-trust", {
      phase: browsing.phase,
      selectedModel: browsing.selectedModel,
    });
    await click("允许执行并启动");
    const live = await wait(
      async () => {
        const value = await runtime();
        if (value.phase === "interrupted")
          throw Object.assign(Error("Native Host interrupted before ready"), {
            code: "VALIDATION_WAIT_TIMEOUT",
          });
        return value.phase === "ready" && value;
      },
      30000,
      "isolated native host ready",
    );
    assert.equal(live.model, "openai/gpt-fixture-b");
    record("explicit-project-trust-and-native-host-readback", {
      phase: live.phase,
      model: live.model,
      trusted: live.trusted,
      connectionGeneration: live.connectionGeneration,
    });
  }
  if (option("--stage", "full") !== "visual") {
    if (await evaluate("!!document.querySelector('.model-picker')"))
      await key("Escape", "Escape", 27);
    if (
      await evaluate(
        "!!document.querySelector('.ui-settings-modal:not([hidden])')",
      )
    )
      await closeSettings();
    if (!process.argv.includes("--continue-confirmation")) {
      await picker();
      await input(".model-picker-search input", "gpt-fixture-custom");
      await evaluate(
        `document.querySelector('[data-model-id="gpt-fixture-custom"]').click()`,
      );
    }
    const switched = await wait(
      async () => {
        const value = await runtime();
        return (
          value.phase === "ready" &&
          !value.modelChanging &&
          value.model === "openai/gpt-fixture-custom" &&
          value
        );
      },
      30000,
      "connected host custom model readback",
    );
    const pickerVisible = await evaluate(
      "!!document.querySelector('.model-picker')",
    );
    record("connected-host-model-switch-native-readback", {
      model: switched.model,
      phase: switched.phase,
      pickerVisible,
      uiAlerts: await evaluate(
        "[...document.querySelectorAll('.model-picker [role=alert],.ui-popover-popup [role=alert]')].map(el=>el.textContent)",
      ),
    });
    assert.equal(
      pickerVisible,
      false,
      "Picker closes after confirmed native switch",
    );
    if (option("--stage", "full") === "confirm") {
      const priorRequests = JSON.parse(
        readFileSync(session.requestsPath, "utf8"),
      );
      assert.ok(
        priorRequests.every(
          (request) =>
            request.method === "GET" && request.path === "/v1/models",
        ),
      );
      await mouse("[contenteditable=true]");
      await cdp.call("Input.insertText", {
        text: "Local provider verification.",
      });
      await wait(
        () =>
          evaluate(
            `!![...document.querySelectorAll('button')].find(el=>el.getAttribute('aria-label')==='发送'&&!el.disabled)`,
          ),
        30000,
        "local fixture send enabled",
      );
      await click("发送");
      await wait(
        () =>
          evaluate(
            "document.body.textContent.includes('Local model verified.')",
          ),
        35000,
        "local fixture assistant rendered",
      );
      await wait(
        async () => {
          const value = await runtime();
          return (
            value.phase === "ready" &&
            !value.busy &&
            value.model === "openai/gpt-fixture-custom"
          );
        },
        35000,
        "local fixture native session settled",
      );
      const requests = JSON.parse(readFileSync(session.requestsPath, "utf8"));
      const generations = requests.filter(
        (request) => request.method === "POST",
      );
      assert.equal(generations.length, 1);
      assert.equal(generations[0].path, "/v1/chat/completions");
      assert.equal(generations[0].model, "gpt-fixture-custom");
      record("actual-Composer-native-local-model-send", {
        selectedModel: switched.model,
        localhostRequests: requests.length,
        localhostGenerationRequests: 1,
        localhostDiscoveryRequests: requests.filter(
          (request) => request.method === "GET",
        ).length,
        requestModel: generations[0].model,
        assistantRendered: true,
        realSupplierRequests: 0,
      });
      await shot("local-native-response");
    }
  }
  if (await evaluate("!!document.querySelector('.model-picker')"))
    await key("Escape", "Escape", 27);
  await click("设置");
  await click("服务商与模型");
  await click("OpenAI");
  await input(".providers-model-toolbar input", "gpt-fixture");
  await settledProviders();
  await shot("providers-light-confirmed");
  await evaluate(
    "document.querySelector('.providers-model-section').scrollIntoView({block:'end'});true",
  );
  await shot("provider-models-light-confirmed");
  await theme("dark");
  await shot("providers-dark-confirmed");
  await closeSettings();
  await picker();
  await input(".model-picker-search input", "gpt-fixture");
  await key("ArrowDown", "ArrowDown", 40);
  await shot("picker-dark-confirmed");
  await key("Escape", "Escape", 27);
  assert.equal(
    await evaluate("document.activeElement?.getAttribute('aria-label')"),
    "切换模型",
  );
  await click("设置");
  await click("服务商与模型");
  await theme("light");
  await closeSettings();
  await picker();
  await input(".model-picker-search input", "gpt-fixture");
  await shot("picker-light-confirmed");
  await key("Escape", "Escape", 27);
  await click("设置");
  await click("服务商与模型");
  await click("OpenAI");
  await settledProviders();
  try {
    const window = await cdp.call("Browser.getWindowForTarget", {
      targetId: target.id,
    });
    await cdp.call("Browser.setWindowBounds", {
      windowId: window.windowId,
      bounds: { windowState: "normal", width: 800, height: 900 },
    });
    await wait(
      () => evaluate("innerWidth<=800"),
      10000,
      "native narrow window",
    );
    report.narrowWindowMethod = "native BrowserWindow bounds";
  } catch {
    await cdp.call("Emulation.setDeviceMetricsOverride", {
      width: 800,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    report.narrowWindowMethod =
      "renderer viewport emulation (native CDP bounds unavailable)";
  }
  await shot("providers-narrow");
  const db = new DatabaseSync(join(session.data, "drafts.sqlite"), {
    readOnly: true,
  });
  assert.equal(db.prepare("PRAGMA user_version").get().user_version, 14);
  report.appStorage = {
    schemaVersion: 13,
    nativeSessions: db
      .prepare("SELECT session_id,thread_id FROM native_session")
      .all(),
    trust: db.prepare("SELECT workspace_id FROM execution_permission").all(),
  };
  db.close();
  const authDb = new DatabaseSync(join(session.config, "agent.db"), {
    readOnly: true,
  });
  report.nativeCredentials = authDb
    .prepare(
      "SELECT id,provider,credential_type FROM auth_credentials WHERE disabled_cause IS NULL",
    )
    .all();
  authDb.close();
  assert.ok(
    report.nativeCredentials.some(
      (account) =>
        account.provider === "openai" && account.credential_type === "api_key",
    ),
  );
  assert.equal(session.build.sdkResourcesMatchManifest, true);
  const localRequests = JSON.parse(readFileSync(session.requestsPath, "utf8"));
  if (option("--stage", "full") === "confirm")
    assert.equal(
      localRequests.filter((request) => request.method === "POST").length,
      1,
    );
  else assert.deepEqual(localRequests, []);
  record("no-real-provider-login-or-probe", {
    localhostRequests: localRequests.length,
    localhostGenerationRequests: localRequests.filter(
      (request) => request.method === "POST",
    ).length,
    localhostDiscoveryRequests: localRequests.filter(
      (request) => request.method === "GET",
    ).length,
    realSupplierRequests: 0,
  });
  report.completedAt = new Date().toISOString();
} catch (error) {
  report.failure = { name: error.name, message: error.message };
  try {
    await shot("gui-failure");
  } catch {}
  process.stdout.write(`FAIL ${error.message}\n`);
} finally {
  const log = join(session.data, "logs/main.jsonl");
  if (existsSync(log))
    report.hostDiagnostics = readFileSync(log, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))
      .filter((row) =>
        [
          "runtime:start",
          "runtime:host",
          "runtime:native-exit",
          "runtime:native-registration",
        ].includes(row.operation),
      )
      .map((row) =>
        Object.fromEntries(
          [
            "time",
            "operation",
            "stage",
            "code",
            "causeCode",
            "terminationReason",
            "requestedExitCode",
            "exitSignal",
            "exitCode",
            "processPid",
            "connectionId",
            "build",
          ]
            .filter((key) => row[key] !== undefined)
            .map((key) => [key, row[key]]),
        ),
      );
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  socket.close();
}
process.stdout.write(
  `Evidence ${reportPath}\nSame isolated Electron PID ${session.pid}\n`,
);
if (child || server) {
  // Retain this one instance, server and fixtures for a bounded inspection.
  const terminate = () => {
    child?.kill("SIGTERM");
    server?.close();
    process.exit(report.failure ? 1 : 0);
  };
  process.on("SIGTERM", terminate);
  process.on("SIGINT", terminate);
  setTimeout(terminate, 15 * 60 * 1000);
} else process.exitCode = report.failure ? 1 : 0;
