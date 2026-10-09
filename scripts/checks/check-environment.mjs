import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  accessSync,
  constants,
  existsSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, delimiter, dirname, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { createTestEnvironment } from "../testing/test-environment.mjs";
import { inspectDependencyContract } from "./dependency-contract.mjs";

export function probeTool(binary, args, options) {
  const result = spawnSync(binary, args, {
    encoding: "utf8",
    timeout: 10000,
    ...options,
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  if (result.error)
    return {
      kind: result.error.code === "ENOENT" ? "missing" : "failed-to-run",
      reason: result.error.code,
      output,
    };
  if (result.signal) return { kind: "crashed", reason: result.signal, output };
  if (result.status !== 0)
    return { kind: "failed", status: result.status, output };
  return { kind: "ran", output };
}

/** Resolve the caller's tool before switching HOME/PATH to the clean probe. */
export function probePnpm(target, cli, options, callerEnv = process.env) {
  let entry =
    cli && /^(pnpm\.[cm]?js|pnpm(?:-native)?(?:\.exe)?)$/.test(basename(cli))
      ? resolve(cli)
      : null;
  if (!entry) {
    for (const directory of (callerEnv.PATH ?? "").split(delimiter)) {
      const candidate = resolve(directory, "pnpm");
      try {
        accessSync(candidate, constants.X_OK);
        entry = candidate;
        break;
      } catch {
        // Continue through the caller's PATH, not the reordered probe PATH.
      }
    }
  }
  if (!entry)
    return {
      kind: "missing",
      reason: "ENOENT",
      output: "pnpm is missing from the caller's PATH",
    };

  let path;
  try {
    path = realpathSync(entry);
  } catch {
    return probeTool(entry, ["--version"], options);
  }
  const script = /^pnpm\.[cm]?js$/.test(basename(path));
  let corepack = false;
  if (script) {
    try {
      corepack =
        JSON.parse(
          readFileSync(resolve(dirname(path), "../package.json"), "utf8"),
        ).name === "corepack";
    } catch {
      // Standalone pnpm JS entries do not require Corepack metadata.
    }
  }
  let probeOptions = options;
  if (corepack) {
    // Only the package-manager cache crosses the boundary. HOME, credentials,
    // project configuration and network access stay isolated. A minimal project
    // declaration prevents Corepack from selecting its unrelated default.
    const cache =
      callerEnv.COREPACK_HOME ??
      join(
        callerEnv.XDG_CACHE_HOME ??
          callerEnv.LOCALAPPDATA ??
          join(callerEnv.HOME ?? homedir(), ".cache"),
        "node/corepack",
      );
    writeFileSync(
      join(options.cwd, "package.json"),
      JSON.stringify({ private: true, packageManager: `pnpm@${target}` }),
    );
    probeOptions = {
      ...options,
      env: { ...options.env, COREPACK_HOME: resolve(cache) },
    };
  }
  return {
    ...probeTool(
      script ? process.execPath : path,
      script ? [path, "--version"] : ["--version"],
      probeOptions,
    ),
    entry: { path, kind: corepack ? "corepack" : script ? "script" : "native" },
  };
}

const sha256 = (path) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");

export function inspectSdk(root, sdkRoot, declared) {
  const manifestPath = join(sdkRoot, "manifest.json");
  const issues = [];
  const resources = [
    "bun",
    "host.mjs",
    "gate.js",
    "configuration.mjs",
    "configuration-readonly.mjs",
    "model-selection.mjs",
    "native-queue.mjs",
    "reading-session.mjs",
    "managed-session.mjs",
    "image-input.mjs",
    "image-compression.mjs",
    "native-subagent-configuration.mjs",
    "BUN-LICENSE.md",
    "node_modules/@oh-my-pi/pi-coding-agent/package.json",
    "node_modules/@oh-my-pi/pi-utils/package.json",
  ];
  const missing = resources.filter((name) => !existsSync(join(sdkRoot, name)));
  if (!existsSync(manifestPath))
    return {
      issues: ["SDK manifest is missing; run pnpm runtime:sdk"],
      missing,
      manifest: null,
    };
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    return {
      issues: ["SDK manifest is unreadable JSON; run pnpm runtime:sdk"],
      missing,
      manifest: null,
    };
  }
  if (manifest.sdkVersion !== declared["@oh-my-pi/pi-coding-agent"])
    issues.push("SDK manifest version disagrees with package.json");
  if (manifest.bunVersion !== declared.bun)
    issues.push("SDK Bun version disagrees with package.json");
  if (manifest.platform !== `${process.platform}-${process.arch}`)
    issues.push("SDK resources target a different platform/architecture");
  const lock = join(root, "pnpm-lock.yaml");
  if (!existsSync(lock) || manifest.lockHash !== sha256(lock))
    issues.push("SDK lockHash is stale or the lockfile is missing");
  if (missing.length > 0)
    issues.push(`SDK resources are missing: ${missing.join(", ")}`);
  for (const name of [
    "bun",
    "host.mjs",
    "gate.js",
    "configuration.mjs",
    "configuration-readonly.mjs",
    "model-selection.mjs",
    "native-queue.mjs",
    "reading-session.mjs",
    "managed-session.mjs",
    "image-input.mjs",
    "image-compression.mjs",
    "native-subagent-configuration.mjs",
  ]) {
    if (
      existsSync(join(sdkRoot, name)) &&
      manifest.hashes?.[name] !== sha256(join(sdkRoot, name))
    )
      issues.push(`SDK resource hash mismatch: ${name}`);
  }
  if (manifest.sdkVersion === "18.4.6" && !manifest.sdkImportFix)
    issues.push("SDK import correction audit is missing");
  if (manifest.sdkImportFix) {
    const path = join(
      sdkRoot,
      "node_modules/@oh-my-pi/pi-coding-agent/src/sdk.ts",
    );
    if (!existsSync(path) || manifest.sdkImportFix.sha256 !== sha256(path))
      issues.push("SDK import correction hash mismatch");
  }
  for (const name of ["pi-coding-agent", "pi-utils"]) {
    const packagePath = join(
      sdkRoot,
      "node_modules/@oh-my-pi",
      name,
      "package.json",
    );
    if (existsSync(packagePath)) {
      try {
        const metadata = JSON.parse(readFileSync(packagePath, "utf8"));
        const packageRoot = realpathSync(dirname(packagePath));
        const resourceRoot = realpathSync(sdkRoot);
        const entry = realpathSync(
          join(
            packageRoot,
            name === "pi-coding-agent" ? "src/sdk.ts" : "src/index.ts",
          ),
        );
        if (
          metadata.name !== `@oh-my-pi/${name}` ||
          metadata.version !== declared[`@oh-my-pi/${name}`]
        )
          issues.push(`Bundled ${name} disagrees with package.json`);
        if (
          metadata.exports?.["."]?.import !== "./src/index.ts" ||
          (name === "pi-coding-agent" &&
            metadata.exports?.["./*"]?.import !== "./src/*.ts")
        )
          issues.push(
            `Bundled ${name} import entry disagrees with fixed official SDK`,
          );
        if (
          !packageRoot.startsWith(`${resourceRoot}${sep}`) ||
          !entry.startsWith(`${packageRoot}${sep}`)
        )
          issues.push(`Bundled ${name} resolves outside managed resources`);
      } catch {
        issues.push(`Bundled ${name} package metadata is unreadable`);
      }
    }
  }
  return { issues, missing, manifest };
}

export function inspectEnvironment(
  root,
  {
    toolsOnly = false,
    sdkRoot = join(root, "resources/sdk"),
    pnpmCli = process.env.npm_execpath,
  } = {},
) {
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const targetPath = join(root, ".node-version");
  const nodeTarget = existsSync(targetPath)
    ? readFileSync(targetPath, "utf8").trim()
    : null;
  const pnpmTarget =
    /^pnpm@(\d+\.\d+\.\d+)$/.exec(manifest.packageManager ?? "")?.[1] ?? null;
  const declared = { ...manifest.dependencies, ...manifest.devDependencies };
  const issues = inspectDependencyContract(root, manifest);
  const tools = {};
  const installed = {};
  const packagePaths = {};
  if (!nodeTarget || !/^\d+\.\d+\.\d+$/.test(nodeTarget))
    issues.push("Missing exact Node target in .node-version");
  else if (nodeTarget !== process.versions.node)
    issues.push(
      `Development Node ${process.versions.node} differs from .node-version ${nodeTarget}; select the declared runtime`,
    );
  if (!pnpmTarget)
    issues.push("packageManager must declare an exact pnpm version");
  for (const [name, version] of Object.entries(declared)) {
    try {
      // Direct dependencies have an installed root even if exports deliberately
      // hide metadata or only expose ESM/Bun entry conditions.
      const path = join(root, "node_modules", name, "package.json");
      const metadata = JSON.parse(readFileSync(path, "utf8"));
      if (metadata.name !== name)
        throw new Error("Unexpected installed package identity");
      const actual = metadata.version;
      installed[name] = actual;
      packagePaths[name] = dirname(path);
      if (actual !== version)
        issues.push(
          `${name}: installed ${actual}, declared ${version}; run pnpm install --frozen-lockfile`,
        );
    } catch {
      installed[name] = null;
      issues.push(
        `${name}: installed package metadata unavailable; run pnpm install --frozen-lockfile`,
      );
    }
  }
  if (process.env.ELECTRON_RUN_AS_NODE)
    issues.push(
      "ELECTRON_RUN_AS_NODE changes GUI startup semantics; unset it before pnpm dev or package GUI verification",
    );
  if (process.env.NODE_OPTIONS)
    issues.push(
      "NODE_OPTIONS injects unrecorded startup behavior; unset it for the reproducible baseline",
    );
  const sandbox = createTestEnvironment({
    toolPaths: [
      join(root, "node_modules/.bin"),
      ...(process.env.PATH ?? "").split(delimiter),
    ],
  });
  try {
    const pnpmOptions = {
      cwd: sandbox.cwd,
      env: {
        ...sandbox.env,
        COREPACK_ENABLE_NETWORK: "0",
        COREPACK_ENABLE_DOWNLOAD_PROMPT: "0",
        COREPACK_DEFAULT_TO_LATEST: "0",
      },
    };
    tools.pnpm = probePnpm(pnpmTarget, pnpmCli, pnpmOptions);
    if (tools.pnpm.kind !== "ran")
      issues.push(`pnpm tool ${tools.pnpm.kind}; it did not report a version`);
    else if (tools.pnpm.output !== pnpmTarget)
      issues.push(
        `pnpm ${tools.pnpm.output} differs from packageManager ${pnpmTarget}`,
      );
    if (!toolsOnly) {
      const bun = packagePaths.bun
        ? join(packagePaths.bun, "bin/bun.exe")
        : "missing-bun";
      tools.bun = probeTool(bun, ["--version"], {
        cwd: sandbox.cwd,
        env: sandbox.env,
      });
      if (tools.bun.kind !== "ran")
        issues.push(`Bun tool ${tools.bun.kind}; it did not report a version`);
      else if (tools.bun.output !== declared.bun)
        issues.push(
          "Actual Bun executable version disagrees with package.json",
        );
      if (packagePaths.electron) {
        try {
          const binary = join(
            packagePaths.electron,
            "dist",
            readFileSync(
              join(packagePaths.electron, "path.txt"),
              "utf8",
            ).trim(),
          );
          tools.electron = probeTool(
            binary,
            [
              "-e",
              "process.stdout.write(JSON.stringify({electron:process.versions.electron,node:process.versions.node}))",
            ],
            {
              cwd: sandbox.cwd,
              env: { ...sandbox.env, ELECTRON_RUN_AS_NODE: "1" },
            },
          );
          if (tools.electron.kind !== "ran")
            issues.push(
              `Electron tool ${tools.electron.kind}; embedded Node was not measured`,
            );
          else {
            try {
              tools.electron.versions = JSON.parse(tools.electron.output);
              if (
                tools.electron.versions.electron !== declared.electron ||
                typeof tools.electron.versions.node !== "string"
              )
                issues.push(
                  "Actual Electron process versions disagree with package.json or omit embedded Node",
                );
            } catch {
              issues.push(
                "Electron did not produce valid process version evidence",
              );
            }
          }
        } catch {
          tools.electron = {
            kind: "missing",
            reason: "Electron executable metadata missing",
          };
          issues.push(
            "Electron executable metadata missing; install its pinned distribution",
          );
        }
      }
    }
  } finally {
    sandbox.cleanup();
  }
  const sdk = toolsOnly
    ? {
        skipped:
          "SKIP: fast tool check; native executables and SDK resources were not inspected",
      }
    : inspectSdk(root, sdkRoot, declared);
  issues.push(...(sdk.issues ?? []));
  return {
    development: {
      node: { target: nodeTarget, actual: process.versions.node },
      pnpmTarget,
    },
    platform: `${process.platform}-${process.arch}`,
    declared,
    installed,
    tools,
    sdk,
    issues,
  };
}

function main() {
  const args = process.argv.slice(2);
  const rootIndex = args.indexOf("--root");
  const sdkIndex = args.indexOf("--sdk-root");
  const pnpmIndex = args.indexOf("--pnpm-cli");
  const root = resolve(
    rootIndex < 0 ? process.cwd() : (args[rootIndex + 1] ?? "."),
  );
  try {
    const report = inspectEnvironment(root, {
      toolsOnly: args.includes("--tools-only"),
      ...(sdkIndex < 0 ? {} : { sdkRoot: resolve(args[sdkIndex + 1]) }),
      ...(pnpmIndex < 0 ? {} : { pnpmCli: resolve(args[pnpmIndex + 1]) }),
    });
    if (args.includes("--json"))
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    else {
      process.stdout.write(
        `Development Node: ${report.development.node.actual} (target ${report.development.node.target})\npnpm: ${report.tools.pnpm.output || report.tools.pnpm.kind} (target ${report.development.pnpmTarget})\nPlatform: ${report.platform}\nInstalled exact dependencies: ${Object.entries(report.installed).filter(([name, version]) => version === report.declared[name]).length}/${Object.keys(report.declared).length}\n`,
      );
      if (report.tools.bun)
        process.stdout.write(
          `OMP host Bun: ${report.tools.bun.output || report.tools.bun.kind} (target ${report.declared.bun})\n`,
        );
      if (report.tools.electron)
        process.stdout.write(
          `Electron process: ${report.tools.electron.versions?.electron ?? report.tools.electron.kind}; embedded Node: ${report.tools.electron.versions?.node ?? "not measured"}\n`,
        );
      if (report.sdk.manifest)
        process.stdout.write(
          `SDK manifest: OMP ${report.sdk.manifest.sdkVersion}, Bun ${report.sdk.manifest.bunVersion}, ${report.sdk.manifest.platform}\n`,
        );
      if (report.sdk.skipped) process.stdout.write(`${report.sdk.skipped}\n`);
      for (const issue of report.issues) process.stdout.write(`  ${issue}\n`);
    }
    process.stdout.write(
      `${report.issues.length === 0 ? "PASS" : "FAIL"}: development environment (${report.issues.length} issues)\n`,
    );
    process.exitCode = report.issues.length === 0 ? 0 : 1;
  } catch (error) {
    process.stderr.write(
      `FAIL: environment inspection could not start (${error.message}); no environment checks passed.\n`,
    );
    process.exitCode = 2;
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  main();
