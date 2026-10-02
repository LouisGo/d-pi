import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";

const script = resolve(
  import.meta.dirname,
  "../../scripts/runtime/prepare-sdk.mjs",
);
const officialSource = readFileSync(
  resolve(
    import.meta.dirname,
    "../../node_modules/@oh-my-pi/pi-coding-agent/src/sdk.ts",
  ),
  "utf8",
);
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "d-pi-sdk-prepare-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (name, body) => {
    mkdirSync(dirname(join(root, name)), { recursive: true });
    writeFileSync(join(root, name), body);
  };
  write(
    "package.json",
    JSON.stringify({
      devDependencies: {
        "@oh-my-pi/pi-coding-agent": "18.4.6",
        "@oh-my-pi/pi-utils": "18.4.6",
        bun: "1.3.14",
      },
    }),
  );
  write("pnpm-lock.yaml", "fixture-lock\n");
  for (const name of ["pi-coding-agent", "pi-utils"]) {
    const target = `node_modules/.pnpm/${name}@18.4.6/node_modules/@oh-my-pi/${name}`;
    write(
      `${target}/package.json`,
      JSON.stringify({
        name: `@oh-my-pi/${name}`,
        version: "18.4.6",
        exports: {
          ".": { import: "./src/index.ts" },
          "./*": { import: "./src/*.ts" },
        },
      }),
    );
    write(`${target}/index.js`, "export const fixture = true;\n");
    write(`${target}/src/index.ts`, "export const fixture = true;\n");
    if (name === "pi-coding-agent")
      write(`${target}/src/sdk.ts`, officialSource);
    mkdirSync(join(root, "node_modules/@oh-my-pi"), { recursive: true });
    symlinkSync(
      `../.pnpm/${name}@18.4.6/node_modules/@oh-my-pi/${name}`,
      join(root, "node_modules/@oh-my-pi", name),
    );
  }
  write(
    "node_modules/bun/package.json",
    JSON.stringify({ name: "bun", version: "1.3.14" }),
  );
  write(
    "node_modules/bun/bin/bun.exe",
    '#!/bin/sh\nfor arg in "$@"; do case "$arg" in --outfile=*) printf "fixture gate" > "${arg#--outfile=}";; esac; done\n',
  );
  chmodSync(join(root, "node_modules/bun/bin/bun.exe"), 0o755);
  for (const name of [
    "host.mjs",
    "configuration.mjs",
    "configuration-readonly.mjs",
    "model-selection.mjs",
    "native-queue.mjs",
    "pdf-content.mjs",
    "native-subagent-configuration.mjs",
    "BUN-LICENSE.md",
  ])
    write(`runtime/${name}`, `fixture ${name}`);
  return { root, write };
}
function prepare(root) {
  return spawnSync(process.execPath, [script], {
    cwd: root,
    encoding: "utf8",
    timeout: 30000,
  });
}
function version(root, name = "pi-coding-agent") {
  return JSON.parse(
    readFileSync(
      join(root, `resources/sdk/node_modules/@oh-my-pi/${name}/package.json`),
      "utf8",
    ),
  ).version;
}
test("SDK preparation replaces old links, resolves the declared packages and is repeatable", (t) => {
  const { root, write } = fixture(t);
  write(
    "resources/sdk/node_modules/.pnpm/old/node_modules/@oh-my-pi/pi-coding-agent/package.json",
    JSON.stringify({ name: "@oh-my-pi/pi-coding-agent", version: "18.3.0" }),
  );
  mkdirSync(join(root, "resources/sdk/node_modules/@oh-my-pi"), {
    recursive: true,
  });
  symlinkSync(
    "../.pnpm/old/node_modules/@oh-my-pi/pi-coding-agent",
    join(root, "resources/sdk/node_modules/@oh-my-pi/pi-coding-agent"),
  );
  const first = prepare(root);
  assert.equal(first.status, 0, first.stderr);
  assert.equal(version(root), "18.4.6");
  assert.equal(version(root, "pi-utils"), "18.4.6");
  assert.equal(
    readFileSync(
      join(root, "node_modules/@oh-my-pi/pi-coding-agent/src/sdk.ts"),
      "utf8",
    ),
    officialSource,
  );
  assert.equal(
    readFileSync(
      join(
        root,
        "resources/sdk/node_modules/@oh-my-pi/pi-coding-agent/src/sdk.ts",
      ),
      "utf8",
    ),
    officialSource.replace(
      'from "./ratchet/prelude";',
      'from "./ratchet/prelude.ts";',
    ),
  );
  assert.ok(
    realpathSync(
      join(root, "resources/sdk/node_modules/@oh-my-pi/pi-coding-agent"),
    ).startsWith(`${realpathSync(join(root, "resources/sdk"))}/`),
  );
  const manifest = readFileSync(
    join(root, "resources/sdk/manifest.json"),
    "utf8",
  );
  const second = prepare(root);
  assert.equal(second.status, 0, second.stderr);
  assert.equal(
    readFileSync(join(root, "resources/sdk/manifest.json"), "utf8"),
    manifest,
  );
});

