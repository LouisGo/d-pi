import assert from "node:assert/strict";
import {
  constants,
  cpSync,
  mkdirSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { createTestEnvironment } from "../../scripts/testing/test-environment.mjs";
import { acquireSdkResourceGuard } from "../../src/platform/omp/resources/sdk-resource-guard.ts";

// Prepare resources through `pnpm runtime:sdk` first. Never overwrite another
// runtime's resource tree or inherit the user's provider credentials/config.
const isolation = createTestEnvironment({ prefix: "d-pi-production-perf-" });
const resources = join(isolation.root, "resources");
mkdirSync(resources);
const source = resolve(process.env.D_PI_PERFORMANCE_SDK ?? "resources/sdk");
const release = acquireSdkResourceGuard(source);
try {
  cpSync(source, join(resources, "sdk"), {
    recursive: true,
    mode: constants.COPYFILE_FICLONE,
    dereference: false,
    verbatimSymlinks: true,
  });
} finally {
  release();
}
for (const name of ["pi-coding-agent", "pi-utils"])
  assert(
    realpathSync(
      join(resources, "sdk/node_modules/@oh-my-pi", name),
    ).startsWith(`${resources}/sdk/`),
    "SDK dependency symlink escaped the isolated copy",
  );
const { cleanup, ...serializable } = isolation;
writeFileSync(
  join(isolation.root, "isolation.json"),
  JSON.stringify(serializable, null, 2),
);
console.log(isolation.root);
