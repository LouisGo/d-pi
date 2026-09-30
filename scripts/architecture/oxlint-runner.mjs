import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

// A crash must never be mistaken for a rule violation. `spawnSync` reports a
// signal as `status: null` with empty output, which is exactly what a silent
// design-gate failure looks like, so classify it explicitly.
export function runOxlint({ binary = "oxlint", args, cwd }) {
  const result = spawnSync(binary, args, { cwd, encoding: "utf8" });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if (result.error) {
    return {
      kind: result.error.code === "ENOENT" ? "missing" : "failed-to-run",
      binary,
      output,
      reason: result.error.message,
    };
  }
  if (result.signal)
    return { kind: "crashed", binary, output, reason: result.signal };
  return { kind: "ran", status: result.status ?? 1, output };
}

/**
 * Print the diagnostic a caller needs to tell "a rule fired" apart from "the
 * linter never ran", and return the exit code to publish.
 */
export function reportOxlintResult(result) {
  if (result.kind === "ran") {
    const label =
      result.status === 0
        ? "PASS: design lint"
        : `FAIL: design lint reported violations (exit ${result.status})`;
    const output =
      result.output.endsWith("\n") || !result.output
        ? result.output
        : `${result.output}\n`;
    process.stdout.write(`${output}${label}\n`);
    return result.status;
  }
  const crashed = result.kind === "crashed";
  process.stderr.write(
    [
      crashed
        ? `FAIL: design lint crashed — ${result.binary} was killed by ${result.reason} before it judged any file.`
        : `FAIL: design lint is unavailable — could not run ${result.binary} (${result.reason}).`,
      "This is a tooling failure, not a rule result. On Node 24.17.0 the oxlint JS-plugin worker dies with SIGTRAP; it must run on a Node build where JS plugins load.",
      `node ${process.version}`,
      "",
      result.output.trim(),
      "",
    ].join("\n"),
  );
  return 1;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const separator = process.argv.indexOf("--");
  const args = separator === -1 ? [] : process.argv.slice(separator + 1);
  if (args.length === 0) {
    process.stderr.write(
      "Usage: node oxlint-runner.mjs -- <oxlint arguments>\n",
    );
    process.exitCode = 1;
  } else {
    process.exitCode = reportOxlintResult(
      runOxlint({ args, cwd: process.cwd() }),
    );
  }
}
