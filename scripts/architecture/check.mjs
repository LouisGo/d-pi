import { builtinModules } from "node:module";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, extname, relative, resolve, sep } from "node:path";
import { createScanner, LanguageVariant, SyntaxKind } from "typescript/unstable/ast";

const SOURCE_EXTENSIONS = new Set([".cjs", ".cts", ".js", ".jsx", ".mjs", ".mts", ".ts", ".tsx"]);
const ENVIRONMENTS = new Set([
  "contracts",
  "core",
  "main",
  "host",
  "renderer",
  "preload",
  "node",
  "omp",
  "shared",
]);
const ALLOWED_SAME_MODULE = {
  contracts: new Set(["contracts"]),
  core: new Set(["contracts", "core"]),
  main: new Set(["contracts", "core", "main"]),
  host: new Set(["contracts", "core", "host"]),
  renderer: new Set(["contracts", "core", "renderer"]),
  preload: new Set(["contracts", "preload"]),
  node: new Set(["node"]),
  omp: new Set(["omp"]),
  shared: new Set(["shared"]),
};
const BUILTINS = new Set(builtinModules.flatMap((value) => [value, `node:${value}`]));
const HEADLESS_VENDOR = /^(?:electron|react(?:$|\/)|react-dom(?:$|\/)|@tiptap\/|@base-ui\/|@hugeicons\/|monaco-editor(?:$|\/))/;
const LEGACY_ROOTS = [
  "src/features/",
  "src/main/",
  "src/host/",
  "src/renderer/",
  "src/preload/",
];

function usage(message) {
  throw new Error(`${message}\nUsage: node scripts/architecture/check.mjs --config architecture/modules.json [--root .]`);
}

function parseArgs(argv) {
  const result = { root: process.cwd(), config: resolve(process.cwd(), "architecture/modules.json") };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--root") result.root = resolve(argv[++index] ?? usage("missing --root"));
    else if (argument === "--config") result.config = resolve(argv[++index] ?? usage("missing --config"));
    else if (argument === "--help") {
      console.log("Usage: node scripts/architecture/check.mjs --config architecture/modules.json [--root .]");
      process.exit(0);
    } else usage(`unknown argument: ${argument}`);
  }
  return result;
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`ARCH-MANIFEST: cannot read ${path}: ${error.message}`);
  }
}

function pathKey(path) {
  return path.split(sep).join("/");
}

function relativePath(root, path) {
  return pathKey(relative(root, path));
}

function isWithin(path, directory) {
  const value = relative(directory, path);
  return value === "" || (!value.startsWith(`..${sep}`) && value !== "..");
}

function sourceFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return SOURCE_EXTENSIONS.has(extname(entry.name)) ? [path] : [];
  });
}

function isTestFile(path) {
  return /(?:\.test|\.spec)\.[cm]?[jt]sx?$/.test(path) || /(?:^|[/\\])tests?(?:[/\\]|$)/.test(path);
}

function resolveFile(candidate) {
  const extensions = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];
  const candidates = [candidate, ...extensions.map((extension) => `${candidate}${extension}`)];
  for (const path of candidates) if (existsSync(path) && !path.endsWith(sep)) return resolve(path);
  for (const extension of extensions) {
    const path = resolve(candidate, `index${extension}`);
    if (existsSync(path)) return resolve(path);
  }
  return null;
}

function resolveSpecifier(specifier, importer, root) {
  const clean = specifier.split("?")[0];
  if (clean.startsWith(".")) return resolveFile(resolve(dirname(importer), clean));
  if (clean.startsWith("src/")) return resolveFile(resolve(root, clean));
  if (clean.startsWith("@/")) return resolveFile(resolve(root, "src/app/renderer", clean.slice(2)));
  if (clean.startsWith("@modules/")) return resolveFile(resolve(root, "src/modules", clean.slice("@modules/".length)));
  return null;
}

