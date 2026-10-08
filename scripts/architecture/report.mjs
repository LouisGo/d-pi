import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, extname, relative, resolve } from "node:path";
import { scanArchitecture } from "./check.mjs";

const sourceExtensions = new Set([
  ".cjs",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".mts",
  ".ts",
  ".tsx",
]);
const sizeHintExtensions = new Set([...sourceExtensions, ".css"]);
const args = process.argv.slice(2);
const options = {};
for (let index = 0; index < args.length; index += 1) {
  const argument = args[index];
  if (["--root", "--write", "--check"].includes(argument)) {
    if (!args[index + 1]) throw new Error(`Missing value for ${argument}`);
    options[argument.slice(2)] = resolve(args[++index]);
  } else if (argument === "--json") options.json = true;
  else throw new Error(`Unknown report option: ${argument}`);
}
if ([options.write, options.check, options.json].filter(Boolean).length > 1)
  throw new Error("Choose one of --write, --check, or --json");
const projectRoot = options.root ?? process.cwd();
const print = (...values) => {
  if (!options.write && !options.check && !options.json) console.log(...values);
};
const config = JSON.parse(
  readFileSync(resolve(projectRoot, "architecture/modules.json"), "utf8"),
);

function sourceFiles(directory, extensions = sourceExtensions) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path, extensions);
    return extensions.has(extname(entry.name)) ? [path] : [];
  });
}

function lineCount(path) {
  const text = readFileSync(path, "utf8");
  return text.length === 0
    ? 0
    : text.replace(/\r\n?/g, "\n").split("\n").length - 1;
}

function isWithin(parent, child) {
  const value = relative(parent, child);
  return value === "" || (!value.startsWith("..") && !value.startsWith("/"));
}

function isTestFile(path) {
  return (
    /(?:\.test|\.spec)\.[cm]?[jt]sx?$/.test(path) ||
    /(?:^|[/\\])tests?(?:[/\\]|$)/.test(path)
  );
}

function isProcessEntry(path) {
  const relativePath = relative(projectRoot, path).replaceAll("\\", "/");
  return /^(?:src\/app\/(?:main|host|preload)\/index|src\/app\/renderer\/main)\.(?:[cm])?(?:js|jsx|ts|tsx)$/.test(
    relativePath,
  );
}

