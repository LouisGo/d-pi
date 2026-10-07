# 04 trusted clipboard — independent images / frozen selections

固定 base：`7f407de23bf34542996a7cf6a4ec1825a35303d0`，隔离 worktree `t3-reads/d-pi`，分支 `codex/t3-clipboard`。本证据只描述 04 独立部分，不把动态 @文件/目录跨 Thread 语义标成 resolved，不替代真实 OS clipboard、用户试用或验收。

## 研究与独立判断

实际读取 T3 固定源码 `10f39eb9ac80c9a4b7f5097575dd2addc3b6f631`：

- `packages/contracts/src/composerContextClipboard.ts`：version1 严格结构、私有 MIME、raw record 数量先限额，未知未来记录不授予权限。
- `packages/shared/src/composerContextClipboard.ts`：JSON 字符上限及 HTML `data-t3-context-fragment` fallback；人可读 plain flavor 与受验证结构分开。
- `apps/web/src/components/ComposerPromptEditorTiptap.tsx:1322`：实际 selection slice 和依赖 IDs；copy/cut 的 `setData` 必须同步。`:1047` / `:1082` 单次 paste transaction 带 clipboard action metadata。
- `apps/web/src/components/composerInlineTokenPaste.ts`：仅搬选中正文依赖、依赖闭包、新身份映射。
- `apps/web/src/components/chat/ChatComposer.tsx:3144`：异步附件导入绑定原 draft key，迟到禁止落入新 draft。
- `apps/web/src/composer-undo-grouping.ts:26`：clipboard action 与相邻 typing 分组隔离；d-pi 直接沿用 03 已有 `uiEvent` / `dpiIndependentAction` 合同。

不照搬 T3 external asset URL / fetch(blob) / 先插未就绪 chip。d-pi 已有 Main 私有 digest store 和 Thread-owned AttachmentModel / editor-history leases，复用这三者。同步 copy 无法 await Main 校验，因此 Main 预发 opaque ticket，copy 同步写 envelope 后异步 export；立即 paste 可有界等待同 ticket。Main 只复制已验证本源 Thread ready 私有图片，冻结选区自包含，不读 arbitrary path/URL，不扩 Effect/Atom/全局框架或读取权限。

## 公开合同与所有权

AttachmentBridge 新 command kind：`clipboard-reserve` / `clipboard-export` / `clipboard-import` / `clipboard-release` / `clipboard-discard`。export 必有 `ids`（实际所选附件节点、最大32；纯冻结选区为空）、`text`、`ticket`。ticket 严格 `{version:1,instanceId,handleId,expiresAt}`；私有 MIME `application/x-dpi-context-fragment+json`，HTML `data-dpi-context` URI encoded envelope。

新 reply：`clipboard-tickets` / `clipboard-exported` / `clipboard-imported` / `clipboard-unavailable`。失败是独立 `invalid|expired|busy|failed`，诊断分别 `clipboard-*`，无 stderr/path/全文。Main sourceValid/document identity 与 ThreadContext 仍是准入边界；Preload 严格校验并拒绝 foreign target asset reply。

Main 只将所选 node IDs 的实际 own-Thread manifest 当依赖。literal token、动态 refs、其他附件替换为显式可读标记，删除原 live UUID authority。冻结选区内部源文保留原字节语义，不从其中提取 asset dependencies。快照绑定 app instance + 原可信 document；Thread view 切换不释放已捕获快照，Main document navigation/renderer exit/service close 释放。GC pin 同步建立，异步 private-object 校验和 clone 留在原 serialized lane。export 逻辑等待在 TTL/document release 时立即结束，正在执行的私有对象读取仍由 store lane 的 finally/close drain 收尾，不将尚未释放的 IO 冒称已结束。

预算：每 document8/global32 tickets，reserved/pending/ready 都 TTL120s；每快照32 deps/1MiB选中文字/64MiB对象，global128MiB。每 ticket4/global16 waiter/3s；import 含等待/排队/执行每 document4/global16；未采用 clone handoff128，已持久采用或明确 discard/document close 解除 import pin。无周期系统剪贴板写入。

Renderer only owns disposable ticket pool/current attempt；pending 属于原 Thread AttachmentModel。整片段验证后 Main 单 SQLite transaction 新 target ID；Renderer 同一 body/selection、consume sequence、Undo epoch/current/editable/source-ready 才一次 PM paste transaction。迟到 clone discard，disposed AttachmentModel 也执行窄 cleanup。现有 onDraftHistoryClear 失效 attempt，没有重建 core epoch 事实。普通显式 plain paste 保持原行为。仅新增两条 zh/en UI keys `attachment.clipboardFallback` / `attachment.clipboardFailed`。

