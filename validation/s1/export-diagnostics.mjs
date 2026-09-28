import { createReadStream, readdirSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";

const [directory, traceId] = process.argv.slice(2);
if (!directory)
  throw Error(
    "Usage: node validation/s1/export-diagnostics.mjs LOG_DIRECTORY [TRACE_ID]",
  );
const fields = [
  "schemaVersion",
  "time",
  "process",
  "processInstanceId",
  "traceId",
  "requestId",
  "connectionId",
  "operation",
  "stage",
  "durationMs",
  "errorId",
  "code",
  "causeCode",
  "observedAt",
  "build",
];
let malformed = 0;
for (const name of readdirSync(directory)
  .filter((name) => /^main(?:-\d+)?\.jsonl$/.test(name))
  .sort()) {
  for await (const line of createInterface({
    input: createReadStream(join(directory, name)),
    crlfDelay: Infinity,
  })) {
    try {
      const event = JSON.parse(line);
      if (traceId && event.traceId !== traceId) continue;
      process.stdout.write(
        JSON.stringify(
          Object.fromEntries(
            fields
              .filter((key) => Object.hasOwn(event, key))
              .map((key) => [key, event[key]]),
          ),
        ) + "\n",
      );
    } catch {
      malformed++;
    }
  }
}
if (malformed)
  process.stderr.write(`Skipped ${malformed} malformed/incomplete lines.\n`);
