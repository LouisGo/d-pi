# 04 动态引用复制冻结：固定源证据

日期：2026-10-07。工作目录 `t3-frozen-references/d-pi`；分支 `codex/t3-clipboard-frozen`。本报告只证明独立实现与所列工程验证，不替代 root 的固定最终构建、原生剪贴板检查、两轴评审或用户试用认可。

- 固定基点：`d6c965411785365ede320482b9042fecf1a0577f`。
- 实现源提交：`e381f0da4fe460ffd44a99f4be8c1234b939831b`。
- 本证据是后续文档提交；下列固定源运行在上述实现 SHA 的 clean tree，文档提交不冒称另一份已运行源码。
- root 已先写用户选项 1、D-10 补充、foundation/input-context 合同；worker 没有改 spec、任务/状态、模块文档、diagnostics、generated 或原生 validation。

## 独立取舍与固定 T3 依据

T3 固定 `10f39eb9ac80c9a4b7f5097575dd2addc3b6f631`：`packages/contracts/src/composerContextClipboard.ts` 用 source environment/Thread 标识记录来源并在原始输入限制记录数量；`packages/shared/src/composerContextClipboard.ts` 提供 MIME/HTML 编码及输入边界；`apps/web/src/components/composerInlineTokenPaste.ts` 按实际选中 token 裁剪记录依赖并重写目标 ID；`apps/web/src/components/chat/ChatComposer.tsx` 的复制/导入接线再次检查目标身份。保留这些来源、依赖裁剪与 ID 重写思想。

该 T3 contract 不提供原项目动态 path/version 的捕获接口，其 file context 是 attachment binding。d-pi 的冻结项目引用是本项目按用户选择独立设计的 Main 合同，不能说 T3 已有相同冻结实现，也不采用客户端外部 asset URL/fetch 来授予访问权限。不扩 Effect/Layer/Atom，复用现有 readReference 权限、格式识别、图片验证和 PDF 转换流程；Main 用既有串行资源 lane 管准备、发布与 GC。

## 实现合同

`Attachment` 和 `PreparedContent.sources` 增加 optional 严格 `frozenReference`：`{ projectPath, path, kind, version, capturedAt }`。字符串沿现有边界有界；来源 project/path/version 只用于溯源，目标仍用可信 Thread/manifest/private digest。原动态 manifest 保留 `source=reference, representation=reference`，复制不会保存静态新事实到原草稿。

COPY 同步事件继续写 Main opaque ticket、HTML 和可读纯文本；异步 export 对真实源 Thread/选中 ID 读取完整有界内容及 reader.version，再通过同一格式判别和覆盖规则建立暂存记录。目录是完整直接条目 JSON（名称、kind），不递归读取文件正文。来源时间位于 COPY 请求至 ready 之间，不声称 OS 按键瞬间的文件系统快照。

Main 在 serialized lane 内完成最终对象验证、TTL/document/源 Thread 身份复核，再原子执行 final snapshot 实际 byte budget 与全部原件/派生 pin 的提交；GC 不能在 prepare 与 final pin 之间进入。待准备时原有私有资产先同步 pin，动态新对象只在全快照准入后获得 snapshot pin。失败不发布 ready capability/半个目标 manifest，未提交对象遵守原有未引用对象清理策略。

目标以一个 SQL transaction 导入完整记录、全新 UUID/token，保留表示、转换版本、覆盖缺口、textOnly、derivedDigest 与冻结来源；同一 ID 的 import pin 使用已有 `Set.add`，原件和派生都加入，第二次 pin 不覆盖第一次。PM 保持一次插入与一次 Undo。再次复制冻结资产复用原完整私有记录与原 provenance，不调用 readReference。preview/prepare/reopen 仅读目标私有资产，PreparedContent 继续携带真实原始/派生摘要、冻结版本及来源。

