# 03 — Thread-owned input lifecycle and editor history assets

日期：2026-10-07。分支 `codex/t3-input`；固定基点 `851d3e59aa4782266a50a7e55bb63048ec5459dc`。
范围：只实施 issue 03，工程完成待主 Agent 串行集成与独立评审。本记录不声明全体 T3 目标、用户验收或发布完成。

## 来源与设计先行

- 已读所属 spec/research/issues03、基础合同、input/execution/app-storage 与相邻模块公开面；本票先补 `docs/architecture/modules/input-context.md` 与 `src/modules/input/AGENTS.md`。
- 研究报告 `/tmp/d-pi-t3-input-reading-research.md` 独立核查原 DOCX 的建议与真实调用链。T3 固定源码 `10f39eb9ac80c9a4b7f5097575dd2addc3b6f631`：`apps/web/src/composer-undo-grouping.ts:19-63` 和 `ComposerPromptEditorTiptap.tsx:595-612` 为用户动作分组、IME、在 history 应用前边界标记的真实范例。
- 本实现沿用最小 Tiptap、ProseMirror history、Zustand 只读 view store 与 Main 权威 manifest；没有引入 Effect/XState、持久化编辑器 JSON 或第二份可写正文。
- 历史 `8187889`/`e586b97` 只作为窄 source diff 来源；审查 diff、固定当前基点后按允许路径 `git apply --3way`，解决现有导航屏障/控件差异并重新跑当前测试。没有盲 cherry-pick，也没有将旧验证结论当作本票证据；`ee902a6` 的旧文档/证据未移植。

## 已实施合同

1. `ThreadModel` 组合 `AttachmentModel` 和浏览器读取 adapter `AttachmentImports`。来源的 pending/failed/retry/uninserted completion 由 Thread 拥有，React 控件卸载不丢失失败，也不把晚结果插入另一个 Thread。取消显式重试仍保留原失败；原浏览器 File 在冻结时的失败重试不会被误删。
2. 发送在 capture 前、capture prepare barrier 中及 capture 返回后检查同一 readiness。捕获成功但新来源未完成时保留真实 prepared 收据，停止 dispatch；既有 explicit continuePrepared 使用持久冻结正文的合同不变。
3. Main 操作回复中的准备状态只保存最多 128 项有界只读投影，仅按当前 DraftController token IDs 检查已知 failed/preparing/未覆盖 PDF。删除正文来源不被无关失败阻塞；未知、恢复或已淘汰资产仍由 Main prepare 权威校验，Query 列表不双写准备真相。
4. close 冻结所有活 Thread 的来源入口和当前编辑器，保存后再核对全部 owners。每个 attempt 的释放幂等、只释放自己，迟到 close 回调不能解冻新 attempt。现有导航 flush 屏障保持。
5. Main 草稿 save 继续只接受 active Thread。正常切换先 flush，消费已确认正文不产生虚假的 dirty owner。若旧 owner 在切换后收到未确认正文，close 拒绝而不扩大后台写权限；`draft.inactiveClosePending` 给出侧栏已显示的前 6 位 Thread ID，用户切回保存/解决失败后可重试。close 等待 active save 期间产生旧 owner dirty 同样被复查，当前 attempt 已释放。
6. 独立用户动作在 PM history 处理前分组：typing、deleting、paste/cut/drop、附件插入/移除/重排及冻结选区。IME replacement 属于输入；纯 metadata `addToHistory=false` 不污染分组；undo/redo 重置动作边界。
7. `EditorHistoryModel` 是无 DOM epoch/ID/lease 协调器。Main 发 lease，绑定 trusted Renderer document + Thread，验证实际 manifest，update 需现有 lease 和递增 version。过期 open 立即 release；过期 update 无法复活已释放 lease。无二进制、任意 digest/path 或 PM 私有 Branch 读取。
8. editor cache 只从公开 `transaction.before`/`transaction.doc` 收集当前历史 epoch 的保守来源 ID 超集，在正文移除最后 token 的保存前确认 Main lease。失败保留正文/Undo，保存未开始，错误 `attachment.historyLeaseFailed` 是 retry_safe；显式 retry 恢复保护后再保存。
9. 每 epoch 最多 128 来源；每 Renderer document 最多 9 epochs（current +8 cached）、256 MiB distinct digests。达限明确清当前 epoch 的完整 history 并展示文案，正文保持，然后 release，不能静默失去 Undo 资产。消费、外部版本替换、cache eviction/超大不缓存和 window dispose 清历史/释放。缓存匹配 revision/sequence/text/schema，A→B→A 独立连续性保持。
10. Main `transientEpoch` 参与 GC awaited read 后与实际 unlink 前的所有权复核。lease mutation 同步进入 registry，不排在维护 lane 后；实际删除复核期间不 await。Renderer destroyed/process gone/full navigation 与 Main service close 释放；same-document navigation 保持。full navigation 开始到 main frame finish load 暂停新 history authority，旧 document 不能借迟到请求重新开 lease。