function tokenise(path) {
  const text = readFileSync(path, "utf8");
  const variant = path.endsWith(".tsx") || path.endsWith(".jsx") ? LanguageVariant.JSX : LanguageVariant.Standard;
  const scanner = createScanner(true, variant, text, 0, text.length);
  const tokens = [];
  let token;
  do {
    token = scanner.scan();
    tokens.push({ kind: token, text: scanner.getTokenText(), value: scanner.getTokenValue() });
  } while (token !== SyntaxKind.EndOfFile);
  return tokens;
}

function stringToken(token) {
  return token?.kind === SyntaxKind.StringLiteral ? token.value : null;
}

function importsOf(path, config) {
  const imports = [];
  const errors = [];
  let tokens;
  try {
    tokens = tokenise(path);
  } catch (error) {
    return { imports, errors: [`ARCH-PARSE: ${path}: ${error.message}`] };
  }
  const allowedDynamic = (config.unresolved?.dynamicImports ?? []).map((value) => new RegExp(value));
  const addDynamicError = (specifier) => {
    if (!allowedDynamic.some((pattern) => pattern.test(path) || (specifier && pattern.test(specifier)))) errors.push(`ARCH-NONLITERAL-IMPORT: ${path} has a non-literal dynamic import`);
  };
  const scanStatementEnd = (start) => {
    for (let index = start; index < tokens.length; index += 1) {
      if (tokens[index].kind === SyntaxKind.SemicolonToken || tokens[index].kind === SyntaxKind.EndOfFile) return index;
    }
    return tokens.length;
  };
  for (let index = 0; index < tokens.length; index += 1) {
    const current = tokens[index];
    if (current.kind === SyntaxKind.ImportKeyword) {
      const next = tokens[index + 1];
      if (next?.kind === SyntaxKind.OpenParenToken) {
        const specifier = stringToken(tokens[index + 2]);
        if (specifier) imports.push({ specifier, kind: "dynamic-import" });
        else addDynamicError();
        continue;
      }
      const sideEffectSpecifier = stringToken(next);
      if (sideEffectSpecifier) {
        imports.push({ specifier: sideEffectSpecifier, kind: "import" });
        continue;
      }
      const end = scanStatementEnd(index + 1);
      for (let cursor = index + 1; cursor < end; cursor += 1) {
        if (tokens[cursor].kind === SyntaxKind.FromKeyword) {
          const specifier = stringToken(tokens[cursor + 1]);
          if (specifier) imports.push({ specifier, kind: "import" });
          break;
        }
      }
      continue;
    }
    if (current.kind === SyntaxKind.ExportKeyword) {
      const end = scanStatementEnd(index + 1);
      for (let cursor = index + 1; cursor < end; cursor += 1) {
        if (tokens[cursor].kind === SyntaxKind.FromKeyword) {
          const specifier = stringToken(tokens[cursor + 1]);
          if (specifier) imports.push({ specifier, kind: "export" });
          break;
        }
      }
      continue;
    }
    if (current.kind === SyntaxKind.Identifier && current.text === "require" && tokens[index + 1]?.kind === SyntaxKind.OpenParenToken) {
      const specifier = stringToken(tokens[index + 2]);
      if (specifier) imports.push({ specifier, kind: "require" });
      else errors.push(`ARCH-NONLITERAL-IMPORT: ${path} has a non-literal require`);
    }
  }
  return { imports, errors };
}

function configuredModules(root, config) {
  if (config.version !== 1 || !config.modules || typeof config.modules !== "object") throw new Error("ARCH-MANIFEST: expected version 1 and a modules object");
  return Object.entries(config.modules).map(([name, value]) => {
    const moduleRoot = resolve(root, value.root);
    return {
      name,
      root: moduleRoot,
      environments: new Set(value.environments ?? []),
      defaultEnvironment: value.defaultEnvironment,
      public: new Set((value.public ?? []).map((path) => resolve(moduleRoot, path))),
      testPublic: new Set((value.testPublic ?? []).map((path) => resolve(moduleRoot, path))),
      dependsOn: value.dependsOn ?? [],
      testDependsOn: value.testDependsOn ?? [],
    };
  });
}