旧草稿/旧 manifest 没有 optional 字段仍可读；缺失私有对象 metadata 可经真实对象验证修复后准入。旧 App 的严格 AttachmentSchema/RecordSchema 不保证读新字段，因此这不是双向 rollback 兼容，须同版 Main/preload/Renderer；未提供降级数据迁移。源 projectPath 未进入 diagnostics attrs，也没有新增 operation kind/failure code。

正式 AttachmentControls 使用原组件/token/布局；显示中文“复制时冻结”/英文“Frozen on copy”，可展开真实来源项目、相对路径、版本及捕获时间。原动态引用保留发送读取提示。新增 6 个双语 UI key：`attachment.frozenOnCopy/frozenSource/frozenProject/frozenPath/frozenVersion/frozenTime`。

## 有效红灯与绿灯

最初 preload fixture 缺 traceId 的 harness 失败已修正，不记作功能红灯。正确 fixture 在固定基点 Store 上跑真实 Main/readReference/SQLite/preload：复制选中 file+directory 期望 `degraded:false`，旧实现实际 `degraded:true`（仅图片可进入 structured snapshot）。红灯已记录在本地 `/tmp/dpi-frozen-red.log`；可用基点 Store 加本提交同名测试复现。GUI 单独先红：正式 controls 仅显示 Ready，不含 Frozen on copy/真实来源；随后 label/详情接线转绿。

最终实现树受影响回归：11 个文件 92 个测试全部通过。包括新集成 14 个、snapshot 生命周期 6 个、AttachmentStore/Main service/正式 controls/实际 PM adapter，以及既有 clipboard-handoff、cache recovery、cleanup recovery、cut/frozen selection 和小预算 PDF history retry。

固定实现 SHA clean tree 再运行：

```sh
pnpm test tests/integration/clipboard-frozen-references.integration.test.ts src/modules/input/main/attachments/clipboard-snapshots.test.ts
```

实际输出：2 files，20 tests passed；2026-10-07 18:56:02，duration 3.19s。源码冻结后无源修改。

完整受影响验证命令：

```sh
pnpm test tests/integration/clipboard-frozen-references.integration.test.ts src/modules/input/main/attachments/clipboard-snapshots.test.ts src/modules/input/main/attachments/attachment-store.test.ts src/app/main/wiring/attachment-service.test.ts src/app/renderer/workbench/attachment-controls.test.ts src/modules/input/renderer/clipboard/trusted-clipboard.test.ts tests/integration/clipboard-context.integration.test.ts tests/integration/clipboard-handoff.integration.test.ts tests/integration/clipboard-cache-recovery.integration.test.ts tests/integration/clipboard-cleanup-recovery.integration.test.ts tests/integration/input-history-retry.integration.test.ts
```

实际输出：11 files，92 tests passed；18:53:50，duration 7.19s，随后仅提交相同已测源码。旧 @search GUI test 有既存 React act warning，未关闭或修改这条无关验证。

## 真实行为和资源样本

