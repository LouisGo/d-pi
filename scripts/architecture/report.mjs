import { existsSync, readdirSync, readFileSync } from "node:fs";
import { extname, relative, resolve } from "node:path";

const sourceExtensions = new Set([".cjs", ".cts", ".js", ".jsx", ".mjs", ".mts", ".ts", ".tsx"]);
const projectRoot = process.cwd();
const config = JSON.parse(readFileSync(resolve(projectRoot, "architecture/modules.json"), "utf8"));

function sourceFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return sourceExtensions.has(extname(entry.name)) ? [path] : [];
  });
}

function lineCount(path) {
  const text = readFileSync(path, "utf8");
  return text.length === 0 ? 0 : text.replace(/\r\n?/g, "\n").split("\n").length - 1;
}

function isWithin(parent, child) {
  const value = relative(parent, child);
  return value === "" || (!value.startsWith("..") && !value.startsWith("/"));
}

function isTestFile(path) {
  return /(?:\.test|\.spec)\.[cm]?[jt]sx?$/.test(path) ||
    /(?:^|[/\\])tests?(?:[/\\]|$)/.test(path);
}

const rows = Object.entries(config.modules ?? {}).map(([name, module]) => {
  const root = resolve(projectRoot, module.root);
  const files = sourceFiles(root);
  return {
    name,
    root: module.root,
    environments: module.environments ?? [],
    defaultEnvironment: module.defaultEnvironment,
    materialized: module.materialized !== false,
    files: files.length,
    lines: files.reduce((total, path) => total + lineCount(path), 0),
    publicEntries: (module.public ?? []).map((entry) => ({
      path: `${module.root}/${entry}`,
      exists: existsSync(resolve(root, entry)),
    })),
    testPublicEntries: (module.testPublic ?? []).map((entry) => ({
      path: `${module.root}/${entry}`,
      exists: existsSync(resolve(root, entry)),
    })),
  };
});

const sourceRoots = (config.sourceRoots ?? ["src"]).map((path) => resolve(projectRoot, path));
const ownedRoots = (config.ownedRoots ?? []).map((path) => resolve(projectRoot, path));
const allSource = [...new Set(sourceRoots.flatMap((sourceRoot) => sourceFiles(sourceRoot)))];
const moduleRoots = rows.map((row) => resolve(projectRoot, row.root));
const coveredSource = allSource.filter((path) =>
  moduleRoots.some((moduleRoot) => isWithin(moduleRoot, path)) ||
  ownedRoots.some((ownedRoot) => isWithin(ownedRoot, path)),
);
const unownedSource = allSource
  .filter((path) => !coveredSource.includes(path))
  .map((path) => relative(projectRoot, path).replaceAll("\\", "/"))
  .sort();
const exceptionsPath = resolve(projectRoot, "architecture/exceptions.json");
const exceptions = existsSync(exceptionsPath)
  ? JSON.parse(readFileSync(exceptionsPath, "utf8")).exceptions ?? []
  : [];
const hints = [];

for (const row of rows) {
  const moduleRoot = resolve(projectRoot, row.root);
  for (const path of sourceFiles(moduleRoot)) {
    const firstSegment = relative(moduleRoot, path).split(/[\\/]/)[0] ?? "unknown";
    const environment = row.environments.includes(firstSegment)
      ? firstSegment
      : row.defaultEnvironment ?? firstSegment;
    const limit = isTestFile(path) ? 800 : environment === "main" || environment === "host" ? 300 : 300;
    const lines = lineCount(path);
    if (lines > limit) hints.push(`${relative(projectRoot, path).replaceAll("\\", "/")}: ${lines} lines (hint ${limit})`);
  }
}

console.log("Domain structure report");
for (const row of rows) {
  const state = row.materialized ? "materialized" : "planned";
  console.log(`${row.name}\t${state}\t${row.files} files\t${row.lines} lines\t${row.root}`);
  for (const entry of row.publicEntries) console.log(`  ${entry.exists ? "ok" : "missing"}\t${entry.path}`);
  for (const entry of row.testPublicEntries) console.log(`  ${entry.exists ? "ok" : "missing"}\ttest-only ${entry.path}`);
}
console.log(`coverage\t${coveredSource.length}/${allSource.length}\tconfigured-source-files\tunowned=${unownedSource.length}`);
console.log(`exceptions\t${exceptions.length}\tarchitecture/exceptions.json`);
if (exceptions.length > 0) {
  for (const exception of exceptions) console.log(`  transition\t${exception.removeBy}\t${exception.from} -> ${exception.to}`);
}
if (unownedSource.length > 0) {
  console.log("unowned-source:");
  for (const path of unownedSource) console.log(`  ${path}`);
}
if (hints.length > 0) {
  console.log("size-hints:");
  for (const hint of hints.sort()) console.log(`  ${hint}`);
}
