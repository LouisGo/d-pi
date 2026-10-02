import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { it } from "vitest";

it("native subagent configuration uses the fixed SDK in an isolated environment", () => {
  execFileSync(
    process.execPath,
    [
      fileURLToPath(
        new URL(
          "../../../../runtime/native-subagent-suite.mjs",
          import.meta.url,
        ),
      ),
    ],
    {
      timeout: 50000,
      encoding: "utf8",
      stdio: "pipe",
    },
  );
}, 55000);
