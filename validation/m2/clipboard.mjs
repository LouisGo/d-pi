import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { chmodSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const budget = 16 * 1024 * 1024;
const source = fileURLToPath(new URL("./clipboard.swift", import.meta.url));

/**
 * Capture before any Copy. Native stdout contains only status/counts.
 * Use beforeCopy() before each click, markOwnedCopy(expectedText) after success,
 * and restore(lastExpectedText) in finally (also handles assertions before mark).
 * restore() always removes the private snapshot, and skips newer user copies.
 */
export function captureClipboard(options) {
  return createSnapshot(options);
}

function createSnapshot({ env, temporary, pasteboardName }, fixtureBinary) {
  if (process.platform !== "darwin") throw Error("macOS clipboard required");
  const directory = mkdtempSync(join(temporary, "clipboard-private-"));
  chmodSync(directory, 0o700);
  const binary = fixtureBinary ?? join(directory, "clipboard-helper");
  const original = join(directory, "original.json");
  const owned = join(directory, "owned.json");
  let disposed = false;
  function invoke(operation, expectedText) {
    if (disposed) throw Error("Clipboard snapshot already disposed");
    const request = {
      operation,
      name: pasteboardName ?? null,
      original,
      owned,
      budget,
      expectedHash:
        expectedText === undefined
          ? null
          : createHash("sha256").update(expectedText).digest("hex"),
      fixture: null,
    };
    try {
      return JSON.parse(
        execFileSync(binary, [], {
          env,
          input: JSON.stringify(request),
          encoding: "utf8",
          maxBuffer: 16 * 1024,
          timeout: 20_000,
          stdio: ["pipe", "pipe", "pipe"],
        }),
      );
    } catch {
      // Do not include command input, native stdout or any clipboard representation.
      throw Error(`Clipboard ${operation} failed`);
    }
  }
  try {
    if (!fixtureBinary)
      execFileSync(
        "/usr/bin/xcrun",
        [
          "swiftc",
          source,
          "-o",
          binary,
          "-module-cache-path",
          join(directory, "module-cache"),
        ],
        {
          env,
          encoding: "utf8",
          timeout: 60_000,
          maxBuffer: 64 * 1024,
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
    invoke("capture");
  } catch {
    rmSync(directory, { recursive: true, force: true });
    throw Error("Clipboard capture failed; do not click Copy");
  }
  return {
    beforeCopy: () => invoke("before"),
    markOwnedCopy: (expectedText) => invoke("mark", expectedText),
    restore(expectedText) {
      if (disposed) return { kind: "disposed" };
      try {
        return invoke("restore", expectedText);
      } finally {
        disposed = true;
        rmSync(directory, { recursive: true, force: true });
      }
    },
  };
}

// Named-pasteboard fixture validation stays local and never mutates general.
export function validateClipboardSnapshot({ env, temporary }) {
  const name = `d-pi-validation-${randomUUID()}`;
  const directory = mkdtempSync(join(temporary, "clipboard-fixture-"));
  chmodSync(directory, 0o700);
  const binary = join(directory, "clipboard-fixture");
  const reference = join(directory, "reference.json");
  function invoke(operation, fixture = null) {
    return JSON.parse(
      execFileSync(binary, [], {
        env,
        input: JSON.stringify({
          operation,
          name,
          original: reference,
          owned: join(directory, "unused.json"),
          budget,
          expectedHash: null,
          fixture,
        }),
        encoding: "utf8",
        maxBuffer: 16 * 1024,
        timeout: 20_000,
        stdio: ["pipe", "pipe", "pipe"],
      }),
    );
  }
  const expected = "TEST_OWNED_COPY😀";
  let capture;
  try {
    execFileSync(
      "/usr/bin/xcrun",
      [
        "swiftc",
        source,
        "-o",
        binary,
        "-module-cache-path",
        join(directory, "module-cache"),
      ],
      { env, timeout: 60_000, stdio: ["ignore", "pipe", "pipe"] },
    );
    invoke("fixture", "original");
    invoke("capture");
    capture = createSnapshot({ env, temporary, pasteboardName: name }, binary);
    capture.beforeCopy();
    invoke("fixture", "owned");
    capture.markOwnedCopy(expected);
    if (capture.restore().kind !== "restored" || !invoke("verify").equal)
      throw Error("Multiformat restore failed");
    capture = createSnapshot({ env, temporary, pasteboardName: name }, binary);
    capture.beforeCopy();
    invoke("fixture", "owned");
    capture.markOwnedCopy(expected);
    invoke("fixture", "user");
    invoke("capture");
    if (
      capture.restore(expected).kind !== "preserved-new-content" ||
      !invoke("verify").equal
    )
      throw Error("New user copy was overwritten");
    capture = createSnapshot({ env, temporary, pasteboardName: name }, binary);
    invoke("fixture", "owned");
    let beforeRejected = false;
    try {
      capture.beforeCopy();
    } catch {
      beforeRejected = true;
    }
    if (!beforeRejected || capture.restore().kind !== "preserved-new-content")
      throw Error("Intervening user Copy was not rejected before click");
    capture = createSnapshot({ env, temporary, pasteboardName: name }, binary);
    capture.beforeCopy();
    invoke("fixture", "owned");
    capture.markOwnedCopy(expected);
    invoke("fixture", "owned");
    if (capture.restore(expected).kind !== "preserved-new-content")
      throw Error("New identical user Copy was overwritten");
    capture = createSnapshot({ env, temporary, pasteboardName: name }, binary);
    invoke("fixture", "owned");
    if (capture.restore(expected).kind !== "restored")
      throw Error("Interrupted Copy restore failed");
    invoke("fixture", "oversized");
    const oversizedCount = invoke("count").changeCount;
    let rejected = false;
    try {
      createSnapshot({ env, temporary, pasteboardName: name }, binary);
    } catch {
      rejected = true;
    }
    if (!rejected || invoke("count").changeCount !== oversizedCount)
      throw Error("Over-budget clipboard was accepted or modified");
    return {
      beforeCopyRejected: true,
      identicalNewCopyPreserved: true,
      multiformat: true,
      binary: true,
      textOverOneMiB: true,
      newerCopyPreserved: true,
      interruptedCopy: true,
      budgetRejected: true,
    };
  } finally {
    try {
      capture?.restore();
      invoke("fixture", "remove");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }
}
