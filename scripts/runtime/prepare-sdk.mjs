import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { acquireSdkResourceGuard } from "../../src/platform/omp/resources/sdk-resource-guard.ts";
import { createTestEnvironment } from "../testing/test-environment.mjs";

const require = createRequire(resolve("package.json"));
const declared = JSON.parse(await readFile("package.json", "utf8"));
const versions = {};
for (const name of ["@oh-my-pi/pi-coding-agent", "@oh-my-pi/pi-utils", "bun"]) {
  const installed = JSON.parse(
    await readFile(`node_modules/${name}/package.json`, "utf8"),
  );
  const expected =
    declared.devDependencies?.[name] ?? declared.dependencies?.[name];
  if (installed.name !== name || installed.version !== expected)
    throw Error(
      `${name} does not match the declared version; install with the frozen lockfile before preparing SDK resources`,
    );
  versions[name] = installed.version;
}
const destination = resolve("resources/sdk");
await mkdir(dirname(destination), { recursive: true });
const releaseGuard = acquireSdkResourceGuard(destination);
let root;
const previous = `${destination}.previous`;
try {
  root = await mkdtemp(`${destination}.staging-`);
  await mkdir(join(root, "node_modules", "@oh-my-pi"), { recursive: true });
  const source = await realpath("node_modules/@oh-my-pi/pi-coding-agent");
  const store = resolve("node_modules/.pnpm");
  const copied = new Set();
  async function copyPackage(path) {
    const actual = await realpath(path);
    const rel = relative(store, actual);
    if (rel.startsWith(".."))
      throw Error("SDK dependency outside managed store");
    const unit = rel.split("/")[0];
    if (copied.has(unit)) return;
    copied.add(unit);
    const base = join(store, unit);
    await cp(base, join(root, "node_modules/.pnpm", unit), {
      recursive: true,
      verbatimSymlinks: true,
    });
    const modules = join(base, "node_modules");
    for (const entry of await readdir(modules, { withFileTypes: true })) {
      if (entry.name.startsWith("@")) {
        for (const item of await readdir(join(modules, entry.name), {
          withFileTypes: true,
        })) {
          if (item.isSymbolicLink())
            await copyPackage(join(modules, entry.name, item.name));
        }
      } else if (entry.isSymbolicLink())
        await copyPackage(join(modules, entry.name));
    }
  }
  const lockHash = createHash("sha256")
    .update(await readFile("pnpm-lock.yaml"))
    .digest("hex");
  // Refresh the locked graph too, so this command repairs missing SDK resources.
  await copyPackage(source);
  await copyPackage("node_modules/@oh-my-pi/pi-utils");
  const family = new Map();
  for (const unit of copied) {
    const scope = join(
      root,
      "node_modules/.pnpm",
      unit,
      "node_modules/@oh-my-pi",
    );
    for (const entry of await readdir(scope, { withFileTypes: true }).catch(
      () => [],
    )) {
      if (!entry.isDirectory()) continue;
      const path = join(scope, entry.name);
      const metadata = JSON.parse(
        await readFile(join(path, "package.json"), "utf8"),
      );
      family.set(metadata.name, path);
    }
  }
  for (const [name, packagePath] of family) {
    const link = join(root, "node_modules", name);
    try {
      await symlink(relative(dirname(link), packagePath), link);
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
  }
  // 2026-10-01 explicit user exception: preserve the official package and
  // correct this one ambiguous source import only in the prepared resource copy.
  const sdkSourcePath = join(
    root,
    "node_modules/@oh-my-pi/pi-coding-agent/src/sdk.ts",
  );
  const sdkSource = await readFile(sdkSourcePath, "utf8");
  const originalSdkSha256 = createHash("sha256")
    .update(sdkSource)
    .digest("hex");
  const officialSdkSha256 =
    "97fc3bb3cd9ffe43b190da942c8ac326a62975484d46bc87f8c8d1ebf3db982d";
  const originalImport =
    'import { createRatchetPrelude } from "./ratchet/prelude";';
  const fixedImport =
    'import { createRatchetPrelude } from "./ratchet/prelude.ts";';
  let sdkImportFix;
  if (versions["@oh-my-pi/pi-coding-agent"] === "18.4.6") {
    if (
      originalSdkSha256 !== officialSdkSha256 ||
      sdkSource.split(originalImport).length !== 2
    )
      throw Error(
        "Official SDK source changed; refusing unreviewed import correction",
      );
    const fixedSource = sdkSource.replace(originalImport, fixedImport);
    await writeFile(sdkSourcePath, fixedSource);
    sdkImportFix = {
      file: "node_modules/@oh-my-pi/pi-coding-agent/src/sdk.ts",
      originalSha256: originalSdkSha256,
      sha256: createHash("sha256").update(fixedSource).digest("hex"),
      originalImport,
      fixedImport,
      authorized: "2026-10-01",
    };
  }
  const bun = join(
    dirname(require.resolve("bun/package.json")),
    "bin",
    "bun.exe",
  );
  execFileSync(
    bun,
    [
      "build",
      "src/platform/omp/consumption-gate.ts",
      "--target=bun",
      `--outfile=${join(root, "gate.js")}`,
    ],
    { stdio: "inherit" },
  );
  await cp(bun, join(root, "bun"));
  await cp("runtime/host.mjs", join(root, "host.mjs"));
  for (const name of [
    "configuration.mjs",
    "configuration-readonly.mjs",
    "model-selection.mjs",
  ])
    await cp(join("runtime", name), join(root, name));
  await cp("runtime/BUN-LICENSE.md", join(root, "BUN-LICENSE.md"));
  const hashes = {};
  for (const name of [
    "bun",
    "host.mjs",
    "gate.js",
    "configuration.mjs",
    "configuration-readonly.mjs",
    "model-selection.mjs",
  ])
    hashes[name] = createHash("sha256")
      .update(await readFile(join(root, name)))
      .digest("hex");
  await writeFile(
    join(root, "manifest.json"),
    JSON.stringify(
      {
        lockHash,
        ...(sdkImportFix ? { sdkImportFix } : {}),
        sdkVersion: versions["@oh-my-pi/pi-coding-agent"],
        bunVersion: versions.bun,
        platform: `${process.platform}-${process.arch}`,
        hashes,
      },
      null,
      2,
    ),
  );
  console.log(
    `Prepared fixed official SDK ${versions["@oh-my-pi/pi-coding-agent"]}: ${copied.size} dependency units`,
  );

  // Prove the actual SDK import before publishing the new resource root.
  const sandbox = createTestEnvironment({ prefix: "d-pi-sdk-import-" });
  try {
    const entry = join(
      root,
      "node_modules/@oh-my-pi/pi-coding-agent/src/sdk.ts",
    );
    execFileSync(
      join(root, "bun"),
      [
        "--eval",
        `const sdk = await import(${JSON.stringify(entry)}); if (typeof sdk.createAgentSession !== "function") throw Error("SDK factory unavailable");`,
      ],
      {
        cwd: sandbox.cwd,
        env: sandbox.env,
        timeout: 30000,
        stdio: "pipe",
      },
    );
  } finally {
    sandbox.cleanup();
  }

  // The shared guard closes Main's validate -> spawn race. This extra snapshot
  // also refuses native processes launched by older, unguarded app builds.
  const processList = execFileSync("/bin/ps", ["-ww", "-axo", "command="], {
    encoding: "utf8",
  });
  if (
    processList
      .split("\n")
      .some(
        (line) =>
          line.includes(join(destination, "host.mjs")) ||
          line.includes(join(destination, "configuration.mjs")),
      )
  )
    throw Error(
      "SDK resources are in use; stop managed native instances before preparation",
    );
  for (const name of ["pi-coding-agent", "pi-utils"]) {
    const path = await realpath(join(root, "node_modules/@oh-my-pi", name));
    const metadata = JSON.parse(
      await readFile(join(path, "package.json"), "utf8"),
    );
    if (
      !path.startsWith(`${await realpath(root)}/`) ||
      metadata.version !== versions[`@oh-my-pi/${name}`]
    )
      throw Error("Prepared SDK package identity mismatch");
  }
  await rm(previous, { recursive: true, force: true });
  let moved = false;
  try {
    await rename(destination, previous);
    moved = true;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  try {
    await rename(root, destination);
  } catch (error) {
    if (moved) await rename(previous, destination);
    throw error;
  }
  await rm(previous, { recursive: true, force: true });
} finally {
  try {
    if (root) await rm(root, { recursive: true, force: true });
  } finally {
    releaseGuard();
  }
}
