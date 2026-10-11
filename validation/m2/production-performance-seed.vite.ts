import { isAbsolute, join, resolve } from "node:path";
import { defineConfig } from "electron-vite";

const root = process.env.D_PI_PERFORMANCE_ROOT;
if (!root || !isAbsolute(root))
  throw Error("Missing isolated performance root");
export default defineConfig({
  main: {
    build: {
      outDir: join(root, "out/seed"),
      externalizeDeps: false,
      rollupOptions: {
        input: {
          "production-performance-seed": resolve(
            "validation/m2/production-performance-seed.ts",
          ),
          "session-host": resolve("src/app/host/index.ts"),
          "subagent-worker": resolve("src/app/host/subagent-worker.ts"),
        },
      },
    },
  },
});
