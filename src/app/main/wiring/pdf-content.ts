import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { z } from "zod";
import { managedSdkRuntime } from "../../../platform/omp/resources/public";

const PdfResultSchema = z.strictObject({
  text: z.string().max(1048576),
  pageCount: z.number().int().nonnegative(),
  pagesNeedingOcr: z.array(z.number().int().positive()).max(100),
  hasVisualContent: z.boolean(),
  converterVersion: z.string().max(128),
});
export async function convertPdfContent(resources: string, bytes: Uint8Array) {
  const sdk = await managedSdkRuntime(resources);
  return new Promise<z.infer<typeof PdfResultSchema>>((resolve, reject) => {
    const child = spawn(
      sdk.binary,
      [join(dirname(sdk.entry), "pdf-content.mjs")],
      {
        cwd: dirname(sdk.entry),
        stdio: ["pipe", "pipe", "ignore"],
        env: { PATH: process.env.PATH, HOME: dirname(sdk.entry) },
      },
    );
    const chunks: Buffer[] = [];
    let size = 0;
    let done = false;
    const finish = (error?: Error, value?: z.infer<typeof PdfResultSchema>) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (error) {
        child.kill();
        reject(error);
      } else if (value) resolve(value);
    };
    const timer = setTimeout(
      () => finish(Error("pdf-conversion-failed")),
      20000,
    );
    child.on("error", () => finish(Error("pdf-conversion-unavailable")));
    child.stdin.on("error", () => finish(Error("pdf-conversion-failed")));
    child.stdout.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 1048576) finish(Error("transport-too-large"));
      else chunks.push(chunk);
    });
    child.on("close", (code) => {
      if (code !== 0) return finish(Error("pdf-conversion-failed"));
      try {
        finish(
          undefined,
          PdfResultSchema.parse(
            JSON.parse(Buffer.concat(chunks).toString("utf8")),
          ),
        );
      } catch {
        finish(Error("pdf-conversion-failed"));
      }
    });
    child.stdin.end(bytes);
  });
}
