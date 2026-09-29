import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const roots = ["src/app/renderer"];
const modulesRoot = "src/modules";
if (existsSync(modulesRoot)) {
  for (const entry of readdirSync(modulesRoot, { withFileTypes: true })) {
    if (entry.isDirectory() && existsSync(join(modulesRoot, entry.name, "renderer")))
      roots.push(join(modulesRoot, entry.name, "renderer"));
  }
}

const result = spawnSync("oxlint", ["-c", ".oxlintrc.json", ...roots], {
  stdio: "inherit",
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
