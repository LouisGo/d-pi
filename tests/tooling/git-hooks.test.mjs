import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { createTestEnvironment } from "../../scripts/testing/test-environment.mjs";

const root = resolve(import.meta.dirname, "../..");
const installer = join(root, "scripts/git-hooks.mjs");

function fixture(t) {
  const sandbox = createTestEnvironment({ prefix: "d-pi-hook-" });
  t.after(() => sandbox.cleanup());
  const directory = join(sandbox.cwd, "checkout's path");
  const bin = join(sandbox.root, "bin");
  const log = join(sandbox.root, "hooks.log");
  mkdirSync(directory);
  mkdirSync(bin);
  const env = {
    ...sandbox.env,
    PATH: `${bin}:${sandbox.env.PATH}`,
    D_PI_FIXTURE_LOG: log,
  };
  function write(path, contents) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents);
    chmodSync(path, 0o755);
  }
  write(
    join(directory, ".githooks/pre-commit"),
    "#!/bin/sh\nexec pnpm check:fast\n",
  );
  write(
    join(bin, "pnpm"),
    '#!/bin/sh\n[ "$1" = "check:fast" ] || exit 99\nprintf "fast\\n" >> "$D_PI_FIXTURE_LOG"\nexit "${D_PI_FIXTURE_CHECK_EXIT:-0}"\n',
  );
  function git(args, extra = {}, cwd = directory) {
    return spawnSync("git", args, {
      cwd,
      env: { ...env, ...extra },
      encoding: "utf8",
    });
  }
  assert.equal(git(["init", "--initial-branch=fixture"]).status, 0);
  function install(mode = "install") {
    return spawnSync(process.execPath, [installer, mode, "--root", directory], {
      cwd: directory,
      env,
      encoding: "utf8",
    });
  }
  function commit(extra = {}, cwd = directory) {
    return git(
      [
        "-c",
        "user.name=Fixture",
        "-c",
        "user.email=fixture@example.invalid",
        "commit",
        "--allow-empty",
        "-m",
        "fixture",
      ],
      extra,
      cwd,
    );
  }
  const lines = () =>
    existsSync(log) ? readFileSync(log, "utf8").trim().split("\n") : [];
  return { sandbox, directory, env, log, write, git, install, commit, lines };
}

function versionedFixture(t) {
  const f = fixture(t);
  f.write(
    join(f.directory, ".githooks/pre-commit"),
    readFileSync(join(root, ".githooks/pre-commit"), "utf8"),
  );
  f.write(join(f.directory, "scripts/git-hooks.mjs"), readFileSync(installer));
  f.write(
    join(f.directory, "package.json"),
    JSON.stringify({
      scripts: {
        "check:fast":
          "pnpm lint && pnpm check:documentation && pnpm check:status",
      },
    }),
  );
  for (const [path, label] of [
    ["scripts/checks/check-documentation.mjs", "docs"],
    ["scripts/tasks/project-status.mjs", "status"],
  ])
    f.write(
      join(f.directory, path),
      `import { appendFileSync } from 'node:fs';\nappendFileSync(process.env.D_PI_FIXTURE_LOG, '${label}\\n');\nprocess.exit(Number(process.env.D_PI_FIXTURE_${label.toUpperCase()}_EXIT ?? 0));\n`,
    );
  f.write(
    join(f.sandbox.root, "bin/pnpm"),
    `#!/bin/sh
if [ "$1" = "check:fast" ]; then
  exec node -e "const fs = require('node:fs'); const cp = require('node:child_process'); process.exitCode = cp.spawnSync('sh', ['-c', JSON.parse(fs.readFileSync('package.json')).scripts['check:fast']], { stdio: 'inherit' }).status ?? 2;"
fi
printf "%s\\n" "$*" >> "$D_PI_FIXTURE_LOG"
case "$1" in
  check:documentation) exec node scripts/checks/check-documentation.mjs ;;
  check:status) exec node scripts/tasks/project-status.mjs --check docs/status.md ;;
esac
exit "\${D_PI_FIXTURE_CHECK_EXIT:-0}"
`,
  );
  assert.equal(f.install().status, 0);
  return f;
}

