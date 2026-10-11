import { isAbsolute, join } from "node:path";
import { defineConfig } from "electron-vite";
import production from "../../electron.vite.config";

// Use the actual production entries/plugins/defines. Only output directories
// change so the active user's Dev output and SDK remain untouched.
export default defineConfig(async (environment) => {
  const root = process.env.D_PI_PERFORMANCE_ROOT;
  if (environment.command !== "build" || !root || !isAbsolute(root))
    throw Error(
      "An absolute isolated performance root and production build are required",
    );
  const config =
    typeof production === "function"
      ? await production(environment)
      : await production;
  return {
    ...config,
    main: {
      ...config.main,
      build: { ...config.main?.build, outDir: join(root, "out/main") },
    },
    preload: {
      ...config.preload,
      build: { ...config.preload?.build, outDir: join(root, "out/preload") },
    },
    renderer: {
      ...config.renderer,
      build: { ...config.renderer?.build, outDir: join(root, "out/renderer") },
    },
  };
});
