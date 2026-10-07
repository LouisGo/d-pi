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
