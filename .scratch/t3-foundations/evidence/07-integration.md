# 07 组合验证与交付记录

2026-10-07。主 Agent 单写集成、规格、状态和生成结构，原 checkout `5983233` 为固定开发基点，隔离树分支 `codex/t3-foundations`。

## 已冻结范围

五组独立目标与接线固定为 `ae9cb2c4474b462fa993e4630d3e45ead47736c6`；04仍实现中，动态引用语义待用户选择。01/02/03独立提交按序 cherry-pick，application及locale/architecture自动合并后核对最终源，保留新的诊断health和读取生命周期。

## 组合检查

2026-10-07 15:25–15:26，该冻结输入执行 `pnpm check`，退出0；包括工具环境、全环境typecheck、lint/design/i18n、source边界、architecture、documentation、structure/status、架构负例/tooling和全仓测试。Vitest **163 files passed /1 skipped，937 tests passed /2 skipped**。既有 opt-in native/reference及平台限制不据此关闭；负例刻意输出SIGTRAP/缺lint工具，整体断言通过，非真实环境失败。

05生产接线后的 `pnpm build` 通过；真实Electron `--anchors`、Native/Files/Git/SQLite/PM各层实际证据分别在01/02/03/05/06。没有真实远端供应商/真实账户/发布包验收或用户认可。完整check日志临时保存在 `/tmp/d-pi-t3-check.log`，可由本提交和命令重做。

后续组合复核补齐新增history-open/update/release的安全diagnostic operation目录。新原始落盘用例先得到operation=unknown（真实红灯），固定目录后identity保留，Writer和实际附件IPC **13 tests passed**；reader另12个回归通过。没有放宽对任意operation/code/原始Cause的过滤。

## 独立评审

较大切片依当前review skill使用两位只读独立 reviewer，Spec与Standards都固定base `598323321c8c2ba6eb177097e2042510c3b79d87` /head `ae9cb2c4474b462fa993e4630d3e45ead47736c6`，核对merge-base及不可变源码。结论尚未收到；04与修复ref须补查后才能宣布全范围通过。

## 剩余

该冻结前缀时04独立clipboard、动态引用选择、评审修复/刷新、最终组合check/build及Dev交付尚未结算。后续结果在以下追加记录，工程/trial/acceptance继续分别维护。

Spec轴冻结范围发现1个P2：Git二次采样把unavailable统称changed。主Agent追加真实超5MiB文件、移除临时仓库元数据两个回归，均先失败（too-large/not-git→changed），修复先保留真实unavailable后23个Git回归及Main类型通过。Standards轴已证实同PDF ID重试产生新derivedDigest未补旧历史lease；保持claimed，由03 worker隔离修复，未宣称已通过。

## 最终已实施代码与组合验证

冻结生产代码 `fb7f5baf4d7547a90c8d008947815b4e0d742c3c`：03修复源 `3780cb1` 集成为 `e795933`，04独立源 `4678ec1` 集成为 `fb7f5ba`。Composer连续性测试冲突保留两项独立行为；Main同步publishManifest、editor-history-limit、clearHistory回调与clipboard constructor/release/close均保留，未改变SQLite schema。

2026-10-07 15:54–15:55，生成结构后完整 `pnpm check` 退出0：全环境类型、lint/design/i18n、source边界、architecture423files、文档/结构/status、架构负例/tooling和全仓测试通过。Vitest **169 files passed /1 skipped，959 tests passed /2 skipped**，测试阶段17.28s。`pnpm build` 退出0，保留既有PURE/chunk-size警告。没有远端CI/发布包/实际供应商和用户认可证据；默认opt-in跳过不算功能通过。

2026-10-07 15:56，`node validation/m2/reading-layout.mjs --anchors --clipboard` 退出0。真实生产Main/preload/Renderer + 1×1 PNG原生decoder、SQLite、Chromium ClipboardEvent和macOS通用pasteboard：本源文字+实际图片复制→另一Thread原生粘贴，target ID不同、input digest相同、ready；一个原生Undo移除整段、Redo恢复相同target ID。系统剪贴板通过私有MIME或HTML envelope到达目标，未分别声称两种flavor或其它App roundtrip均保真。helper在测试前保存原全部formats，在finally按changeCount/owned hash核对，实际结果 `restored`，私有临时文件已删除；不输出原剪贴板内容。

同次probe复核宽度、Composer隐藏、view返回和Thread A→B→A，anchor-10偏移40.21875保持（相对漂移0，绝对误差0.21875px）。实际数据库 submissions/nativeBindings均0，没有model request。原始结果 [electron-clipboard-geometry.json](electron-clipboard-geometry.json)。第一次probe的 `document.execCommand('copy')` 因无浏览器用户动作返回false，是验证脚本接缝失败且未写剪贴板；改用实际CDP编辑键命令后通过，未改产品实现去适应测试。