function allowedDependencies(module, environment, sourceTest) {
  const values = [];
  const add = (dependencies) => {
    if (Array.isArray(dependencies)) values.push(...dependencies);
    else values.push(...(dependencies?.[environment] ?? []));
  };
  add(module.dependsOn);
  if (sourceTest) add(module.testDependsOn);
  return new Set(values);
}

function isAllowedUnresolved(config, specifier) {
  return (config.unresolved?.allowed ?? []).some((value) => new RegExp(value).test(specifier));
}

function main() {
  const { root, config: configPath } = parseArgs(process.argv.slice(2));
  const config = readJson(configPath);
  const exceptionsPath = resolve(root, config.exceptions ?? "architecture/exceptions.json");
  const exceptions = existsSync(exceptionsPath) ? readJson(exceptionsPath) : { exceptions: [] };
  const modules = configuredModules(root, config);
  const sourceRoots = (config.sourceRoots ?? ["src"]).map((path) => resolve(root, path));
  const ownedRoots = (config.ownedRoots ?? []).map((path) => resolve(root, path));
  const errors = [];
  const files = new Map();
  const graph = new Map();
  const exceptionMatches = (id, from, to) => (exceptions.exceptions ?? []).some((entry) =>
    (entry.rules ?? ["*"]).some((rule) => rule === "*" || rule === id) &&
    new RegExp(entry.from).test(from) && new RegExp(entry.to).test(to),
  );
  const report = (id, message, from = "", to = "") => {
    if (!exceptionMatches(id, from, to)) errors.push(`${id}: ${message}`);
  };

  for (const module of modules) {
    if (!existsSync(module.root)) report("ARCH-MANIFEST", `${module.name} root is missing: ${relativePath(root, module.root)}`);
    if (module.environments.size === 0 || [...module.environments].some((value) => !ENVIRONMENTS.has(value))) report("ARCH-MANIFEST", `${module.name} has invalid environments`);
    if (module.defaultEnvironment && !module.environments.has(module.defaultEnvironment)) report("ARCH-MANIFEST", `${module.name} has invalid default environment`);
    for (const publicPath of module.public) {
      if (!isWithin(publicPath, module.root) || !existsSync(publicPath)) report("ARCH-PUBLIC-ENTRY", `${module.name} public entry is missing: ${relativePath(root, publicPath)}`);
    }
    for (const publicPath of module.testPublic) {
      if (!isWithin(publicPath, module.root) || !existsSync(publicPath)) report("ARCH-TEST-PUBLIC-ENTRY", `${module.name} test public entry is missing: ${relativePath(root, publicPath)}`);
    }
    const dependencies = [
      ...(Array.isArray(module.dependsOn) ? module.dependsOn : Object.values(module.dependsOn).flat()),
      ...(Array.isArray(module.testDependsOn) ? module.testDependsOn : Object.values(module.testDependsOn).flat()),
    ];
    for (const dependency of new Set(dependencies)) {
      if (!modules.some((candidate) => candidate.name === dependency)) report("ARCH-MODULE-CONFIG", `${module.name} depends on unknown module ${dependency}`);
    }
    for (const path of sourceFiles(module.root)) {
      const firstSegment = relativePath(module.root, path).split("/")[0];
      files.set(path, {
        module,
        environment: module.environments.has(firstSegment)
          ? firstSegment
          : module.defaultEnvironment ?? firstSegment,
      });
      graph.set(path, []);
    }
  }

  for (const sourcePath of new Set(sourceRoots.flatMap((sourceRoot) => sourceFiles(sourceRoot)))) {
    if (files.has(sourcePath) || ownedRoots.some((ownedRoot) => isWithin(sourcePath, ownedRoot))) continue;
    const sourceRelative = relativePath(root, sourcePath);
    report("ARCH-UNOWNED", `${sourceRelative} is outside configured modules and owned roots`, sourceRelative);
  }

  for (const [sourcePath, sourceInfo] of files) {
    const sourceRelative = relativePath(root, sourcePath);
    const sourceTest = isTestFile(sourcePath);
    if (!sourceInfo.module.environments.has(sourceInfo.environment)) {
      report("ARCH-ENVIRONMENT", `${sourceRelative} is not inside a declared environment`, sourceRelative);
      continue;
    }
    const parsed = importsOf(sourcePath, config);
    for (const error of parsed.errors) {
      const separator = error.indexOf(":");
      const id = separator < 0 ? "ARCH-PARSE" : error.slice(0, separator);
      const message = separator < 0 ? error : error.slice(separator + 1).trim();
      report(id, message, sourceRelative);
    }
    for (const { specifier } of parsed.imports) {
      const headless = (BUILTINS.has(specifier) || HEADLESS_VENDOR.test(specifier)) && ["contracts", "core"].includes(sourceInfo.environment);
      const rendererProcess = sourceInfo.environment === "renderer" && (BUILTINS.has(specifier) || specifier === "electron");
      if (!sourceTest && (headless || rendererProcess)) report("ARCH-ENVIRONMENT", `${sourceRelative} imports ${specifier}`, sourceRelative, specifier);
      const target = resolveSpecifier(specifier, sourcePath, root);
      if (!target) {
        if (specifier.startsWith(".") || specifier.startsWith("src/") || specifier.startsWith("@/") || specifier.startsWith("@modules/")) {
          if (!isAllowedUnresolved(config, specifier)) report("ARCH-UNRESOLVED", `${sourceRelative} cannot resolve ${specifier}`, sourceRelative, specifier);
        }
        continue;
      }
      const targetRelative = relativePath(root, target);
      if (/(?:\.test|\.spec)\.[cm]?[jt]sx?$/.test(target) && !sourceTest) report("ARCH-TEST-IMPORT", `${sourceRelative} imports test code ${targetRelative}`, sourceRelative, targetRelative);
      const targetInfo = files.get(target);
      if (!targetInfo) {
        if (LEGACY_ROOTS.some((prefix) => targetRelative.startsWith(prefix))) report("ARCH-LEGACY-IMPORT", `${sourceRelative} imports legacy source: ${targetRelative}`, sourceRelative, targetRelative);
        continue;
      }
      graph.get(sourcePath).push(target);
      if (targetInfo.module.name === sourceInfo.module.name) {
        if (!ALLOWED_SAME_MODULE[sourceInfo.environment]?.has(targetInfo.environment)) report("ARCH-ENVIRONMENT", `${sourceRelative} imports ${targetRelative} across ${sourceInfo.environment} -> ${targetInfo.environment}`, sourceRelative, targetRelative);
        continue;
      }
      if (!allowedDependencies(sourceInfo.module, sourceInfo.environment, sourceTest).has(targetInfo.module.name)) report("ARCH-DEPENDENCY", `${sourceInfo.module.name}/${sourceInfo.environment} cannot depend on ${targetInfo.module.name}: ${sourceRelative} -> ${targetRelative}`, sourceRelative, targetRelative);
      const targetPublic = [...targetInfo.module.public].some((path) => path === target) || (sourceTest && [...targetInfo.module.testPublic].some((path) => path === target));
      if (!targetPublic) report("ARCH-PRIVATE-IMPORT", `${sourceRelative} imports private ${targetRelative}`, sourceRelative, targetRelative);
    }
  }

  const visiting = new Set();
  const visited = new Set();
  const stack = [];
  const visit = (path) => {
    if (visiting.has(path)) {
      const cycle = [...stack.slice(stack.indexOf(path)), path].map((item) => relativePath(root, item)).join(" -> ");
      report("ARCH-CYCLE", cycle, relativePath(root, path), cycle);
      return;
    }
    if (visited.has(path)) return;
    visiting.add(path);
    stack.push(path);
    for (const target of graph.get(path) ?? []) visit(target);
    stack.pop();
    visiting.delete(path);
    visited.add(path);
  };
  for (const path of graph.keys()) visit(path);

  const uniqueErrors = [...new Set(errors)];
  if (uniqueErrors.length > 0) {
    for (const error of uniqueErrors) console.error(error);
    process.exitCode = 1;
    return;
  }
  console.log(`PASS: architecture boundaries (${files.size} source files checked, TypeScript scanner)`);
}

main();
