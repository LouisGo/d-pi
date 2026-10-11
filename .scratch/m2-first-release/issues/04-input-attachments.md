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

2026-10-06：04c目录/文件typed @引用与有界搜索优化工程完成，clean m2.15交付待试用；直接清单语义/500条目限制与性能、正式GUI证据见[交接](../project-references.md)。PDF完整视觉/OCR及其余输入组合仍保留，用户认可pending。

2026-10-11：复核用户提供的 2026-10-10 PDF 与原始附件证据（报告 source `1e73213ea81966e1979c58cad1b0342f34487381`，Linux/OMP 18.8.7）。29 个场景包含失败与未完成的 GUI Send，不能表述为 29 项完整 E2E 通过。已修复稀疏 XLSX 坐标错列/XML 前缀兼容、PDF/document 信封与发送后历史预览不一致、新建项目 @ PDF/XLSX 预览、扫描 PDF 的 OCR 原因与页码丢失、ZIP 被误导为 UTF-8，以及窗口销毁后的权限回调。转换器继续归 OMP：固定 18.8.7 的 pnpm patch 随 lockfile 分发，SDK 准备验证补丁 hash；未复制一份 App 转换器。普通旧 XLSX 草稿从原件重转，复制快照保留旧派生物并要求显式重试；已发送冻结内容不改写。未增加 OCR、公式重算或归档展开能力。

本轮 102 个相关行为测试及 5 个 SDK tooling 测试通过；Main/Core/Preload/Host 类型检查、相关 Biome/i18n/架构/结构检查通过。Renderer/全局类型检查仍受基线已有 `composer-tag.tsx:134`（`data-file-icon` prop）与 `project-reads.test.ts:573`（SubmissionId brand）错误影响，未改无关文件。只读独立 Spec + Standards 复核发现的旧缓存与 Retry 入口两项均已修复并复核。隔离 macOS arm64 Electron 源码构建实测导入 PDF/稀疏与带前缀 XLSX/TXT → GUI Send → 固定 SDK → 本地 SSE 接收且只有一次请求 → 所有 sent chip 正文预览、新建 @ PDF/XLSX 只读预览、OCR/ZIP 提示；验证隔离 userData 后从真实 Main 调用 `app.quit()`，退出码 0，无 destroyed-object 异常。原生 Quit 菜单未验证；截图含瞬时过渡帧，不作为视觉定稿。见[实机结果与源码 hash](../evidence/attachment-qa-20261011/gui-result.json)、[行为结果](../evidence/attachment-qa-20261011/behavior.txt)、[SDK tooling](../evidence/attachment-qa-20261011/tooling.txt)、[稀疏 XLSX 预览](../evidence/attachment-qa-20261011/sent-sparse-two-sheet-xlsx.png)与[失败提示](../evidence/attachment-qa-20261011/attachment-errors.png)。这是 base 加 WIP 的隔离构建证据，不是 clean 固定包或用户认可。

报告中的 Linux `permit-timeout` 仍未定位；macOS 真实 permit/SDK ready 不证明该 Linux 问题已修复，Linux 支持未据此承诺。25 MiB 批次留下部分私有对象是观察项，现有证据不足以判定孤儿泄漏。原用户实例仍占用 SDK 资源，准备器正确拒绝覆盖；其数据、实例和 SDK 未替换。试用需正常退出该实例后 `pnpm runtime:sdk`、`pnpm dev`。父票的 PDF 完整视觉/OCR及用户认可继续开放。
