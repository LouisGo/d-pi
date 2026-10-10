import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { acquireSdkResourceGuard } from "../../src/platform/omp/resources/sdk-resource-guard.ts";
import { createTestEnvironment } from "../testing/test-environment.mjs";
import {
  auditSdkTree,
  copySdkDependencyGraph,
  SDK_SIZE_LIMIT,
} from "./sdk-packaging.mjs";

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
  const lockHash = createHash("sha256")
    .update(await readFile("pnpm-lock.yaml"))
    .digest("hex");
  // Refresh the locked graph too, so this command repairs missing SDK resources.
  const graph = await copySdkDependencyGraph(
    [
      "node_modules/@oh-my-pi/pi-coding-agent",
      "node_modules/@oh-my-pi/pi-utils",
    ],
    "node_modules/.pnpm",
    root,
  );
  // Reviewed npm 18.8.7 source, copied byte-for-byte; no staging source patch.
  const sdkSourcePath = join(
    root,
    "node_modules/@oh-my-pi/pi-coding-agent/src/sdk.ts",
  );
  const officialSdkSha256 =
    "d693c1b71e70f61c38c2cf564c608750401179509e8c6c414d1e124baa96e69a";
  const sdkSha256 = createHash("sha256")
    .update(await readFile(sdkSourcePath))
    .digest("hex");
  if (
    versions["@oh-my-pi/pi-coding-agent"] !== "18.8.7" ||
    versions["@oh-my-pi/pi-utils"] !== "18.8.7" ||
    sdkSha256 !== officialSdkSha256
  )
    throw Error("Official SDK source changed; refusing unreviewed resources");
  const sdkSource = {
    file: "node_modules/@oh-my-pi/pi-coding-agent/src/sdk.ts",
    sha256: sdkSha256,
  };
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
    "reading-session.mjs",
    "thread-history.mjs",
    "managed-session.mjs",
    "image-input.mjs",
    "image-compression.mjs",
    "native-queue.mjs",
    "native-subagent-configuration.mjs",
    "pdf-content.mjs",
    "document-content.mjs",
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
    "reading-session.mjs",
    "thread-history.mjs",
    "managed-session.mjs",
    "image-input.mjs",
    "image-compression.mjs",
    "native-queue.mjs",
    "native-subagent-configuration.mjs",
    "pdf-content.mjs",
    "document-content.mjs",
  ])
    hashes[name] = createHash("sha256")
      .update(await readFile(join(root, name)))
      .digest("hex");
  const size = await auditSdkTree(root);
  await writeFile(
    join(root, "manifest.json"),
    JSON.stringify(
      {
        lockHash,
        sdkSource,
        sdkVersion: versions["@oh-my-pi/pi-coding-agent"],
        bunVersion: versions.bun,
        platform: `${process.platform}-${process.arch}`,
        hashes,
        packaging: {
          policyVersion: 1,
          budgetBytes: SDK_SIZE_LIMIT,
          ...graph,
          size,
        },
      },
      null,
      2,
    ),
  );
  // The manifest itself counts toward the budget as well.
  await auditSdkTree(root);
  console.log(
    `Prepared fixed official SDK ${versions["@oh-my-pi/pi-coding-agent"]}: ${graph.packages} packages, ${(size.bytes / 1024 / 1024).toFixed(1)} MiB / ${SDK_SIZE_LIMIT / 1024 / 1024} MiB budget`,
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
    if (
      graph.runtimeAdditions.some(
        (item) => item.package === "@huggingface/transformers@4.3.0",
      )
    ) {
      // Optional inference is lazy in OMP, so the SDK factory import alone
      // cannot prove this bundle's dependency closure. No model is downloaded.
      execFileSync(
        process.execPath,
        [
          "--input-type=module",
          "--eval",
          `import{createRequire}from'node:module';import{realpathSync}from'node:fs';import{pathToFileURL}from'node:url';const r=createRequire(realpathSync(${JSON.stringify(join(root, "node_modules/@oh-my-pi/pi-coding-agent/package.json"))}));const hf=await import(pathToFileURL(r.resolve('@huggingface/transformers')));if(typeof hf.pipeline!=='function')throw Error('Optional inference runtime unavailable');process.exit(0);`,
        ],
        { cwd: sandbox.cwd, env: sandbox.env, timeout: 30000, stdio: "pipe" },
      );
    }
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
