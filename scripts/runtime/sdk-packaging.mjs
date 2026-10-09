import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  cp,
  lstat,
  mkdir,
  readdir,
  readFile,
  realpath,
  rm,
  symlink,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve, sep } from "node:path";

export const SDK_SIZE_LIMIT = 650 * 1024 * 1024;
export const APP_SIZE_LIMIT = 1000 * 1024 * 1024;

function inside(root, path) {
  return path === root || path.startsWith(`${root}${sep}`);
}

function matches(values, target) {
  if (!values || values.length === 0) return true;
  return (
    !values.includes(`!${target}`) &&
    (values.includes("any") ||
      !values.some((value) => !value.startsWith("!")) ||
      values.includes(target))
  );
}

function compatible(metadata, target) {
  return (
    matches(metadata.os, target.platform) && matches(metadata.cpu, target.arch)
  );
}

function baselineOnly(metadata, target) {
  return (
    metadata.name === "@oh-my-pi/pi-natives-linux-x64" &&
    metadata.version === "18.4.6" &&
    target.platform === "linux" &&
    target.arch === "x64"
  );
}

async function requireBaseline(packagePath) {
  const baseline = await lstat(
    join(packagePath, "pi_natives.linux-x64-baseline.node"),
  ).catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (!baseline?.isFile())
    throw Error("Fixed Linux SDK baseline native addon is missing or unsafe");
}

async function digest(path) {
  const hash = createHash("sha256");
  for await (const bytes of createReadStream(path)) hash.update(bytes);
  return hash.digest("hex");
}

async function distributionSize(path) {
  const stat = await lstat(path);
  if (stat.isFile()) return { files: 1, bytes: stat.size };
  const result = { files: 0, bytes: 0 };
  if (stat.isDirectory()) {
    for (const name of await readdir(path)) {
      const child = await distributionSize(join(path, name));
      result.files += child.files;
      result.bytes += child.bytes;
    }
  }
  return result;
}

