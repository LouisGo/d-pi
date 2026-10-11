import { resolve } from "node:path";
import { defineConfig } from "electron-vite";

// Independent validation output; production entrypoints remain unchanged.
export default defineConfig({
  main: {
    build: {
      outDir: resolve("out/native-warm"),
      externalizeDeps: false,
      rollupOptions: {
        input: {
          "native-warm": resolve("validation/m2/native-warm.ts"),
          "subagent-worker": resolve("src/app/host/subagent-worker.ts"),
          "session-host": resolve("src/app/host/index.ts"),
        },
      },
    },
  },
});
