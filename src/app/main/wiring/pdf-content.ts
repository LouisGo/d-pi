import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { z } from "zod";
import { managedSdkRuntime } from "../../../platform/omp/resources/public";

const PdfResultSchema = z.strictObject({
  text: z.string().max(1048576),
  pageCount: z.number().int().nonnegative(),
  pagesNeedingOcr: z.array(z.number().int().positive()).max(100),
  hasVisualContent: z.boolean().optional(),
  converterVersion: z.string().max(128),
});
export async function convertPdfContent(resources: string, bytes: Uint8Array) {
  return convertContent(
    resources,
    bytes,
    "pdf-content.mjs",
    [],
    PdfResultSchema,
    "pdf",
  );
}
const DocumentResultSchema = z.strictObject({
  text: z.string().min(1).max(1048576),
  converterVersion: z.string().min(1).max(128),
});
export async function convertDocumentContent(
  resources: string,
  bytes: Uint8Array,
  extension: ".docx" | ".pptx" | ".xlsx" | ".epub" | ".ipynb",
) {
  return convertContent(
    resources,
    bytes,
    "document-content.mjs",
    [extension],
    DocumentResultSchema,
    "document",
  );
}
async function convertContent<T>(
  resources: string,
  bytes: Uint8Array,
  script: string,
  args: string[],
  schema: z.ZodType<T>,
  kind: "pdf" | "document",
) {
  const sdk = await managedSdkRuntime(
    resources,
    kind === "document" ? "document-content.mjs" : undefined,
  ).catch(() => {
    throw Error(`${kind}-conversion-unavailable`);
  });
  return new Promise<T>((resolve, reject) => {
    const child = spawn(
      sdk.binary,
      [join(dirname(sdk.entry), script), ...args],
      {
        cwd: dirname(sdk.entry),
        stdio: ["pipe", "pipe", "ignore"],
        env: { PATH: process.env.PATH, HOME: dirname(sdk.entry) },
      },
    );
    const chunks: Buffer[] = [];
    let size = 0;
    let done = false;
    const finish = (error?: Error, value?: T) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (error) {
        child.kill();
        reject(error);
      } else if (value) resolve(value);
    };
    const timer = setTimeout(
      () => finish(Error(`${kind}-conversion-failed`)),
      20000,
    );
    child.on("error", () => finish(Error(`${kind}-conversion-unavailable`)));
    child.stdin.on("error", () => finish(Error(`${kind}-conversion-failed`)));
    child.stdout.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 1048576) finish(Error("transport-too-large"));
      else chunks.push(chunk);
    });
    child.on("close", (code) => {
      if (code !== 0) return finish(Error(`${kind}-conversion-failed`));
      try {
        finish(
          undefined,
          schema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8"))),
        );
      } catch {
        finish(Error(`${kind}-conversion-failed`));
      }
    });
    child.stdin.end(bytes);
  });
}
