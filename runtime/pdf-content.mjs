import { pdfToMarkdown } from "@oh-my-pi/pi-natives";

const chunks = [];
let size = 0;
for await (const chunk of process.stdin) {
  size += chunk.length;
  if (size > 25 * 1024 * 1024) throw Error("source-too-large");
  chunks.push(chunk);
}
const result = await pdfToMarkdown(Buffer.concat(chunks));
// This converter has no page/image renderer. Text mode always needs explicit consent.
if (result.hasEncodingIssues) throw Error("invalid-encoding");
process.stdout.write(
  JSON.stringify({
    text: result.markdown,
    pageCount: result.pageCount,
    pagesNeedingOcr: result.pagesNeedingOcr,
    hasVisualContent: true,
    converterVersion: "omp18.4.6-pdfToMarkdown",
  }),
);
