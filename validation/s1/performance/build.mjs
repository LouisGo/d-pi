// Instrumentation-only build: unchanged product Renderer and real Main/IPC path.
// Never included by electron-builder. Only this build can disable diagnostics.
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve("vite"))("esbuild");
const output = resolve("out/s1-performance");
await mkdir(output, { recursive: true });
await cp("out/renderer", `${output}/renderer`, { recursive: true });
await mkdir(`${output}/main`, { recursive: true });
await mkdir(`${output}/preload`, { recursive: true });
let main = await readFile("src/main/index.ts", "utf8");
const helper = await readFile(
  "validation/s1/performance/main.fragment",
  "utf8",
);
main = main.replace(
  "app.whenReady().then(() => {",
  "app.whenReady().then(async () => {",
);
// Off-mode has no logger; keep the validation process normally quittable.
main = main.replace(
  "diagnostics?.close().finally(",
  "Promise.resolve(diagnostics?.close()).finally(",
);
main = main.replace(
  "    createWindow();\n  });",
  `${helper}\n    createWindow();\n  });`,
);
if (!main.includes("s1:begin"))
  throw new Error("Main instrumentation anchor missing");
await build({
  stdin: {
    loader: "ts",
    contents: main,
    resolveDir: resolve("src/main"),
    sourcefile: "s1-main.ts",
  },
  bundle: true,
  platform: "node",
  format: "esm",
  external: ["electron"],
  outfile: `${output}/main/index.js`,
});
const preload = await readFile("src/preload/index.ts", "utf8");
const probe = await readFile(
  "validation/s1/performance/preload.fragment",
  "utf8",
);
await build({
  stdin: {
    loader: "ts",
    contents: preload + "\n" + probe,
    resolveDir: resolve("src/preload"),
    sourcefile: "s1-preload.ts",
  },
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["electron"],
  outfile: `${output}/preload/index.cjs`,
});
await writeFile(
  `${output}/package.json`,
  JSON.stringify({
    name: "d-pi-s1-performance",
    type: "module",
    main: "main/index.js",
  }),
);
await build({
  entryPoints: ["validation/s1/performance/task.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: `${output}/task.mjs`,
});
console.log(output);