function sizeHintFor(path) {
  if (isTestFile(path)) return { category: "test", limit: 800 };
  if (extname(path) === ".css") return { category: "css", limit: 500 };
  if (isProcessEntry(path)) return { category: "entry", limit: 150 };
  return { category: "production", limit: 300 };
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

const sourceRoots = (config.sourceRoots ?? ["src"]).map((path) =>
  resolve(projectRoot, path),
);
const ownedRoots = (config.ownedRoots ?? []).map((path) =>
  resolve(projectRoot, path),
);
const allSource = [
  ...new Set(sourceRoots.flatMap((sourceRoot) => sourceFiles(sourceRoot))),
];
const moduleRoots = rows.map((row) => resolve(projectRoot, row.root));
const checkedSource = allSource.filter((path) =>
  moduleRoots.some((moduleRoot) => isWithin(moduleRoot, path)),
);
const ownedOnlySource = allSource.filter(
  (path) =>
    !checkedSource.includes(path) &&
    ownedRoots.some((ownedRoot) => isWithin(ownedRoot, path)),
);
const coveredSource = [...new Set([...checkedSource, ...ownedOnlySource])];
const unownedSource = allSource
  .filter((path) => !coveredSource.includes(path))
  .map((path) => relative(projectRoot, path).replaceAll("\\", "/"))
  .sort();
const exceptionsPath = resolve(projectRoot, "architecture/exceptions.json");
const exceptions = existsSync(exceptionsPath)
  ? (JSON.parse(readFileSync(exceptionsPath, "utf8")).exceptions ?? [])
  : [];
const hints = [];

for (const row of rows) {
  const moduleRoot = resolve(projectRoot, row.root);
  for (const path of sourceFiles(moduleRoot, sizeHintExtensions)) {
    const { category, limit } = sizeHintFor(path);
    const lines = lineCount(path);
    if (lines > limit) {
      hints.push(
        `${relative(projectRoot, path).replaceAll("\\", "/")}: ${lines} lines (${category} hint ${limit})`,
      );
    }
  }
}

print("Domain structure report");
for (const row of rows) {
  const state = row.materialized ? "materialized" : "planned";
  print(
    `${row.name}\t${state}\t${row.files} files\t${row.lines} lines\t${row.root}`,
  );
  for (const entry of row.publicEntries)
    print(`  ${entry.exists ? "ok" : "missing"}\t${entry.path}`);
  for (const entry of row.testPublicEntries)
    print(`  ${entry.exists ? "ok" : "missing"}\ttest-only ${entry.path}`);
}
print(
  `ownership\t${coveredSource.length}/${allSource.length}\tall-source-files\tunowned=${unownedSource.length}`,
);
print(
  `checked\t${checkedSource.length}/${allSource.length}\tconfigured-module-files\towned-only=${ownedOnlySource.length}`,
);
print(`exceptions\t${exceptions.length}\tarchitecture/exceptions.json`);
if (exceptions.length > 0) {
  for (const exception of exceptions)
    print(
      `  transition\t${exception.removeBy}\t${exception.from} -> ${exception.to}`,
    );
}
if (unownedSource.length > 0) {
  print("unowned-source:");
  for (const path of unownedSource) print(`  ${path}`);
}
if (ownedOnlySource.length > 0) {
  print("owned-only-source:");
  for (const path of ownedOnlySource
    .map((value) => relative(projectRoot, value).replaceAll("\\", "/"))
    .sort())
    print(`  ${path}`);
}
if (hints.length > 0) {
  print("size-hints:");
  for (const hint of hints.sort()) print(`  ${hint}`);
}

const scan = scanArchitecture(projectRoot, config);
print("allowed-dependencies:");
for (const [name, module] of Object.entries(config.modules ?? {})) {
  for (const environment of module.environments ?? []) {
    const dependencies = Array.isArray(module.dependsOn)
      ? module.dependsOn
      : (module.dependsOn?.[environment] ?? []);
    for (const dependency of dependencies)
      print(`  ${name}/${environment} -> ${dependency}`);
    const testDependencies = Array.isArray(module.testDependsOn)
      ? module.testDependsOn
      : (module.testDependsOn?.[environment] ?? []);
    for (const dependency of testDependencies)
      print(`  test-only ${name}/${environment} -> ${dependency}`);
  }
}
print("actual-dependencies:");
const actual = [
  ...new Set(
    scan.imports
      .filter(
        (entry) =>
          entry.resolution === "module" &&
          entry.sourceModule !== entry.targetModule,
      )
      .map(
        (entry) =>
          `${entry.test ? "test-only " : ""}${entry.sourceModule}/${entry.sourceEnvironment} -> ${entry.targetModule}/${entry.targetEnvironment}`,
      ),
  ),
];
for (const dependency of actual.sort()) print(`  ${dependency}`);
print("unresolved-imports:");
for (const entry of scan.imports.filter(
  (entry) => entry.resolution === "unresolved",
))
  print(
    `  ${entry.from} -> ${entry.specifier} (${entry.allowed ? "allowed" : "not allowed"})`,
  );
print("unparsed-imports:");
for (const entry of scan.unparsed)
  print(
    `  ${entry.from}: non-literal ${entry.kind} (${entry.allowed ? "allowed" : "not allowed"})`,
  );
print(
  `scanner\t${scan.files.length} files\t${scan.imports.length} imports\t${scan.errors.length} boundary errors`,
);
for (const error of scan.errors) print(`  ${error}`);

// The snapshot contains observations and permissions separately. Hash every
// scanned source and the scanner itself so equal line counts cannot hide drift.
const inputs = [
  ...sourceRoots.flatMap((root) => sourceFiles(root, sizeHintExtensions)),
  resolve(projectRoot, "architecture/modules.json"),
  ...(existsSync(exceptionsPath) ? [exceptionsPath] : []),
].sort();
const hash = createHash("sha256");
for (const path of inputs)
  hash
    .update(relative(projectRoot, path))
    .update("\0")
    .update(readFileSync(path))
    .update("\0");
for (const name of ["check.mjs", "report.mjs", "../checks/source-tokens.mjs"])
  hash.update(name).update(readFileSync(resolve(import.meta.dirname, name)));
const allowedDependencies = [];
for (const [name, module] of Object.entries(config.modules ?? {})) {
  for (const environment of module.environments ?? []) {
    const permissions = Array.isArray(module.dependsOn)
      ? module.dependsOn
      : (module.dependsOn?.[environment] ?? []);
    for (const dependency of permissions)
      allowedDependencies.push({
        module: name,
        environment,
        dependency,
        testOnly: false,
      });
    const testPermissions = Array.isArray(module.testDependsOn)
      ? module.testDependsOn
      : (module.testDependsOn?.[environment] ?? []);
    for (const dependency of testPermissions)
      allowedDependencies.push({
        module: name,
        environment,
        dependency,
        testOnly: true,
      });
  }
}
const dependencyRows = scan.imports
  .filter(
    (entry) =>
      entry.resolution === "module" &&
      entry.sourceModule !== entry.targetModule,
  )
  .map((entry) => ({
    module: entry.sourceModule,
    environment: entry.sourceEnvironment,
    dependency: entry.targetModule,
    targetEnvironment: entry.targetEnvironment,
    testOnly: entry.test,
  }));
const snapshot = {
  version: 1,
  inputsHash: hash.digest("hex"),
  scanner: "TypeScript lexical scanner; literal import/export/require only",
  coverage: {
    sourceFiles: allSource.length,
    scannedFiles: scan.files.length,
    unscanned: [
      ...ownedOnlySource.map((path) =>
        relative(projectRoot, path).replaceAll("\\", "/"),
      ),
      ...unownedSource,
    ].sort(),
  },
  modules: rows,
  allowedDependencies,
  actualDependencies: [
    ...new Map(
      dependencyRows.map((row) => [JSON.stringify(row), row]),
    ).values(),
  ],
  imports: scan.imports,
  unparsedImports: scan.unparsed,
  exceptions: { declared: exceptions, applied: scan.appliedExceptions },
  boundaryErrors: scan.errors,
};
const generated = `${JSON.stringify(snapshot, null, 2)}\n`;
if (options.json) process.stdout.write(generated);
if (options.write) {
  mkdirSync(dirname(options.write), { recursive: true });
  writeFileSync(options.write, generated);
  process.stdout.write(`Generated structure report: ${options.write}\n`);
}
if (options.check) {
  if (!existsSync(options.check)) {
    process.stderr.write(
      `FAIL: missing generated report: ${options.check}; regenerate with --write.\n`,
    );
    process.exitCode = 1;
  } else if (readFileSync(options.check, "utf8") !== generated) {
    process.stderr.write(
      `STALE: ${options.check}; regenerate with --write after reviewing current source and permissions.\n`,
    );
    process.exitCode = 1;
  } else process.stdout.write("PASS: generated structure report is current\n");
}
