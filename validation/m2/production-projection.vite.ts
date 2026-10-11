import { isAbsolute, join, resolve } from "node:path";
import { defineConfig } from "vite";

const root = process.env.D_PI_PERFORMANCE_ROOT;
if (!root || !isAbsolute(root)) throw Error("Missing owned performance root");
export default defineConfig({
  build: {
    ssr: resolve("validation/m2/production-projection.ts"),
    outDir: join(root, "out/projection"),
    rollupOptions: { output: { format: "es" } },
    minify: false,
  },
  ssr: { noExternal: true },
});