// Rules concern distribution files, never upstream executable source or binary
// rewriting. Unknown layouts are retained; budgets force upgrade-time review.
function excluded(metadata, path, target) {
  if (/(?:^|\/)[^/]*(?:license|licence|copying|notice)[^/]*$/i.test(path))
    return null;
  if (/\.map$/.test(path)) return "source-map";
  // The fixed official loader tries baseline after modern on AVX2 CPUs,
  // and baseline first on older CPUs. Ship one portable, unmodified addon.
  if (
    baselineOnly(metadata, target) &&
    path === "pi_natives.linux-x64-modern.node"
  )
    return "optional-cpu-variant";
  // OMP imports src/tools/browser/declarations.d.ts as a text asset. Source
  // declarations can be runtime resources; only prune distribution types.
  if (/\.d\.(?:ts|mts|cts)$/.test(path) && !/(?:^|\/)src\//.test(path))
    return "type-declaration";
  if (
    metadata.name === "@oh-my-pi/pi-coding-agent" &&
    metadata.version === "18.4.6" &&
    path === "dist/cli.js"
  )
    return "cli-bundle";
  if (metadata.name === "onnxruntime-node") {
    const parts = path.split("/");
    if (
      parts[0] === "bin" &&
      parts[1] === "napi-v6" &&
      parts.length >= 3 &&
      (parts[2] !== target.platform ||
        (parts.length >= 4 && parts[3] !== target.arch))
    )
      return "foreign-native";
  }
  return null;
}

/** Copy packages, not entire pnpm store units (which include unrelated peers). */
export async function copySdkDependencyGraph(
  sources,
  storePath,
  destination,
  target = { platform: process.platform, arch: process.arch },
) {
  const store = await realpath(storePath);
  const copied = new Map();
  const omitted = [];
  const removed = {};
  const runtimeAdditions = [];
  async function copyPackage(source, optional = false) {
    let actual;
    try {
      actual = await realpath(source);
    } catch (error) {
      if (optional && error.code === "ENOENT") return null;
      throw error;
    }
    if (!inside(store, actual))
      throw Error("SDK dependency outside managed store");
    if (copied.has(actual)) return copied.get(actual);
    const metadata = JSON.parse(
      await readFile(join(actual, "package.json"), "utf8"),
    );
    if (!compatible(metadata, target)) {
      if (!optional)
        throw Error(
          `Required SDK dependency has incompatible platform: ${metadata.name}`,
        );
      omitted.push(`${metadata.name}@${metadata.version}`);
      return null;
    }
    const rel = relative(store, actual);
    const [unit, modules] = rel.split(sep);
    if (modules !== "node_modules") throw Error("Unexpected SDK store layout");
    const packagePath = join(destination, "node_modules/.pnpm", rel);
    if (baselineOnly(metadata, target)) await requireBaseline(actual);
    const record = {
      name: metadata.name,
      version: metadata.version,
      path: packagePath,
    };
    copied.set(actual, record); // Cycles keep the same resolved package identity.
    await cp(actual, packagePath, {
      recursive: true,
      verbatimSymlinks: true,
      filter: async (path) => {
        const reason = excluded(
          metadata,
          relative(actual, path).split(sep).join("/"),
          target,
        );
        if (!reason) return true;
        const stat = await distributionSize(path);
        const count = (removed[reason] ??= { files: 0, bytes: 0 });
        count.files += stat.files;
        count.bytes += stat.bytes;
        return false;
      },
    });
    if (
      metadata.name === "onnxruntime-node" &&
      metadata.version === "1.30.0" &&
      target.platform === "darwin"
    ) {
      const native = join(
        packagePath,
        "bin/napi-v6",
        target.platform,
        target.arch,
      );
      const versioned = join(native, "libonnxruntime.1.30.0.dylib");
      const alias = join(native, "libonnxruntime.1.dylib");
      // npm ships two ordinary files with the same bytes. dyld loads the .1
      // path; retain it as a relative alias, without stripping the binary.
      const stat = await lstat(alias).catch((error) => {
        if (error.code === "ENOENT") return null;
        throw error;
      });
      const original = await lstat(versioned).catch((error) => {
        if (error.code === "ENOENT") return null;
        throw error;
      });
      if (
        stat?.isFile() &&
        original?.isFile() &&
        stat.size === original.size &&
        (await digest(alias)) === (await digest(versioned))
      ) {
        await rm(alias);
        await symlink("libonnxruntime.1.30.0.dylib", alias);
        removed["duplicate-native"] = { files: 1, bytes: stat.size };
      }
    }
    const dependencies = new Map();
    for (const name of Object.keys(metadata.peerDependencies ?? {}))
      dependencies.set(
        name,
        metadata.peerDependenciesMeta?.[name]?.optional === true,
      );
    for (const name of Object.keys(metadata.dependencies ?? {}))
      dependencies.set(name, false);
    for (const name of Object.keys(metadata.optionalDependencies ?? {}))
      dependencies.set(name, true);
    // 4.3.0's node bundles import onnxruntime-common but omit it from their
    // manifest. Resolve that one installed, locked dependency explicitly;
    // copying the entire hoisted store would reintroduce development packages.
    const additional =
      metadata.name === "@huggingface/transformers" &&
      metadata.version === "4.3.0" &&
      !dependencies.has("onnxruntime-common");
    if (additional) {
      dependencies.set("onnxruntime-common", false);
      runtimeAdditions.push({
        package: `${metadata.name}@${metadata.version}`,
        dependency: "onnxruntime-common",
      });
    }
    for (const [name, optionalDependency] of dependencies) {
      let dependencyPath = join(store, unit, "node_modules", name);
      if (additional && name === "onnxruntime-common") {
        dependencyPath = join(store, "node_modules", name);
        const packageRoot = await realpath(dependencyPath);
        const entry = createRequire(join(actual, "package.json")).resolve(name);
        if (!inside(packageRoot, await realpath(entry)))
          throw Error("Unexpected Transformers ONNX common resolution");
      }
      const dependency = await copyPackage(dependencyPath, optionalDependency);
      if (!dependency) continue;
      const link = join(
        destination,
        "node_modules/.pnpm",
        unit,
        "node_modules",
        name,
      );
      if (link === dependency.path) continue;
      await mkdir(dirname(link), { recursive: true });
      try {
        await symlink(relative(dirname(link), dependency.path), link);
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
      }
    }
    return record;
  }
  for (const source of sources) await copyPackage(source);
  // Existing host resolution uses root-level OMP family links.
  for (const record of copied.values()) {
    if (!record.name.startsWith("@oh-my-pi/")) continue;
    const link = join(destination, "node_modules", record.name);
    await mkdir(dirname(link), { recursive: true });
    await symlink(relative(dirname(link), record.path), link);
  }
  return {
    packages: copied.size,
    omitted: [...new Set(omitted)].sort(),
    removed,
    runtimeAdditions,
  };
}

/** Logical bytes, without following links or double counting their targets. */
export async function measureTree(directory) {
  const root = await realpath(directory);
  let bytes = 0;
  let files = 0;
  let links = 0;
  const top = {};
  async function visit(path, group) {
    const stat = await lstat(path);
    if (stat.isSymbolicLink()) {
      const target = await realpath(path); // Broken links fail, even optional ones.
      if (!inside(root, target))
        throw Error(`Resource link escapes root: ${relative(root, path)}`);
      links++;
    } else if (stat.isDirectory()) {
      for (const name of (await readdir(path)).sort())
        await visit(join(path, name), group ?? name);
    } else if (stat.isFile()) {
      bytes += stat.size;
      files++;
      top[group] = (top[group] ?? 0) + stat.size;
    }
  }
  await visit(root);
  return { bytes, files, links, top };
}

export async function auditSdkTree(
  directory,
  target = { platform: process.platform, arch: process.arch },
) {
  const root = resolve(directory);
  const units = join(root, "node_modules/.pnpm");
  for (const unit of await readdir(units)) {
    const modules = join(units, unit, "node_modules");
    for (const entry of await readdir(modules, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const packages = entry.name.startsWith("@")
        ? (await readdir(join(modules, entry.name), { withFileTypes: true }))
            .filter((item) => item.isDirectory())
            .map((item) => join(modules, entry.name, item.name))
        : [join(modules, entry.name)];
      for (const packagePath of packages) {
        const metadata = JSON.parse(
          await readFile(join(packagePath, "package.json"), "utf8"),
        );
        if (!compatible(metadata, target))
          throw Error(`Foreign SDK package: ${metadata.name}`);
        if (baselineOnly(metadata, target)) await requireBaseline(packagePath);
        async function inspect(path) {
          for (const item of await readdir(path, { withFileTypes: true })) {
            const file = join(path, item.name);
            if (
              excluded(
                metadata,
                relative(packagePath, file).split(sep).join("/"),
                target,
              )
            )
              throw Error(
                `Unexpected SDK distribution file: ${relative(root, file)}`,
              );
            if (item.isDirectory()) await inspect(file);
          }
        }
        await inspect(packagePath);
      }
    }
  }
  const report = await measureTree(root);
  if (report.bytes > SDK_SIZE_LIMIT)
    throw Error(`SDK exceeds ${SDK_SIZE_LIMIT} byte budget: ${report.bytes}`);
  return report;
}
