import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

const modes = new Set(["install", "uninstall", "status", "check"]);
const hooks = [
  "applypatch-msg",
  "pre-applypatch",
  "post-applypatch",
  "pre-commit",
  "pre-merge-commit",
  "prepare-commit-msg",
  "commit-msg",
  "post-commit",
  "pre-rebase",
  "post-checkout",
  "post-merge",
  "pre-push",
  "pre-receive",
  "update",
  "proc-receive",
  "post-receive",
  "post-update",
  "reference-transaction",
  "push-to-checkout",
  "pre-auto-gc",
  "post-rewrite",
  "sendemail-validate",
  "fsmonitor-watchman",
  "p4-changelist",
  "p4-prepare-changelist",
  "p4-post-changelist",
  "p4-pre-submit",
];
const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;

function checkCommit(root) {
  const staged = spawnSync(
    "git",
    ["diff", "--cached", "--name-only", "--no-renames", "-z"],
    { cwd: root, encoding: "utf8" },
  );
  if (staged.error || staged.signal || staged.status !== 0)
    throw new Error("Staged change inventory unavailable; checks did not run");
  const paths = staged.stdout.split("\0").filter(Boolean);
  function check(command, args) {
    const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
    if (result.error || result.signal)
      throw new Error(
        `Check unavailable: ${result.error?.message ?? result.signal}`,
      );
    process.exitCode = result.status ?? 2;
    return result.status === 0;
  }
  if (paths.length > 0 && paths.every((path) => path.endsWith(".md"))) {
    if (!check(process.execPath, ["scripts/checks/check-documentation.mjs"]))
      return;
    check(process.execPath, [
      "scripts/tasks/project-status.mjs",
      "--check",
      "docs/status.md",
    ]);
    return;
  }
  if (
    spawnSync("sh", ["-c", "command -v pnpm"], {
      cwd: root,
      stdio: "ignore",
    }).status !== 0
  )
    throw new Error("pnpm is unavailable; pre-commit checks did not run");
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const steps = manifest.scripts?.["check:fast"]?.split(" && ");
  if (!steps || steps.filter((step) => step === "pnpm lint").length !== 1)
    throw new Error("Unsupported check:fast entry; commit checks did not run");
  const broadLint = new Set([
    "biome.json",
    "biome.jsonc",
    "package.json",
    "pnpm-lock.yaml",
    ".node-version",
  ]);
  if (paths.length > 0 && !paths.some((path) => broadLint.has(path)))
    steps[steps.indexOf("pnpm lint")] =
      "pnpm exec biome check --staged --no-errors-on-unmatched";
  check("sh", ["-c", steps.join(" && ")]);
}

