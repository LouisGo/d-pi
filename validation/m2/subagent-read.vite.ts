import { resolve } from "node:path";
import { defineConfig } from "electron-vite";
export default defineConfig({
  main: {
    build: {
      outDir: resolve("out/subagent-read"),
      externalizeDeps: false,
      rollupOptions: {
        input: {
          "subagent-read": resolve("validation/m2/subagent-read.ts"),
          "subagent-worker": resolve("src/app/host/subagent-worker.ts"),
        },
      },
    },
  },
});