test("documentation-only commits run docs/status without pnpm or unrelated code gates", (t) => {
  const f = versionedFixture(t);
  f.write(join(f.directory, "README.md"), "# Updated docs\n");
  f.write(join(f.directory, "unstaged.js"), "invalid code\n");
  assert.equal(f.git(["add", "README.md"]).status, 0);
  const result = f.commit({ D_PI_FIXTURE_CHECK_EXIT: "9" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.deepEqual(f.lines(), ["docs", "status"]);
});

test("documentation failures reject the commit and stop before status", (t) => {
  const f = versionedFixture(t);
  f.write(join(f.directory, "README.md"), "# Docs\n");
  assert.equal(f.git(["add", "README.md"]).status, 0);
  const result = f.commit({ D_PI_FIXTURE_DOCS_EXIT: "1" });
  assert.notEqual(result.status, 0);
  assert.notEqual(f.git(["rev-parse", "--verify", "HEAD"]).status, 0);
  assert.deepEqual(f.lines(), ["docs"]);
});

test("status failures also reject documentation-only commits", (t) => {
  const f = versionedFixture(t);
  f.write(join(f.directory, "README.md"), "# Docs\n");
  assert.equal(f.git(["add", "README.md"]).status, 0);
  const result = f.commit({ D_PI_FIXTURE_STATUS_EXIT: "1" });
  assert.notEqual(result.status, 0);
  assert.notEqual(f.git(["rev-parse", "--verify", "HEAD"]).status, 0);
  assert.deepEqual(f.lines(), ["docs", "status"]);
});

test("mixed code commits retain all fast gates with staged Biome scope", (t) => {
  const f = versionedFixture(t);
  f.write(join(f.directory, "README.md"), "# Docs\n");
  f.write(join(f.directory, "feature.js"), "export const value = 1;\n");
  assert.equal(f.git(["add", "README.md", "feature.js"]).status, 0);
  const result = f.commit();
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.deepEqual(f.lines(), [
    "exec biome check --staged --no-errors-on-unmatched",
    "check:documentation",
    "docs",
    "check:status",
    "status",
  ]);
});

test("a code rename to Markdown still enters the code gate and can reject the commit", (t) => {
  const f = versionedFixture(t);
  f.write(join(f.directory, "old.js"), "export const value = 1;\n");
  assert.equal(f.git(["add", "old.js"]).status, 0);
  assert.equal(f.commit().status, 0);
  writeFileSync(f.log, "");
  assert.equal(f.git(["mv", "old.js", "renamed.md"]).status, 0);
  const result = f.commit({ D_PI_FIXTURE_CHECK_EXIT: "1" });
  assert.notEqual(result.status, 0);
  assert.deepEqual(f.lines(), [
    "exec biome check --staged --no-errors-on-unmatched",
  ]);
});

test("toolchain or Biome configuration changes preserve full Biome checks", (t) => {
  const f = versionedFixture(t);
  f.write(join(f.directory, "biome.json"), "{}\n");
  assert.equal(f.git(["add", "biome.json"]).status, 0);
  const result = f.commit();
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.deepEqual(f.lines(), [
    "lint",
    "check:documentation",
    "docs",
    "check:status",
    "status",
  ]);
});

test("an unsupported fast entry rejects code commits before running gates", (t) => {
  const f = versionedFixture(t);
  f.write(
    join(f.directory, "package.json"),
    JSON.stringify({ scripts: { "check:fast": "pnpm check:status" } }),
  );
  f.write(join(f.directory, "feature.js"), "export const value = 1;\n");
  assert.equal(f.git(["add", "feature.js"]).status, 0);
  const result = f.commit();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unsupported check:fast/);
  assert.deepEqual(f.lines(), []);
});

test("the installed fast hook really prevents a commit when checks fail", (t) => {
  const f = fixture(t);
  const installed = f.install();
  assert.equal(installed.status, 0, installed.stderr || installed.stdout);
  const failed = f.commit({ D_PI_FIXTURE_CHECK_EXIT: "1" });
  assert.notEqual(failed.status, 0);
  assert.notEqual(
    f.git(["rev-parse", "--verify", "HEAD"]).status,
    0,
    "a rejected hook must not create a commit",
  );
  assert.deepEqual(f.lines(), ["fast"]);
  const passed = f.commit();
  assert.equal(passed.status, 0, passed.stderr || passed.stdout);
  assert.deepEqual(f.lines(), ["fast", "fast"]);
});

test("chains existing hooks and preserves global configuration and hook files", (t) => {
  const f = fixture(t);
  const previous = join(f.sandbox.home, "original's hooks");
  const original = '#!/bin/sh\nprintf "original\\n" >> "$D_PI_FIXTURE_LOG"\n';
  f.write(join(previous, "pre-commit"), original);
  f.write(
    join(previous, "post-commit"),
    '#!/bin/sh\nprintf "post\\n" >> "$D_PI_FIXTURE_LOG"\n',
  );
  assert.equal(
    f.git(["config", "--global", "core.hooksPath", previous]).status,
    0,
  );
  const globalConfig = readFileSync(join(f.sandbox.home, ".gitconfig"), "utf8");
  assert.equal(f.install().status, 0);
  assert.equal(f.install().status, 0, "reinstall must not nest wrappers");
  const committed = f.commit();
  assert.equal(committed.status, 0, committed.stderr || committed.stdout);
  assert.deepEqual(f.lines(), ["original", "fast", "post"]);
  assert.equal(readFileSync(join(previous, "pre-commit"), "utf8"), original);
  assert.equal(
    readFileSync(join(f.sandbox.home, ".gitconfig"), "utf8"),
    globalConfig,
  );
  const removed = f.install("uninstall");
  assert.equal(removed.status, 0, removed.stderr || removed.stdout);
  assert.equal(
    f.git(["config", "--local", "--get", "core.hooksPath"]).status,
    1,
  );
  assert.equal(
    f.git(["config", "--get", "core.hooksPath"]).stdout.trim(),
    previous,
  );
  assert.equal(f.commit().status, 0);
  assert.deepEqual(f.lines(), ["original", "fast", "post", "original", "post"]);
});

test("a rejecting original hook stops the commit before the new fast check", (t) => {
  const f = fixture(t);
  f.write(
    join(f.directory, ".git/hooks/pre-commit"),
    '#!/bin/sh\nprintf "original\\n" >> "$D_PI_FIXTURE_LOG"\nexit 7\n',
  );
  assert.equal(f.install().status, 0);
  assert.notEqual(f.commit().status, 0);
  assert.deepEqual(f.lines(), ["original"]);
});

test("uninstall restores a previous local relative hooksPath", (t) => {
  const f = fixture(t);
  const previous = "local hooks";
  f.write(
    join(f.directory, previous, "pre-commit"),
    '#!/bin/sh\nprintf "local\\n" >> "$D_PI_FIXTURE_LOG"\n',
  );
  assert.equal(
    f.git(["config", "--local", "core.hooksPath", previous]).status,
    0,
  );
  assert.equal(f.install().status, 0);
  assert.equal(f.commit().status, 0);
  assert.deepEqual(f.lines(), ["local", "fast"]);
  assert.equal(f.install("uninstall").status, 0);
  assert.equal(
    f.git(["config", "--local", "--get", "core.hooksPath"]).stdout.trim(),
    previous,
  );
});

test("forwarding preserves significant trailing whitespace in a configured hook path", (t) => {
  const f = fixture(t);
  const previous = "local hooks ";
  f.write(
    join(f.directory, previous, "pre-commit"),
    '#!/bin/sh\nprintf "local\\n" >> "$D_PI_FIXTURE_LOG"\n',
  );
  assert.equal(
    f.git(["config", "--local", "core.hooksPath", previous]).status,
    0,
  );
  assert.equal(f.install().status, 0);
  assert.equal(f.commit().status, 0);
  assert.deepEqual(f.lines(), ["local", "fast"]);
});

test("later user configuration changes are never overwritten by reinstall or uninstall", (t) => {
  const f = fixture(t);
  assert.equal(f.install().status, 0);
  assert.equal(
    f.git(["config", "--local", "core.hooksPath", "user-selected-hooks"])
      .status,
    0,
  );
  for (const mode of ["install", "uninstall"]) {
    const result = f.install(mode);
    assert.equal(result.status, 2);
    assert.match(`${result.stdout}${result.stderr}`, /hooksPath changed/);
    assert.equal(
      f.git(["config", "--local", "--get", "core.hooksPath"]).stdout.trim(),
      "user-selected-hooks",
    );
  }
});

test("other linked checkouts keep their original hooks without receiving this checkout's fast gate", (t) => {
  const f = fixture(t);
  assert.equal(f.install().status, 0);
  assert.equal(f.commit().status, 0);
  const other = join(f.sandbox.cwd, "old-worktree");
  const added = f.git(["worktree", "add", "--detach", other]);
  assert.equal(added.status, 0, added.stderr || added.stdout);
  const committed = f.commit({ D_PI_FIXTURE_CHECK_EXIT: "9" }, other);
  assert.equal(committed.status, 0, committed.stderr || committed.stdout);
  assert.deepEqual(f.lines(), ["fast"]);
});

test("forwarded receive hooks still work from Git's metadata cwd", (t) => {
  const f = fixture(t);
  f.write(
    join(f.directory, ".git/hooks/pre-receive"),
    '#!/bin/sh\nprintf "receive\\n" >> "$D_PI_FIXTURE_LOG"\n',
  );
  assert.equal(f.install().status, 0);
  const installedPath = f
    .git(["config", "--local", "--get", "core.hooksPath"])
    .stdout.trim();
  const received = spawnSync(join(installedPath, "pre-receive"), [], {
    cwd: join(f.directory, ".git"),
    env: { ...f.env, GIT_DIR: "." },
    encoding: "utf8",
  });
  assert.equal(received.status, 0, received.stderr || received.stdout);
  assert.deepEqual(f.lines(), ["receive"]);
});

test("existing worktree configuration is restored in its original scope", (t) => {
  const f = fixture(t);
  assert.equal(
    f.git(["config", "--local", "extensions.worktreeConfig", "true"]).status,
    0,
  );
  assert.equal(
    f.git(["config", "--worktree", "core.hooksPath", "private-hooks"]).status,
    0,
  );
  assert.equal(f.install().status, 0);
  assert.equal(f.commit().status, 0);
  assert.deepEqual(f.lines(), ["fast"]);
  assert.equal(f.install("uninstall").status, 0);
  assert.equal(
    f.git(["config", "--worktree", "--get", "core.hooksPath"]).stdout.trim(),
    "private-hooks",
  );
  assert.equal(
    f.git(["config", "--local", "--get", "core.hooksPath"]).status,
    1,
  );
});

test("a malformed installation record cannot clear repository configuration", (t) => {
  const f = fixture(t);
  assert.equal(f.install().status, 0);
  const installedPath = f
    .git(["config", "--local", "--get", "core.hooksPath"])
    .stdout.trim();
  const statePath = join(installedPath, "state.json");
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  state.previousLocalValues = null;
  writeFileSync(statePath, JSON.stringify(state));
  const removed = f.install("uninstall");
  assert.equal(removed.status, 2);
  assert.equal(
    f.git(["config", "--local", "--get", "core.hooksPath"]).stdout.trim(),
    installedPath,
  );
});

test("the versioned hook names a missing pnpm as tooling unavailable", () => {
  const sandbox = createTestEnvironment();
  try {
    const result = spawnSync("sh", [join(root, ".githooks/pre-commit")], {
      cwd: root,
      env: sandbox.env,
      encoding: "utf8",
    });
    assert.equal(result.status, 2);
    assert.match(`${result.stdout}${result.stderr}`, /pnpm.*unavailable/);
  } finally {
    sandbox.cleanup();
  }
});