function run() {
  const [mode, ...args] = process.argv.slice(2);
  if (
    !modes.has(mode) ||
    (args.length !== 0 && (args[0] !== "--root" || args.length !== 2))
  )
    throw new Error(
      "Usage: node scripts/git-hooks.mjs install|uninstall|status|check [--root path]",
    );
  const requestedRoot = resolve(args[1] ?? process.cwd());
  function git(arguments_, allowMissing = false) {
    const result = spawnSync("git", arguments_, {
      cwd: requestedRoot,
      encoding: "utf8",
    });
    if (result.error || result.signal)
      throw new Error(
        `Git unavailable: ${result.error?.message ?? result.signal}`,
      );
    if (result.status !== 0 && !(allowMissing && result.status === 1))
      throw new Error(`Git ${arguments_[0]} failed: ${result.stderr.trim()}`);
    return result.status === 0 ? result.stdout.replace(/\n$/, "") : null;
  }
  const root = git(["rev-parse", "--show-toplevel"]);
  if (mode === "check") {
    checkCommit(root);
    return;
  }
  const worktreeConfig =
    git(
      ["config", "--local", "--bool", "--get", "extensions.worktreeConfig"],
      true,
    ) === "true";
  const scope = worktreeConfig ? "--worktree" : "--local";
  const metadata = git([
    "rev-parse",
    "--path-format=absolute",
    worktreeConfig ? "--absolute-git-dir" : "--git-common-dir",
  ]);
  const managedDirectory = join(metadata, "d-pi-hooks");
  const statePath = join(managedDirectory, "state.json");
  const state = existsSync(statePath)
    ? JSON.parse(readFileSync(statePath, "utf8"))
    : null;
  const effective = git(["config", "--path", "--get", "core.hooksPath"], true);

  if (
    state &&
    (!Array.isArray(state.previousLocalValues) ||
      state.previousLocalValues.some((value) => typeof value !== "string") ||
      (state.previousConfiguredPath !== null &&
        typeof state.previousConfiguredPath !== "string") ||
      (state.previousDefaultPath !== null &&
        typeof state.previousDefaultPath !== "string") ||
      (state.previousConfiguredPath === null &&
        state.previousDefaultPath === null))
  )
    throw new Error(
      "Invalid d-pi hook installation record; repository configuration is unchanged",
    );
  if (
    state &&
    (state.version !== 1 || state.root !== root || state.scope !== scope)
  )
    throw new Error(
      "Existing d-pi hook installation belongs to another checkout or configuration scope; keep it intact",
    );
  if (state && effective !== managedDirectory)
    throw new Error(
      "core.hooksPath changed since d-pi hooks were installed; refusing to overwrite the user's current configuration",
    );

  if (mode === "status") {
    console.log(
      state
        ? `ACTIVE: d-pi pre-commit for ${root}; original hooks forwarded; ${managedDirectory}`
        : `NOT INSTALLED: d-pi hooks; current hooksPath ${effective ?? "Git default"}`,
    );
    return;
  }
  if (mode === "uninstall") {
    if (!state) {
      console.log("NOT INSTALLED: nothing to remove");
      return;
    }
    git(["config", scope, "--unset-all", "core.hooksPath"], true);
    for (const value of state.previousLocalValues)
      git(["config", scope, "--add", "core.hooksPath", value]);
    rmSync(managedDirectory, { recursive: true });
    console.log(
      "REMOVED: d-pi hooks; restored the original repository configuration",
    );
    return;
  }

  const sourceHook = join(root, ".githooks/pre-commit");
  if (
    !existsSync(sourceHook) ||
    !statSync(sourceHook).isFile() ||
    !(statSync(sourceHook).mode & 0o111)
  )
    throw new Error(
      "Versioned .githooks/pre-commit is missing or not executable",
    );
  if (!state && existsSync(managedDirectory))
    throw new Error(
      `Unmanaged path already exists: ${managedDirectory}; refusing to overwrite it`,
    );
  if (!state && effective === managedDirectory)
    throw new Error(
      "hooksPath points at d-pi metadata without an installation record; refusing to create a forwarding loop",
    );

  const previousLocal = state
    ? null
    : git(["config", scope, "--null", "--get-all", "core.hooksPath"], true);
  const current = state ?? {
    version: 1,
    root,
    scope,
    previousLocalValues:
      previousLocal === null ? [] : previousLocal.split("\0").slice(0, -1),
    previousConfiguredPath: effective,
    previousDefaultPath:
      effective === null
        ? git(["rev-parse", "--path-format=absolute", "--git-path", "hooks"])
        : null,
  };
  const previous =
    current.previousConfiguredPath ?? current.previousDefaultPath;
  const previousForThisCheckout = isAbsolute(previous)
    ? previous
    : resolve(root, previous);
  const names = new Set(hooks);
  if (existsSync(previousForThisCheckout))
    for (const name of readdirSync(previousForThisCheckout))
      if (/^[\w-]+$/.test(name)) names.add(name);
  mkdirSync(managedDirectory, { recursive: true });
  for (const name of names) {
    const original = isAbsolute(previous)
      ? quote(join(previous, name))
      : `"$d_pi_root"/${quote(join(previous, name))}`;
    const body = [
      "#!/bin/sh",
      "set -eu",
      "d_pi_root=$(git rev-parse --show-toplevel)",
      `d_pi_original=${original}`,
      'if [ -x "$d_pi_original" ]; then',
      '  "$d_pi_original" "$@"',
      "fi",
      ...(name === "pre-commit"
        ? [
            `if [ "$d_pi_root" = ${quote(root)} ]; then`,
            '  if [ ! -x "$d_pi_root/.githooks/pre-commit" ]; then',
            '    printf "%s\\n" "FAIL: d-pi pre-commit unavailable in the installed checkout" >&2',
            "    exit 2",
            "  fi",
            '  exec "$d_pi_root/.githooks/pre-commit" "$@"',
            "fi",
          ]
        : []),
      "",
    ].join("\n");
    writeFileSync(join(managedDirectory, name), body);
    chmodSync(join(managedDirectory, name), 0o755);
  }
  writeFileSync(statePath, `${JSON.stringify(current, null, 2)}\n`);
  git(["config", scope, "--replace-all", "core.hooksPath", managedDirectory]);
  console.log(
    `INSTALLED: d-pi pre-commit for ${root}; original hooks forwarded; global Git configuration unchanged`,
  );
}

try {
  run();
} catch (error) {
  console.error(`FAIL: Git hook setup (${error.message})`);
  process.exitCode = 2;
}