test("resource validation excludes preparation until Main exits, across HOME and TMPDIR contexts", {
  timeout: 20000,
}, async (t) => {
  const { root } = fixture(t);
  assert.equal(prepare(root).status, 0);
  const compiled = join(root, "sdk-resource.mjs");
  const built = spawnSync(
    resolve(import.meta.dirname, "../../node_modules/bun/bin/bun.exe"),
    [
      "build",
      resolve(
        import.meta.dirname,
        "../../src/platform/omp/resources/sdk-resource.ts",
      ),
      "--target=node",
      "--format=esm",
      `--outfile=${compiled}`,
    ],
    { encoding: "utf8" },
  );
  assert.equal(built.status, 0, built.stderr);
  // Main also admits a resource directory that it cannot modify (packaged app).
  chmodSync(join(root, "resources"), 0o500);
  t.after(() => {
    if (existsSync(join(root, "resources")))
      chmodSync(join(root, "resources"), 0o700);
  });
  const alternate = join(root, "alternate");
  mkdirSync(alternate);
  const main = spawn(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      `import { managedSdkRuntime } from ${JSON.stringify(compiled)}; await managedSdkRuntime(${JSON.stringify(join(root, "resources"))}); console.log('validated'); setInterval(()=>{},1000);`,
    ],
    {
      env: { ...process.env, HOME: alternate, TMPDIR: alternate },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  t.after(() => main.kill("SIGKILL"));
  let errors = "";
  main.stderr.on("data", (bytes) => {
    errors += bytes;
  });
  await new Promise((accept, reject) => {
    main.stdout.once("data", (bytes) =>
      bytes.toString().includes("validated")
        ? accept()
        : reject(Error(bytes.toString())),
    );
    main.once("exit", () => reject(Error(errors)));
  });
  const manifest = readFileSync(
    join(root, "resources/sdk/manifest.json"),
    "utf8",
  );
  const competing = prepare(root);
  assert.notEqual(
    competing.status,
    0,
    "prepare replaced resources after Main validation, before native spawn",
  );
  assert.match(competing.stderr, /resources are in use/);
  assert.equal(
    readFileSync(join(root, "resources/sdk/manifest.json"), "utf8"),
    manifest,
  );
  const ended = new Promise((accept) => main.once("exit", accept));
  main.kill("SIGKILL");
  await ended;
  chmodSync(join(root, "resources"), 0o700);
  const afterCrash = prepare(root);
  assert.equal(afterCrash.status, 0, afterCrash.stderr);

  // While preparation owns the same mutex, even the first validation must fail.
  const waiting = join(root, "preparation-waiting");
  const continuePreparation = join(root, "continue-preparation");
  const bun = join(root, "node_modules/bun/bin/bun.exe");
  writeFileSync(
    bun,
    `${readFileSync(bun, "utf8")}\ntouch '${waiting}'\nwhile test ! -f '${continuePreparation}'; do /bin/sleep .02; done\n`,
  );
  const preparing = spawn(process.execPath, [script], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => {
    if (existsSync(root)) writeFileSync(continuePreparation, "continue");
    preparing.kill("SIGKILL");
  });
  preparing.stdout.resume();
  let preparationErrors = "";
  preparing.stderr.on("data", (bytes) => {
    preparationErrors += bytes;
  });
  const finished = new Promise((accept) => preparing.once("exit", accept));
  for (let index = 0; index < 200 && !existsSync(waiting); index++)
    await new Promise((accept) => setTimeout(accept, 10));
  assert.equal(existsSync(waiting), true, preparationErrors);
  const validationDuringPrepare = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      `import { managedSdkRuntime } from ${JSON.stringify(compiled)}; await managedSdkRuntime(${JSON.stringify(join(root, "resources"))});`,
    ],
    { encoding: "utf8", timeout: 3000 },
  );
  assert.notEqual(validationDuringPrepare.status, 0);
  assert.match(validationDuringPrepare.stderr, /官方 SDK 运行资源/);
  writeFileSync(continuePreparation, "continue");
  assert.equal(await finished, 0, preparationErrors);
});
test("empty resources prepare successfully; a failed copy preserves the previous complete resources", (t) => {
  const { root } = fixture(t);
  assert.equal(prepare(root).status, 0);
  const manifest = readFileSync(
    join(root, "resources/sdk/manifest.json"),
    "utf8",
  );
  writeFileSync(join(root, "runtime/host.mjs"), "new incomplete host");
  rmSync(join(root, "runtime/configuration.mjs"));
  assert.notEqual(prepare(root).status, 0);
  assert.equal(
    readFileSync(join(root, "resources/sdk/manifest.json"), "utf8"),
    manifest,
  );
  assert.equal(
    readFileSync(join(root, "resources/sdk/configuration.mjs"), "utf8"),
    "fixture configuration.mjs",
  );
  assert.equal(
    readFileSync(join(root, "resources/sdk/host.mjs"), "utf8"),
    "fixture host.mjs",
  );
  assert.equal(version(root), "18.4.6");
});

test("changed upstream source or active resource users cannot replace a complete SDK root", async (t) => {
  const { root } = fixture(t);
  assert.equal(prepare(root).status, 0);
  const manifest = readFileSync(
    join(root, "resources/sdk/manifest.json"),
    "utf8",
  );
  const source = join(
    root,
    "node_modules/@oh-my-pi/pi-coding-agent/src/sdk.ts",
  );
  writeFileSync(source, officialSource + "\n// unexpected source\n");
  assert.notEqual(prepare(root).status, 0);
  assert.equal(
    readFileSync(join(root, "resources/sdk/manifest.json"), "utf8"),
    manifest,
  );
  writeFileSync(source, officialSource);
  const user = spawn(
    process.execPath,
    [
      "--eval",
      "setInterval(()=>{},1000)",
      join(root, "resources/sdk/host.mjs"),
    ],
    { stdio: "ignore" },
  );
  t.after(() => user.kill());
  await new Promise((resolve) => user.once("spawn", resolve));
  const active = prepare(root);
  assert.notEqual(active.status, 0);
  assert.match(active.stderr, /resources are in use/);
  assert.equal(
    readFileSync(join(root, "resources/sdk/manifest.json"), "utf8"),
    manifest,
  );
});
