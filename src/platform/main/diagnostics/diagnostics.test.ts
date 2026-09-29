import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { Diagnostics } from "./diagnostics";

const context = {
  traceId: crypto.randomUUID(),
  requestId: crypto.randomUUID(),
  connectionId: crypto.randomUUID(),
  operation: "save",
  stage: "received" as const,
};
it("flood remains bounded and persisted lines retain correlation", async () => {
  const directory = mkdtempSync(join(tmpdir(), "d-pi-logs-"));
  const logger = new Diagnostics(directory);
  for (let i = 0; i < 2000; i++) logger.record(context);
  expect(logger.dropped).toBeGreaterThan(0);
  await logger.close();
  const lines = readFileSync(join(directory, "main.jsonl"), "utf8")
    .trim()
    .split("\n");
  expect(lines.length).toBeLessThanOrEqual(1000);
  expect(JSON.parse(lines[0] ?? "")).toMatchObject(context);
  expect(JSON.parse(lines[0] ?? "").build).toMatchObject({
    id: expect.any(String),
    commit: expect.any(String),
    version: expect.any(String),
  });
  rmSync(directory, { recursive: true, force: true });
});
it("writer failure is visible, bounded and does not reject business flow", async () => {
  const directory = mkdtempSync(join(tmpdir(), "d-pi-logs-"));
  const path = join(directory, "not-directory");
  writeFileSync(path, "fixture");
  let notifications = 0;
  const logger = new Diagnostics(path, () => {
    notifications++;
  });
  logger.record(context);
  await logger.close();
  expect(logger.degraded).toBe(true);
  expect(logger.dropped).toBe(1);
  expect(notifications).toBe(1);
  rmSync(directory, { recursive: true, force: true });
});
