import { existsSync, readdirSync, readFileSync } from "node:fs";
import { extname, resolve } from "node:path";

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
  return text.length === 0 ? 0 : text.split("\n").length;
}

const rows = Object.entries(config.modules ?? {}).map(([name, module]) => {
  const root = resolve(projectRoot, module.root);
  const files = sourceFiles(root);
  return {
    name,
    root: module.root,
    materialized: module.materialized !== false,
    files: files.length,
    lines: files.reduce((total, path) => total + lineCount(path), 0),
    publicEntries: (module.public ?? []).map((entry) => ({
      path: `${module.root}/${entry}`,
      exists: existsSync(resolve(root, entry)),
    })),
  };
});

console.log("Domain structure report");
for (const row of rows) {
  const state = row.materialized ? "materialized" : "planned";
  console.log(`${row.name}\t${state}\t${row.files} files\t${row.lines} lines\t${row.root}`);
  for (const entry of row.publicEntries) console.log(`  ${entry.exists ? "ok" : "missing"}\t${entry.path}`);
}