## 红绿与真实证据

- 首个实际 Main service/SQLite/private-object 用例在未实施时两次红灯：`clipboard-reserve` 返回 undefined；完成后通过。
- 同 body/selection/sequence 的 real PM 清 Undo epoch 用例先红灯 `latesame`；绑定现有 clear notification 后绿灯 `same`。
- 永不返回的 verify + document close 先红灯 timeout1000ms；有界 release race 后立即得到 typed invalid，pins0。
- `clipboard-context.integration.test.ts` 使用真实 Tiptap/ProseMirror、DraftController、DraftEditorCache、AttachmentModel、Main service、SQLite 和临时私有对象：cut → immediate paste → source/target save → one Undo → Main clean → Redo → target prepare 一张图片可发送，冻结选区原文保留。
- `composer-continuity.test.ts` 实际 React Composer A→B 接线：同步 copy 已写 ticket，target pending1，完成后 pending0，粘贴整体 one Undo 回到 bravo。该桥接 fixture 证明 UI 接线，不冒称系统剪贴板证据。
- 实际 Main 128次 target clone：128 distinct target IDs，objects 文件仍1个（SHA去重）；第129次 typed busy；foreign document discard 不降预算；正确 document discard32后新导入可完成。篡改私有对象后 import typed failed。跨 Thread 原 source token 的发送 baseline 为 attachment-not-found，新 target token 可发送。
- EventEmitter/Main IPC actual handler 对 destroyed/render-process-gone/full document navigation 都释放 pending clipboard waits；same-document navigation 保留。Preload 拒绝额外 path 字段和 foreign imported asset。
- 预算/TTL/timer 故障矩阵采用 fake clock，验证 global/owner ticket limit、byte limit、waiter limit、pending expiry、late verification、target/source document close、close timer count0；不冒称 heap/RSS或OS fd性能采样。

最终受影响矩阵：28 files / 116 tests passed。命令：

`pnpm test src/modules/input tests/integration/input-history.integration.test.ts tests/integration/clipboard-context.integration.test.ts src/app/main/wiring/attachment-history.test.ts src/app/main/wiring/attachment-clipboard.test.ts src/app/main/wiring/attachment-service.test.ts src/app/main/ipc/attachments.test.ts src/app/renderer/workbench/composer-continuity.test.ts src/app/renderer/workbench/composer-initialization.test.ts src/app/renderer/workbench/composer-binding.test.ts src/app/preload/bridges/attachments.test.ts`

`pnpm typecheck`（root/core/renderer/main/host/preload）、`pnpm lint`、`pnpm check:architecture`（423 production files）、`pnpm check:documentation`、`pnpm lint:i18n`、`pnpm lint:design`、`pnpm test:architecture`（35）、`pnpm build`、`pnpm check:environment`、`git diff --check` 均通过。架构测试自身包含故意 killed/missing lint 工具的拒绝样本；35/35正常通过，实际 design lint通过。build 保留既有 Zod annotation / chunk-size warnings。未更新 generated structure/status/spec/ticket，由主 Agent 串行集成生成。

环境已核实 Node24.21.0/pnpm12.8.1/Bun1.3.14/Electron44.4.5/OMP18.4.6/darwin-arm64。未改锁文件/依赖，复用 fixed-base frozen install/SDK 资源，environment0 issues。

## 集成与限制

store 改 constructor/releaseEditorHistories/close 和新增 clipboard methods；原 save/read/importBytes/retry/prepare/convert 不改算法。`content-lifecycle.ts` 仅加窄 releaseImport。主集成 03 follow-up publishManifest / derivedDigest history pins / editor-history-limit 与本工作独立，串行冲突时保留两边逻辑；Composer 的 onClearHistory callback 与本 clipboard effects/event props都要保留。diagnostics schema/catalog 由主 Agent 加四 code/五 operation，本分支不改它们。

尚未覆盖：真实 macOS 系统 clipboard 的私有 MIME/HTML 保真与其它 App roundtrip（主 Agent统一 probe）；真实 native image decoder（测试注入 validator，实际 PNG/对象/SQLite/PM 已使用）；用户确认的动态 refs transfer semantics。支持独立图片和冻结选区，text/PDF/动态引用均明确可读降级；不声明完整04 resolved，不自动读取新的项目内容、不写远端或个人账户。
