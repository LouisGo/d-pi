# 04 输入与附件

Status: claimed
Blocked by: none

所属范围与授权见 [spec](../spec.md)。

按 V1-04 纳入全部指定输入，实际内容承载、预检/准备/冻结/失败保留、预览缩放重排，结构化粘贴与 @ 查询。

## Comments

2026-09-30：M2 明确授权接续 S5；这是工程票，用户认可在 spec 单独维护。

2026-10-01：入口候选验证后接入普通结构化粘贴为可编辑 Markdown；显式纯文本粘贴保留原文，沿用 Tiptap 单实例与撤销。附件内容存储及 @ 发送时冻结继续按合同接入，不把此增量标为 V1-04 完成。

后续接入依据：固定 SDK 18.3.0 的 `src/markit/converters/pdf/index.ts` 已通过 `@oh-my-pi/pi-natives` 的 `pdfToMarkdown` 转换，原生结果含 `pagesNeedingOcr`。此为源码事实，尚未在 App 私有内容存储/传输中实测；须保留扫描页/图表覆盖缺口并验证真实表示，不能以空文本或文件名判 ready。

2026-10-01：本次加固已完成窗口内 A→B→A 选区与有限 undo/redo、消费/外部版本失效、LRU与旧View迟到事件隔离，见[加固输入票](../../runtime-hardening-omp1845/issues/05-editor-continuity.md)。附件、@文件与其完整传输验证继续留本票，不因编辑连续性完成关闭V1-04。

2026-10-01：实际 m2.8 Shift+Enter 不换行，违反已定基础编辑行为；真实 Composer 行为回归先失败，注册 splitBlock 后通过。源码局部修复尚未交付通过包内验证的新候选，见 [进度核对](../progress-audit.md)。附件/@ 等未完成范围未因此提前开启或验收。

2026-10-02：附件引用与带图队列按04a/05c实施，见[本轮切片](../content-preparation.md)。PDF完整视觉/OCR表示、B4回收与完整子Agent生命周期等仍保留父票；不把最近增量或工具通过当全集完成。

2026-10-02：04a/05c工程完成，clean m2.13候选已交付待试用，18项实际macOS检查与独立review修复复核通过。父票未完成范围保留；04继续PDF完整视觉/OCR与B4回收，05继续完整子Agent生命周期等，不将子票完成扩大为全集完成。[试用与限制](../content-preparation.md#候选与试用)。

2026-10-06：04b的B4权威引用/七天自动回收/显式检查清理已工程完成；04仍保留PDF完整视觉/OCR与其余输入组合范围。用户认可pending，见[本段交接](../lifecycle.md)。