原草稿 DTO、SQLite schema/接受事务、执行收据、OMP 执行与 unknown/cold 规则不变。04 剪贴板引用语义、05 reading 由其他票处理。

## 红绿证据（本基点）

| 行为缺口 | 真实红灯 | 最小实现后的绿灯 |
| --- | --- | --- |
| Thread 无头来源/close 冻结 | 14:39:09 缺 AttachmentModel、未组合 Thread resources，来源 close 失败 4 项；已排除早期 merge 语法错误 | 14:39:34 5 files /54 tests |
| PM 独立粘贴动作 | 14:43:58 第二次 Undo 得到空串而非 `onetwo`，粘贴与后续输入合并 | 实际 PM grouping + Main 测试 3 pass；IME 组测试 2 pass |
| 保存前历史保护 | 14:46:22 实际 PM 最后 token 移除未发 history-update，其他旧连续性用例先过 | 14:46:57 DraftController + cache 17 pass |
| capture 后重新检查 | 14:53:04 命令为 list/prepare/dispatch，期望只 list/prepare | SubmissionModel 18 pass |
| inactive dirty close | 14:57:22 close 返回 true，期望 false，其他 14 项先过 | AppModel 15 pass；最终晚输入/save 等待边界扩为16 pass |
| Main confirmed manifest failed | 15:06:57 getReadiness([failedId]) 返回 ready，期望 blocked/failed-source | AttachmentModel5 + Thread1 pass；最终 detached Thread 接线扩为2 pass |
| GC awaited ownership race | 15:09:11 暂时仅移除 transientEpoch 复核的 mutation，8 MiB 实际对象被 unlink，deletedObjects 期望0实际1 | 恢复复核后原测试 pass：lease 在 awaited read 期间加入时对象存在；release 后确实删除 |

GC mutation 用 try/finally 恢复原源码，复核两个 epoch 条件已恢复；原日志 `/tmp/d-pi-03-history-gc-mutation-red.log`，此 mutation 未提交。已经正确的正常切换、消费、正文版本及旧 navigation 屏障补测未伪造红灯。

## 实际集成与验证

- 新 `tests/integration/input-history.integration.test.ts` 使用真实 Tiptap/PM + DraftController + Main AttachmentStore + AppStorage SQLite：导入并持久采用→最后 token 删除保存→手动 clean 保留→Undo 恢复并保存→删除→消费/外部替换清 history/release→clean 实际 unlink。该测试不靠 prepared 的独立 pin 遮盖 history release；另一个 Main 测试在受保护旧资产上真实 prepare 证明仍可发送。
- Main history 测试覆盖 foreign Thread/owner、released lease 不能 update、9 epoch cap、owner释放可再开；registry 验证 distinct digest bytes 和来源预算超限保持旧保护。
- IPC 仅 WebContents native events 使用 EventEmitter fixture，附件 store/SQLite/GC 均真实；覆盖 same-doc、full navigation、进程退出/销毁、旧 authority 间隙和实际文件删除。
- React continuity 使用实际 editor：A→B→A、选区与 Undo/Redo、消费不可 Undo、外部替换、pending picker/drop 导航屏障、lease fail 保留 body/Undo +retry_safe，以及达限可见提示/body保持。

最终相关回归：2026-10-07 15:17:03，35 files / **209 tests passed**：

```sh
node scripts/testing/test.mjs vitest src/modules/input src/app/renderer/workbench src/app/renderer/wiring/model.test.ts src/app/renderer/wiring/thread-attachments.test.ts src/app/main/ipc/attachments.test.ts src/app/main/wiring/attachment-service.test.ts src/app/main/wiring/attachment-history.test.ts src/modules/execution/renderer/submission/submission-model.test.ts tests/integration/input-history.integration.test.ts tests/integration/attachment-lifecycle.integration.test.ts tests/integration/submission-content.integration.test.ts
```

其他门禁：frozen install、runtime:sdk、check:environment（0 issues）、全环境 typecheck、lint（553 files）、lint:i18n、check:architecture（397 source files）、lint:design、impeccable detect（两个修改控件无 findings）、build、git diff --check 通过。环境为 Node24.21.0/pnpm12.8.1/Bun1.3.14/Electron44.4.5/OMP18.4.6/darwin-arm64。最后两项接缝测试18 pass。新增 test fixture 的 representation 字面量先被 TS 拒绝，修正为已有 `pdf-text` 后重新检查；不把 fixture 类型错误视为产品红灯。

已有 React act 提示出现在 @ 查询 coalescing 用例，断言通过；构建存在既有 Rollup PURE/chunk-size 警告。native fixed CLI smoke 按测试默认未启用；未宣称真实 provider、打包候选或 macOS GUI 用户验收。

