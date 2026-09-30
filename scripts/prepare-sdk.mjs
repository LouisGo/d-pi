import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cp,
  mkdir,
  readdir,
  readFile,
  realpath,
  symlink,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";

const require = createRequire(import.meta.url);
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
const root = resolve("resources/sdk");
await mkdir(join(root, "node_modules", "@oh-my-pi"), { recursive: true });
const source = await realpath("node_modules/@oh-my-pi/pi-coding-agent");
const store = resolve("node_modules/.pnpm");
const copied = new Set();
async function copyPackage(path) {
  const actual = await realpath(path);
  const rel = relative(store, actual);
  if (rel.startsWith("..")) throw Error("SDK dependency outside managed store");
  const unit = rel.split("/")[0];
  if (copied.has(unit)) return;
  copied.add(unit);
  const base = join(store, unit);
  await cp(base, join(root, "node_modules/.pnpm", unit), {
    recursive: true,
    verbatimSymlinks: true,
  });
  const modules = join(base, "node_modules");
  for (const entry of await readdir(modules, { withFileTypes: true })) {
    if (entry.name.startsWith("@")) {
      for (const item of await readdir(join(modules, entry.name), {
        withFileTypes: true,
      })) {
        if (item.isSymbolicLink())
          await copyPackage(join(modules, entry.name, item.name));
      }
    } else if (entry.isSymbolicLink())
      await copyPackage(join(modules, entry.name));
  }
}
const lockHash = createHash("sha256")
  .update(await readFile("pnpm-lock.yaml"))
  .digest("hex");
// Refresh the locked graph too, so this command repairs missing SDK resources.
await copyPackage(source);
for (const name of ["pi-coding-agent", "pi-utils"]) {
  const packageSource = await realpath(`node_modules/@oh-my-pi/${name}`);
  const link = join(root, "node_modules/@oh-my-pi", name);
  try {
    await symlink(
      relative(
        dirname(link),
        join(root, "node_modules/.pnpm", relative(store, packageSource)),
      ),
      link,
    );
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
}
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
await cp("runtime/configuration.mjs", join(root, "configuration.mjs"));
await cp("runtime/BUN-LICENSE.md", join(root, "BUN-LICENSE.md"));
const hashes = {};
for (const name of ["bun", "host.mjs", "gate.js", "configuration.mjs"])
  hashes[name] = createHash("sha256")
    .update(await readFile(join(root, name)))
    .digest("hex");
await writeFile(
  join(root, "manifest.json"),
  JSON.stringify(
    {
      lockHash,
      sdkVersion: versions["@oh-my-pi/pi-coding-agent"],
      bunVersion: versions.bun,
      platform: `${process.platform}-${process.arch}`,
      hashes,
    },
    null,
    2,
  ),
);
console.log(
  `Prepared unchanged official SDK ${versions["@oh-my-pi/pi-coding-agent"]}: ${copied.size} dependency units`,
);
