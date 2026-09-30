import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  reportOxlintResult,
  runOxlint,
} from "./architecture/oxlint-runner.mjs";

function parseOptions(argv) {
  const rootIndex = argv.indexOf("--root");
  const configIndex = argv.indexOf("--config");
  const root = resolve(
    rootIndex === -1 ? process.cwd() : (argv[rootIndex + 1] ?? process.cwd()),
  );
  const config = resolve(
    configIndex === -1
      ? join(root, ".oxlintrc.json")
      : (argv[configIndex + 1] ?? join(root, ".oxlintrc.json")),
  );
  return { root, config };
}

const { root, config } = parseOptions(process.argv.slice(2));
const roots = [join(root, "src/app/renderer")];
const modulesRoot = join(root, "src/modules");
if (existsSync(modulesRoot)) {
  for (const entry of readdirSync(modulesRoot, { withFileTypes: true })) {
    if (
      entry.isDirectory() &&
      existsSync(join(modulesRoot, entry.name, "renderer"))
    )
      roots.push(join(modulesRoot, entry.name, "renderer"));
  }
}

process.exitCode = reportOxlintResult(
  runOxlint({ args: ["-c", config, ...roots], cwd: root }),
);