## 公开面与交接限制

- app/attachments 为 input/contracts 的窄 re-export。architecture/modules.json 仅添加 input/contracts→files/contracts 的真实 DTO 依赖。
- 按主 Agent 明确授权修改 `src/shared/messages/contracts.ts` 的 `attachment.historyLeaseFailed`、`draft.inactiveClosePending`，以及 `src/shared/i18n/locales/en-US/ui.ts`、`zh-CN/ui.ts` 的输入状态/历史租约文案。
- 未改 execution host/main、共享 diagnostics/application、状态/spec/ticket、SQLite schema、生成结构文件；未 push/integrate。主 Agent 串行集成后负责全局结构/state 门禁、Spec/Standards 独立评审及可用 trial。


## 2026-10-07 独立评审 P2 修复：同 ID 新派生摘要

修复基点 `86367673059070e27a06619188ee585c0f76bb18`，隔离分支 `codex/t3-history-repair`。没有带主集成 WIP，也没有改只读 review snapshot。独立 Standards review 提供的真实 Tiptap/Cache/Controller/SQLite/AttachmentStore 用例在此基点重现：15:34:58 `deletedObjects=1`，PDF 初次 conversion failed→同 ID 进入 epoch→retry 成功→删除/flush/clean→Undo 后 prepare `content-missing`。旧实现仅在 observe 新 ID 时注册，不能把 ID 稳定当成 digest 稳定；此前03工程检查不足以发现该差额。

Main `save(manifest)` 现在经 `EditorHistoryLeases.publishManifest` 同步发布：先为所有相同 Thread/ID 的 live/cache epochs 计算旧+新 input/derived digest 超集，按每 document 的 distinct-object 预算一次预检；通过后无 await 地写 SQL、更新全部 pin/transientEpoch。Renderer version 不被 Main 内部发布消耗，旧摘要继续保护。不依赖 Renderer 重新 observe 同 ID，也不扩大任意 digest/path 授权。

超预算不执行 SQL 回调、不补任何 owner 的部分 pin、不清 Undo；旧 manifest 原字节保持。准确类型为 `editor-history-limit`，retry IPC 与 prepare 均返回真实原因，不归 `pdf-conversion-failed`。新增生成但未发布的对象沿原 import/preparation orphan/GC 合同处理。默认128来源/9epochs/256MiB不变；Main-only editorHistoryLimits 与原限额注入一样仅供确定的小预算行为测试。明确恢复入口“清除撤销历史并重试”，真实 Editor 清史后等待旧 Main lease release，随后才 retry；prepare 限额失败提供清史后由用户重新发送，未自动 dispatch。

当前源码修改允许的附件控件、Composer 的一行 clear 回调、cache 窄 clearHistory 入口，以及 retry service 的窄 typed 映射。按追加授权修改 reason enum、typed messages、zh/en reason/恢复文案；主 Agent 独立维护诊断码。未动 clipboard、ThreadModel、reading、状态/spec 或生成结构。

验证与红绿：

- 原复现15:39:30转绿，clean删除0、Undo后真实prepare成功。最终 `input-history-retry.integration.test.ts` 两个真实行为：正常保护，以及20字节预算拒绝发布/SQL unchanged/body+Undo kept→显式clearHistory awaitrelease→retry/prepare成功。
- Registry 初始新发布行为红灯15:37:53，随后绿；覆盖多个 epochs/owners、distinct dedup、client version 连续、新增 input/derived摘要超限时无SQL或部分pin、释放后不复活旧lease。
- GC实际8MiB对象在 awaited read 时同ID发布新derived：pin触发transientEpoch复读，文件保留；lease释放后两个实际对象均unlink。仅暂时移除publication pin的 mutation 在15:44:51真实红灯 `deletedObjects expected0 actual1`，try/finally立即恢复源码；日志 `/tmp/d-pi-history-publication-gc-mutation-red.log`，mutation未提交。
- 新真实Composer/PM/React测试：限额失败不清Undo，只有点击明确恢复才清；Main release延迟期间retry计数不增加，release完成后才retry，正文保持。现有连续性11项通过。
- 最终针对性回归15:45:27：12 files /87 tests passed，涵盖Main registry/GC/store/service、真实cache/Composer/附件控件与4个相关集成文件。Main/Renderer/Core及测试根严格typecheck、Biome575files、i18n、architecture416files、design lint、impeccable detect、git diff --check通过。未重复全功能矩阵或真实provider验收；既有@query act提示仍在且断言通过。

复现日志 `/tmp/d-pi-history-repair-red.log`；Main registry 红灯 `/tmp/d-pi-history-registry-red.log`。本修复待主 Agent 串行集成并复查，不把局部通过等同于全体重构目标已验收。
