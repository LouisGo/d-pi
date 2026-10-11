import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// Explicit isolated fixture extension. Uses official ExtensionAPI and UI only;
// no provider, App implementation or SDK patch is injected into the native side.
const resultFile = fileURLToPath(
  new URL("./ask-results.json", import.meta.url),
);
const questions = [
  {
    id: "single",
    question: "保留原生选项",
    options: [{ label: "  原始中文 A  " }, { label: "推荐 B" }],
    recommended: 1,
  },
  {
    id: "multi",
    question: "允许明确空多选",
    options: [
      { label: "C", preview: "# 原生预览\n```ts\nconst x = 1;\n```" },
      { label: "D" },
    ],
    multi: true,
    recommended: 1,
  },
];
export default function (api) {
  api.registerCommand("d-pi-rich-fixture", {
    description: "Isolated rich ask validation",
    handler: async (args, ctx) => {
      if (!ctx.ui.askDialog) throw Error("Native rich ask was not enabled");
      const result =
        args === "parallel"
          ? await Promise.all([
              ctx.ui.askDialog(questions),
              ctx.ui.askDialog([
                {
                  id: "custom",
                  question: "另一个独立请求",
                  options: [{ label: "E" }],
                },
              ]),
            ])
          : await ctx.ui.askDialog(questions, {
              timeout:
                args === "timeout" ? 1500 : args === "rpc-zero" ? 0 : undefined,
            });
      await writeFile(
        resultFile,
        JSON.stringify({ args, result: result ?? null }),
      );
    },
  });
}
