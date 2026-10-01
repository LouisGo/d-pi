import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import tailwindcss from "@tailwindcss/vite";
import { build } from "vite";
import { runOxlint } from "../../scripts/architecture/oxlint-runner.mjs";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const checker = join(repositoryRoot, "scripts/checks/check-i18n-copy.mjs");

function fixture(contents, baseDirectory = tmpdir()) {
  const directory = mkdtempSync(join(baseDirectory, "d-pi-tooling-coverage-"));
  for (const [relativePath, source] of Object.entries(contents)) {
    const path = join(directory, relativePath);
    mkdirSync(resolve(path, ".."), { recursive: true });
    writeFileSync(path, source);
  }
  return directory;
}

test("i18n copy check scans migrated module Renderer files", () => {
  const directory = fixture({
    "src/app/renderer/clean.tsx": "export const clean = true;\n",
    "src/modules/files/renderer/visible.tsx":
      "export function Visible() { return <span>中文文案</span>; }\n",
  });
  const result = spawnSync(process.execPath, [checker, "--root", directory], {
    encoding: "utf8",
  });
  rmSync(directory, { recursive: true, force: true });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /visible\.tsx/);
});

test("Tailwind source configuration includes migrated Renderer roots", () => {
  const source = readFileSync(
    join(repositoryRoot, "src/app/renderer/styles/tokens.css"),
    "utf8",
  );
  assert.match(source, /@source [^;]*modules\/\*\*\/renderer/);
});

test("design lint executes against a migrated module Renderer root", () => {
  const directory = fixture({
    "src/modules/files/renderer/invalid.tsx":
      'export function Invalid() { return <div style={{ color: "red" }} />; }\n',
  });
  const result = runOxlint({
    args: [
      "-c",
      join(repositoryRoot, ".oxlintrc.json"),
      join(directory, "src/modules/files/renderer"),
    ],
    cwd: repositoryRoot,
  });
  rmSync(directory, { recursive: true, force: true });
  // A crashed or missing oxlint exits non-zero with no output, which would
  // otherwise satisfy "the gate failed". The tool must actually have run.
  assert.equal(
    result.kind,
    "ran",
    `design lint did not run (${result.kind}: ${result.reason ?? ""})`,
  );
  assert.notEqual(result.status, 0);
  assert.match(result.output, /no-inline-styles/);
});

test("Tailwind emits a utility used only by a module Renderer", async () => {
  const directory = fixture(
    {
      "index.html":
        '<!doctype html><html><body><script type="module" src="/src/main.ts"></script></body></html>\n',
      "src/main.ts": 'import "./app/renderer/styles/tokens.css";\n',
      "src/app/renderer/styles/tokens.css": readFileSync(
        join(repositoryRoot, "src/app/renderer/styles/tokens.css"),
      ),
      "src/modules/files/renderer/utility.tsx":
        'export function Utility() { return <div className="bg-fuchsia-500" />; }\n',
    },
    join(repositoryRoot, ".scratch"),
  );
  try {
    await build({
      root: directory,
      logLevel: "silent",
      plugins: [tailwindcss()],
      build: {
        outDir: join(directory, "dist"),
        emptyOutDir: true,
        rollupOptions: { input: join(directory, "index.html") },
      },
    });
    const css = readdirSync(join(directory, "dist/assets"))
      .filter((name) => name.endsWith(".css"))
      .map((name) => readFileSync(join(directory, "dist/assets", name), "utf8"))
      .join("\n");
    assert.match(css, /\.bg-fuchsia-500\{/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
