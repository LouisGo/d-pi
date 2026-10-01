import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { inspectEnvironment } from "../../scripts/check-environment.mjs";

const root = resolve(import.meta.dirname, "../..");
const baseline = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

function lockfile(manifest) {
  const lines = ["lockfileVersion: '9.0'", "", "importers:", "", "  .:"];
  for (const section of ["dependencies", "devDependencies"]) {
    lines.push(`    ${section}:`);
    for (const [name, version] of Object.entries(manifest[section] ?? {}))
      lines.push(
        `      '${name}':`,
        `        specifier: ${version}`,
        `        version: ${version}(fixture-peer@1.0.0)`,
      );
  }
  return `${lines.join("\n")}\n`;
}

function fixture(t, edit, editLock = (text) => text) {
  const directory = mkdtempSync(join(tmpdir(), "d-pi-dependencies-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const manifest = structuredClone(baseline);
  edit(manifest);
  const files = {
    "package.json": JSON.stringify(manifest),
    ".node-version": process.versions.node,
    "pnpm-lock.yaml": editLock(lockfile(manifest)),
    "pnpm.cjs": `process.stdout.write(${JSON.stringify(manifest.packageManager.split("@")[1])});\n`,
  };
  for (const [name, version] of Object.entries({
    ...manifest.dependencies,
    ...manifest.devDependencies,
  }))
    files[`node_modules/${name}/package.json`] = JSON.stringify({
      name,
      version,
    });
  for (const [name, contents] of Object.entries(files)) {
    mkdirSync(dirname(join(directory, name)), { recursive: true });
    writeFileSync(join(directory, name), contents);
  }
  return inspectEnvironment(directory, {
    toolsOnly: true,
    pnpmCli: join(directory, "pnpm.cjs"),
  });
}

test("the fast environment gate accepts pinned required foundations and peer-qualified lock entries", (t) => {
  const report = fixture(t, () => {});
  assert.deepEqual(report.issues, []);
  assert.match(
    report.sdk.skipped,
    /native executables and SDK resources were not inspected/,
  );
});

test("deleting a confirmed foundation dependency cannot make the gate pass", (t) => {
  for (const name of [
    "zustand",
    "@tanstack/react-query",
    "zod",
    "ts-pattern",
    "@base-ui/react",
    "@tiptap/core",
    "@hugeicons/react",
    "monaco-editor",
  ]) {
    const report = fixture(t, (manifest) => {
      delete manifest.dependencies[name];
    });
    assert.ok(
      report.issues.some(
        (issue) => issue.includes("DEP-REQUIRED") && issue.includes(name),
      ),
      `${name} deletion was not rejected: ${report.issues.join("\n")}`,
    );
  }
});

test("foundation dependencies must be declared in their runtime or development section", (t) => {
  const report = fixture(t, (manifest) => {
    manifest.devDependencies.zustand = manifest.dependencies.zustand;
    delete manifest.dependencies.zustand;
  });
  assert.match(report.issues.join("\n"), /DEP-REQUIRED.*zustand.*dependencies/);
});

test("rejects ranges and the wrong Zod major", (t) => {
  const ranged = fixture(t, (manifest) => {
    manifest.dependencies.zustand = "^5.0.15";
  });
  assert.match(ranged.issues.join("\n"), /DEP-EXACT.*zustand/);
  const oldZod = fixture(t, (manifest) => {
    manifest.dependencies.zod = "3.25.0";
  });
  assert.match(oldZod.issues.join("\n"), /DEP-MAJOR.*zod.*4/);
});

test("rejects a stale lock specifier, resolved version or extra importer dependency", (t) => {
  const specifier = fixture(
    t,
    () => {},
    (text) => text.replace("specifier: 5.0.15", "specifier: 5.0.14"),
  );
  assert.match(specifier.issues.join("\n"), /DEP-LOCK.*zustand/);
  const version = fixture(
    t,
    () => {},
    (text) => text.replace("version: 5.0.15(", "version: 5.0.14("),
  );
  assert.match(version.issues.join("\n"), /DEP-LOCK.*zustand/);
  const extra = fixture(
    t,
    () => {},
    (text) =>
      `${text}      'untracked-tool':\n        specifier: 1.0.0\n        version: 1.0.0\n`,
  );
  assert.match(extra.issues.join("\n"), /DEP-LOCK.*untracked-tool/);
});

test("rejects inconsistent package families even when the lock agrees", (t) => {
  for (const [section, name] of [
    ["dependencies", "@tiptap/react"],
    ["dependencies", "react-dom"],
    ["devDependencies", "@tailwindcss/vite"],
    ["devDependencies", "@oh-my-pi/pi-utils"],
  ]) {
    const report = fixture(t, (manifest) => {
      manifest[section][name] = "9.9.9";
    });
    assert.ok(
      report.issues.some(
        (issue) => issue.includes("DEP-FAMILY") && issue.includes(name),
      ),
      `${name} mismatch was not rejected`,
    );
  }
});

test("an unsupported or unreadable lock cannot be reported as consistent", (t) => {
  for (const lock of [
    "{not-pnpm-yaml",
    "lockfileVersion: '10.0'\nimporters:\n  .:\n",
  ]) {
    const report = fixture(
      t,
      () => {},
      () => lock,
    );
    assert.match(report.issues.join("\n"), /DEP-LOCK-FORMAT/);
  }
});

test("pnpm 12 empty configDependencies preserves strict application dependency verification", (t) => {
  const report = fixture(
    t,
    () => {},
    (text) => text.replace("  .:", "  .:\n    configDependencies: {}"),
  );
  assert.deepEqual(report.issues, []);
  const unsupported = fixture(
    t,
    () => {},
    (text) =>
      text.replace(
        "  .:",
        "  .:\n    configDependencies:\n      fixture: 1.0.0",
      ),
  );
  assert.match(unsupported.issues.join("\n"), /DEP-LOCK-FORMAT/);
});

test("pnpm 12 manager document cannot hide an invalid application lock", (t) => {
  const manager =
    "---\nlockfileVersion: '9.0'\nimporters:\n  .:\n    configDependencies: {}\n    packageManagerDependencies:\n      pnpm:\n        specifier: 12.8.1\n        version: 12.8.1\npackages: {}\n---\n";
  assert.deepEqual(
    fixture(
      t,
      () => {},
      (text) => manager + text,
    ).issues,
    [],
  );
  assert.match(
    fixture(
      t,
      () => {},
      (text) =>
        manager + text.replace("specifier: 5.0.15", "specifier: 5.0.14"),
    ).issues.join("\n"),
    /DEP-LOCK.*zustand/,
  );
  assert.match(
    fixture(
      t,
      () => {},
      (text) => manager + text + "---\n" + text,
    ).issues.join("\n"),
    /DEP-LOCK-FORMAT/,
  );
});
