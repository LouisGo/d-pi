# 04 输入与附件

Status: claimed
Blocked by: none

所属范围与授权见 [spec](../spec.md)。

按 V1-04 纳入全部指定输入，实际内容承载、预检/准备/冻结/失败保留、预览缩放重排，结构化粘贴与 @ 查询。

## Comments

2026-09-30：M2 明确授权接续 S5；这是工程票，用户认可在 spec 单独维护。

2026-10-01：入口候选验证后接入普通结构化粘贴为可编辑 Markdown；显式纯文本粘贴保留原文，沿用 Tiptap 单实例与撤销。附件内容存储及 @ 发送时冻结继续按合同接入，不把此增量标为 V1-04 完成。

后续接入依据：固定 SDK 18.3.0 的 `src/markit/converters/pdf/index.ts` 已通过 `@oh-my-pi/pi-natives` 的 `pdfToMarkdown` 转换，原生结果含 `pagesNeedingOcr`。此为源码事实，尚未在 App 私有内容存储/传输中实测；须保留扫描页/图表覆盖缺口并验证真实表示，不能以空文本或文件名判 ready。
