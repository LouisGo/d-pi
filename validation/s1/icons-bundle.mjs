import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { build } from "vite";

mkdirSync("out/icon-probe", { recursive: true });
writeFileSync(
  "out/icon-probe/entry.ts",
  "export {FolderIcon} from '../../src/renderer/components/icons/common';",
);
let retained = [];
await build({
  configFile: false,
  logLevel: "error",
  build: {
    write: false,
    minify: false,
    lib: { entry: resolve("out/icon-probe/entry.ts"), formats: ["es"] },
    rollupOptions: {
      external: ["react", "react/jsx-runtime"],
      plugins: [
        {
          name: "inspect-icons",
          generateBundle(_options, bundle) {
            for (const chunk of Object.values(bundle))
              if (chunk.type === "chunk")
                retained = Object.entries(chunk.modules)
                  .filter(
                    ([name, info]) =>
                      name.includes("core-free-icons") &&
                      info.renderedLength > 0,
                  )
                  .map(([name]) => name.split("/").at(-1));
          },
        },
      ],
    },
  },
});
assert.ok(retained.some((n) => n?.includes("Folder01")));
assert.ok(!retained.some((n) => n?.includes("Moon02") || n?.includes("Sun03")));
console.log(JSON.stringify({ retained, unusedExportsRemoved: true }));
