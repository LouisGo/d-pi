import { Markit } from "@oh-my-pi/pi-coding-agent/markit";
import { CONVERTIBLE_EXTENSIONS } from "@oh-my-pi/pi-coding-agent/utils/markit";
import { notebookToEditableText } from "@oh-my-pi/pi-natives";

const extension = process.argv[2];
if (
  extension !== ".ipynb" &&
  (!CONVERTIBLE_EXTENSIONS.has(extension) || extension === ".pdf")
)
  throw Error("unsupported-format");
const chunks = [];
let size = 0;
for await (const chunk of process.stdin) {
  size += chunk.length;
  if (size > 25 * 1024 * 1024) throw Error("source-too-large");
  chunks.push(chunk);
}
const input = Buffer.concat(chunks);
const result =
  extension === ".ipynb"
    ? {
        markdown: notebookToEditableText(
          new TextDecoder("utf-8", { fatal: true }).decode(input),
          "input.ipynb",
        ),
      }
    : await new Markit().convert(input, { extension });
if (!result.markdown.trim()) throw Error("document-conversion-failed");
const output = JSON.stringify({
  text: result.markdown,
  converterVersion: `omp18.8.7-${extension === ".ipynb" ? "notebookToEditableText" : `markit-${extension.slice(1)}`}`,
});
if (Buffer.byteLength(output) > 1048576) throw Error("transport-too-large");
process.stdout.write(output);
