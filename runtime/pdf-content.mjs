import { pdfToMarkdown } from "@oh-my-pi/pi-natives";

const chunks = [];
let size = 0;
for await (const chunk of process.stdin) {
  size += chunk.length;
  if (size > 25 * 1024 * 1024) throw Error("source-too-large");
  chunks.push(chunk);
}
const result = await pdfToMarkdown(Buffer.concat(chunks));
// Match the fixed OMP PDF-to-Markdown path. Its real coverage evidence is the
// OCR page list; it does not report visual-content detection. Never invent a
// visual gap for every PDF. This output is Markdown, not rendered PDF pages.
if (result.hasEncodingIssues) throw Error("invalid-encoding");
process.stdout.write(
  JSON.stringify({
    text: result.markdown,
    pageCount: result.pageCount,
    pagesNeedingOcr: result.pagesNeedingOcr,
    converterVersion: "omp18.8.7-pdfToMarkdown",
  }),
);