| 场景 | 实际结果 |
| --- | --- |
| 两个不同真实项目 + preload codec + Main + SQLite | COPY ready 后改源 file，原动态 prepare 仍读取 new，随后删源 file/改目录；目标同名异内容不会覆盖冻结内容。file 预览仍是 SOURCE ORIGINAL，目录仍含 original.txt，不含 later.txt 或子文件正文。再次复制/重开继续原来源版本。 |
| 实际 Tiptap/PM + DraftController + Cache + Main/SQLite | 只选第一段 @file/@directory/@PNG，下一段 missing ref 不捕获；目标 3 新 IDs，一个 Undo 变空稿，flush/源 document 释放/GC 0，Redo 恢复并 prepare 成功。 |
| 真实 SDK PDF | 本工作树单独准备的 OMP 18.4.6/Bun 1.3.14 `pdfToMarkdown` 子进程转换真实 PDF bytes。未同意 textOnly 时导出失败且目标 0 manifest；同意后 ready，保留真实 visual/OCR-page coverage、转换版本、derivedDigest。源快照/文件释放后目标唯一 import pin 对原件与派生都有效，GC 0；recopy 保留完整 derived/provenance，持久采用后仍可 prepare。 |
| 不支持/缺失/权限拒绝/截断目录 | 实际二进制、缺失文件、越界 symlink、501 条目录均 export failed，ticket 不可 import，目标 0 manifest；不伪 ready。 |
| 实际异步单快照 bytes | 3 个不同 23 MiB 文本原件（69 MiB + selected text）触发 64 MiB busy，目标不创建记录。未引用暂存对象可由原有 manual GC 删除。 |
| 实际全局 bytes | 2 份 46 MiB（各 2 原件 + selected text）快照可 ready；第 3 份将超过 128 MiB，final commit busy。释放两 owner 后，GC 有界分批删除两受保护对象，再 export 成功，budget/pin 恢复。GC 的 32 MiB/次扫描边界需要多次运行，测试不冒称一次全量扫描。 |
| 派生计量与 dedup | 3 个 21 MiB 原件 + 相同 1 MiB converter 输出（只计一次 derived）+ selected text 超过 64 MiB，busy。真实私有表 4 objects；失败未获 snapshot pin，manual GC 有界分批共删 4。此转换输出是显式测试 seam，真实转换能力由另一个 SDK test 证明。 |
| TTL/document 晚 source reply | 真实 Main Store/SQLite 的待返回 source read：推进既有 120s TTL 或释放 source document，export 立即 expired/invalid；晚结果不创建对象，私有表 0，目标 0。另验证 final commit 晚到不会恢复原件/派生 pin。 |
| conversion 后 source identity 失效 | 受控异步转换完成后来源 guard 为 false：不发布 capability，目标 0，两个未提交原件/派生对象可清理。实际 App reader guard 重查原 Thread directory + workingDirectoryId。 |
| selection 上限 | Main 拒绝 33 依赖，preload+Main 拒绝字符数仍合法但 UTF-8 超 1 MiB 的选中文字；异步对象分配前失败，私有表 0。 |
| 旧源兼容 | optional 来源字段缺失、私有 object metadata 行缺失的旧 text manifest 仍经对象核验修复并复制/prepare。 |
| 既有失败恢复 | 128 clone quota、current unsaved/Redo、clear/reset/eviction failed release、9 owners/waiting admission、controller rebind、rejected insertion与迟到 discard retry、PDF小 history budget 回归全部保留通过。没有自动重放 import/unknown 或新增 Git 写入。 |

## 其他检查与限制

`pnpm install --frozen-lockfile`、`pnpm exec install-electron`、`pnpm runtime:sdk`、`pnpm check:environment` 在本工作树准备/通过；Node 24.21.0、pnpm 12.8.1、Electron 44.4.5、SDK 18.4.6/Bun 1.3.14，未借另一构建目录伪装身份。

`pnpm typecheck` 全部 TS 环境通过；10 改动文件 Biome、`git diff --check`、`pnpm check:architecture`（423 source files）、`pnpm lint:design`、`pnpm lint:i18n`、`pnpm lint:interaction` 通过。项目 impeccable detect 对正式 controls 输出 `[]`。

未机械重跑 full check/build、package、原生 ClipboardEvent 或个人账户/远端模型；它们由 root 在最终整合 SHA 统一验证。本 SDK 验证是文本抽取和已有 textOnly consent/coverage 合同，未实现或声称 PDF 页面渲染、图表/图片保真、OCR 识别、任意 PDF全集。图片 decode 在 worker Main fixture 使用可信验证 seam；实际 macOS image/OS clipboard由 root probe 补足。既有 25 MiB 单源、100 MiB 提交、1 MiB encoded transport 及 readonly/unknown 准入不放宽，快照 ready 不替代最终提交预算检查。