Standards独立关闭原PDF P2：固定 `ae9cb2c…e795933`，原真实PM/SQLite失败复现转绿，GC删除0、Undo后prepare成功；预算/GC交错/显式清史及Composer接线共8 files/37tests通过。Spec已独立关闭Git P2（`70b5528`，4files/45tests）。最终04与组合增量两轴review继续记录在下方。

最终Standards冻结base5983233→fb7f5ba，15files61tests、architecture423通过，没有新material问题；新增独立late-clone真实Main/PM/SQLite交错证明目标编辑后不插入，discard后解除source引用真实GC删除1对象。最终Spec同源13files60tests通过，但另一个独立实际回归确认P2：32源图×4次paste→立即Undo→保存空稿→显式清史/awaitrelease，第5次仍typedbusy；只有document release解除128个未采用clone。复现 `/tmp/d-pi-t3-spec-final.vGCMWQ/tests/integration/spec-review-clipboard-handoff.test.ts`；production尚未修复时16:00:05真实红灯。review不能通过，保持票claimed；worker由8280951固定基点隔离修复。完整check/native系统通过未涵盖此差额，不能代替独立审查结论。

## 清理确认与恢复复核

正常额度回收修复源 `072921e0865fe8aed17f3fe45a78a96dbf691c3f` 串行集成为 `466e08c6fe894f264503a0e8fa299ebbc8c012b3`。Spec原复现转绿，第五次实际粘贴32个新token并一次Undo回空稿；针对性8files/33tests通过。Main按可信document/Thread/历史epoch回收未采用克隆，保留当前正文、Redo和其他cached epoch依赖；普通PDF清史不重建历史pin。带80002候选ID的真实preload/Zod分块证明上限及失败重试，未放宽单次wire预算。

该冻结输入16:32–16:33完整 `pnpm check` 退出0：170files passed/1skipped，968tests passed/2skipped，测试阶段17.81s；architecture423files及全部常规工程检查通过，`pnpm build`通过。日志 `/tmp/d-pi-t3-final-check.log`、`/tmp/d-pi-t3-final-build.log`。后续源码改变需刷新组合检查。

两轴各自真实复现同一新P2：RPC接缝第一次release返回unavailable且未执行Main，后续普通图片atom的成功update清掉失败；保存与retry报成功而原release未重试。Spec另外确认再次reset丢原leaseId，以及cache threads=0真实destroy/eviction后model/barrier移除、重入同Thread无可重试owner；二者实际GC均deleted0。复现为 `/tmp/d-pi-t3-spec-handoff.ZEOsCn/tests/integration/spec-review-handoff-failure.test.ts` 与 `/var/folders/0_/wqjm38lj5j5frqmvd7c4m5yh0000gn/T/d-pi-standards-466e08c-serso3uj/tests/integration/standards-handoff-failed-release.test.ts`。固定466e08c的Standards针对检查15pass/1fail、architecture通过；不能把旧P2已关闭写作最终review通过。主Agent先补spec恢复合同，再由worker从466e08c隔离修复；没有扩大到未证实的其他生命周期问题。

17:23–17:24，针对新PM事务拒绝入口，主Agent先补编辑准入合同并用真实Composer/ProseMirror filter重现：冻结选区未进入正文，但onAttachmentApplied已经调用一次，12pass/1fail。修复以实际文档核对插入结果，失败保留请求；history准入状态改变会重新尝试，同ID确认后只应用一次。相同真实用例及现有Composer连续性13tests通过，日志 `/tmp/d-pi-t3-context-admission-red.log`、`/tmp/d-pi-t3-context-admission-green.log`。该证明是PM拒绝接缝，最终预算真实路径仍交固定集成源独立评审，不伪称Main失败恢复已通过。

恢复修复源 `a2ce81d22aac27bc689a03d13b19a198d4811f0f` 串行集成为 `447e318`，完整[修复证据](04-clipboard-recovery.md)保留真实红绿及窗口9 history owner、9 waiting source/80,000 candidates预算和正常ACK自动准入。主Agent另完成必要失败GUI接棒：新core已保留discard原ids，原失败卡片仍显示不能生效的移除动作；真实UI18pass/1fail，隐藏该动作后可点击重试，以相同ids收到cancelled ACK才ready，正文不变。Composer与附件GUI组合 **2files/32tests通过**，Renderer严格类型、Biome通过；日志 `/tmp/d-pi-t3-cleanup-controls-red.log`、`/tmp/d-pi-t3-cleanup-controls-green.log`。最终固定集成源的两轴review及完整门禁继续追加，工程票尚未依作者绿灯结算。

17:47–17:50，两轴固定 `466e08c…307850b`，原清理恢复反例均转绿（Spec 8files/66tests，Standards 9files/60tests，architecture423）。同时独立确认迟到导入的discard绕过model，RPC失败时ready且无重试入口；Standards的4×32clones真实样本再次耗尽128额度，GC0。先追加迟到清理合同，再由worker窄修。Spec另外在正常第十Thread、旧LRU release在途时用真实React复现 `Maximum update depth exceeded`，原因是pending admission的getSnapshot每次创建新对象；不是故障注入或act warning。

17:51–17:52，主Agent复用真实PM/Main/preload/SQLite正常10thThread场景，真实React先失败（1failed/12skipped），改为稳定pending快照后可以显示waiting并在真实Main ACK后自动ready，无需用户retry。缓存、Composer及该集成回归 **3files/32tests通过**；Biome通过。日志 `/tmp/d-pi-t3-history-snapshot-red.log`、`/tmp/d-pi-t3-history-snapshot-green.log`。后续固定修复源仍须独立复审和完整检查。

## 当前最终验收（独立范围）

迟到清理修复源 `fb540bf9cc67c6bf5e8a69d3a0ff43200621e98d` 集成为 `d07d3eb`；生产源最终冻结 `477b85459a4e779044ec499c684b5047e31f9b14`，工作树干净。两轴都固定 `307850b…477b854` 并核实merge-base：Spec原迟到discard与React循环反例转绿、原跨编辑/reset/eviction三条恢复反例继续绿，新增同Thread真实卸载/重挂后仍使用原IDs，仅discard ACK才ready/保存，GC删除1；受影响4files/40tests通过。Standards独立128clone样本四轮各32：每轮首次discard失败保持blocked，新import不启动，retry相同IDs获Main ACK后ready；四轮后继续import成功，完整有界GC续扫物理删除1。旧release失败恢复与cache/React接缝共4files/19tests、architecture423通过。所有已证实P2已关闭，无新可触发高价值问题；两位未重复root完整门禁或原生probe。

证据校正：307的128clone复现中单批GC0不能独自证明pin泄漏，manifest数量超过扫描预算时需要续扫。当时quota busy、ready及retry=null已足以确认责任缺失；最终闭环使用真实ACK、额度恢复和完整有界续扫，不能将单批计数当物理回收总量。只有存活Thread的adapter/Editor卸载及重挂路径在此次闭环；不将任意ThreadModel.dispose与Main document释放等同。

17:55–17:57最终组合：`pnpm build`在477b854退出0，保留既有PURE/chunk-size警告。首次完整check于status门禁停止，原因仅新增spec合同后看板生成哈希尚未刷新；`pnpm report:status:write`生成并提交0a7e9a5后，重新完整 `pnpm check` 退出0。全环境type、lint/design/i18n、source、architecture423、文档/结构/status、架构负例/tooling和全仓测试均过，**172files passed/1skipped，989tests passed/2skipped**，测试阶段17.74s（17:55:31开始）。默认opt-in/platform跳过仍不算通过。日志 `/tmp/d-pi-t3-recovery-check.log`、`/tmp/d-pi-t3-recovery-build.log`；0a7e9a5与477生产代码相同，后续交接提交只改文档/证据。

同轮 `node validation/m2/reading-layout.mjs --anchors --clipboard` 退出0。重新使用实际生产Main/preload/Renderer、PNG decoder、SQLite、真实Chromium/macOS pasteboard，复制文字+私有图片到另一Thread：newTargetId/sameDigest/singleUndo/redoSameId均true，原剪贴板 `restored`；relative anchor drift=0，absolute=0.21875px，宽度/隐藏Composer/视图及Thread返回均保持anchor-10。数据库submissions/nativeBindings与modelGenerationRequests全0，临时数据和子进程已清理。最终原始样本 [electron-clipboard-geometry-final.json](electron-clipboard-geometry-final.json)，原15:56样本保留。没有model网络、账户、实际OS PDF转换器、远端CI、安装包或用户认可证据。

工程结算：01/02/03/05/06 resolved，04独立范围完成、动态@文件/目录语义保持hold，07只依赖04而保持open。已实施范围由[handoff](../handoff.md)按该工作树Dev交付待试用，用户反馈/认可pending。原checkout保持clean基点5983233；集成分支未push/创建远端PR/merge或发布，worker工作树已通过App归档，集成树保留用于继续。完整目标未全部实现，因此不宣称用户要求的总退出标准已经达到。

## 用户选项1后续

用户明确回复“1”，已于f328f0e登记D-10复制冻结选择并移除hold，d6c9654补基础/模块合同，d132693记录隔离派发。已有477b854工程结果仍是此前独立范围的快照，不把产品选择本身算实现完成。

Root e93cea0新增 `--frozen-references` 原生probe：保留原阅读A/B并增加不同项目第三Thread，源image+@textfile+@direct-directory；真实Copy后等待Main实际导入/unused discard确认export ready，再删除原file、改变原dir，native paste至同名异内容目标，核对private preview/GUI/一次UndoRedo。最初错误把阅读B换differentproject，因该project没有history夹具在进入clipboard前超时；是探针布置失败且未写OS clipboard，不算产品红灯。修正后旧built477实际在ClipboardEvent/Main链路得到 `Frozen export unavailable`（尚无动态冻结/降级），18:28有效red，日志 `/tmp/d-pi-t3-frozen-electron-red.log`。finally保留原pasteboard恢复逻辑，但失败日志未采集restore.kind，不预宣称此次确切恢复结果；最终green再明确核实。
