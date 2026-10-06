# 06c / 06d Spec 增量复核

日期：2026-10-06。最终固定 input `3fdb25f5c96f8b126d9b75fcbb1eaa7e8198dd6e`，对应实际产品 source `c531558406e3c3b7da4544be8df55fe92d40530f`；`c531558..3fdb25f` 只改 validation，不进入 app。原初审见 `spec-initial.md`。已确认的 harness 所有权 P2 修复在 `b575bea` 关闭；真实旧包 Copy 权限拒绝在 `15a1440` 窄修复，`c531558` 补完整隔离 fixture 后全量门禁通过，最终实际 clean 包 21 项通过，产品 Copy 真实路径复核关闭。本 reviewer 未发现最终整体范围中未解决的高价值 Spec 缺陷。本文后续保留每次失败与待验证的历史边界；最终结果以最后一节为准。

## 固定范围

- Checkout：`/Users/louistation/.codex/worktrees/m2-long-reading-candidate/d-pi`。
- 初始 HEAD：`c2fd0b3e5726ea1402e225918fd112ebc0fef5b4`，`git status --short` 为空。
- 根 Agent 在复现后更新固定 checkout 至 `b575bea8f1d27f8d5a8c5c73cdef26a9807a5c69`；重新读取 `git diff c2fd0b3..b575bea` 全部增量。最终 HEAD 为 `b575bea`，结束 `git status --short` 为空；merge-base 仍为 `df419254`。
- 产品 Copy 修复复核：根 Agent 再固定至 `15a1440853414e8312c46555c667924324afdbc2`；独立读取 `git diff b575bea..15a1440` 全部 7 文件增量。该轮初末 HEAD 一致、初末 `git status --short` 均空，merge-base 仍为 `df419254`。
- 最终刷新：checkout 固定 `84055cfad4b5d1def68051c662b16b5db32b3449`，独立读取 `git diff 15a1440..84055cf`（2 文件）。初末 status 空，merge-base `df419254`，新增只有旧 Electron integration mock 的 getURL / permission check，以及键盘/native artifact 验证修正；没有新的产品运行逻辑改动。
- 最后 validation 刷新：固定 `17da39f9bd5c9fe1777f29522c8ff64c9e792b78`，读取 `git diff 84055cf..17da39f`（2 文件、31 additions / 6 deletions）。初末 HEAD 一致、初末 status 空、merge-base `df419254`；source 仍 c531558。
- 最终固定：`218392527b16d4a14936cc95b2c7da3201f6de5f`，读取 `git diff 17da39f..2183925` 仅一行工具 article selector；初末 HEAD 一致、初末 status 空、merge-base `df419254`。
- 最终取景固定：`3fdb25f5c96f8b126d9b75fcbb1eaa7e8198dd6e`，只读 `git diff 2183925..3fdb25f` 的 6 行 harness 截图准备：进入专注阅读，scrollIntoView 当前工具段，拍摄后恢复控件。初末 status 空，merge-base仍 df419254，不改产品断言、权限或预算。
- 真实整体 base / merge-base：`df41925401d6f64cfe4ea73432ca00523f7a5a94`。
- 本轮增量：`git diff 6757270527d3126208483d72ee1e6c5cf450c9c4..c2fd0b3e5726ea1402e225918fd112ebc0fef5b4`，7 文件；fixture 类型补全、生成依赖记录、macOS clipboard helper 及 long-reading / package harness 接线。
- 产品构建来源：根 Agent 指定 `67cb1479461c5945b907b449bd407f6de2e07c1b`；validation 不进入该 app。源码增量确实没有改变正式正文渲染逻辑。
- 上述 `67cb147` 是 Copy 修复前的旧构建来源；`15a1440` 改动正式 Main 权限，必须重新 clean build/package，旧 app 不能当作新权限修复产物。

## 已确认问题与修复复核（已关闭）

### [P2 / Spec: validation 所有权] 未实际点击复制时，finally 仍可能覆盖用户的新剪贴板

- 路径：`validation/m2/long-reading.mjs:191`、`:223`；对应 fallback 在 `validation/m2/clipboard.swift:130–132`。
- 触发：捕获原始剪贴板后，用户复制恰好等于 expected fixture 的文本；`beforeCopy()` 正确拒绝，尚未派发复制动作，finally 却无条件调用 `restore(expectedText)`。无 owned 快照时，Swift fallback 仅按当前文本 hash 推断拥有者，将原始快照写回，覆盖用户的新复制。
- 要求：本轮完整 clipboard 保护须只恢复 harness 自己产生且仍拥有的 Copy，不能把内容相同视为执行归属。06d 隔离验收不能误覆盖真实系统的新状态。
- 证据：本 reviewer 在随机私有 `d-pi-validation-*` pasteboard 上确定性执行 capture 原始→fixture 模拟用户 expected Copy→beforeCopy 拒绝→restore(expected)。原始输出：`{"generalPasteboardTouched":false,"beforeCopyRejected":true,"copyActionPerformed":false,"restoration":{"kind":"restored"},"userContentStillPresent":false}`。未读取或修改 general pasteboard，私有 fixture、helper 和 sandbox 已清理。
- 修复方向：调用者跟踪确实已派发复制动作；只有该路径可以传 expectedHash 进行“Copy 后尚未 mark”的受限恢复。beforeCopy 拒绝 / 前置操作失败只能 `restore()`。根 Agent 已确认该路径并开始修复，后续固定提交须复核。
- 最终修复更强：`b575bea` 完全删除 Swift 无 owned 时的 expectedHash fallback；JS `restore()` 不再接收/传递 expectedText，long-reading finally 也调用无参 restore。未 mark 的新内容无条件 preserve，包括失败中断留下的 fixture。原 beforeCopy 拒绝、没有 click 的复现路径现在只能返回 preserved-new-content，不能写回原快照。代码/API 注释及私有 fixture 断言同步修改；即便旧调用者意外传 expected 参数也会被 JS 忽略。该已证实 P2 关闭。

## 已关闭的初审候选风险与覆盖

- 超过默认约 1 MiB 文本备份截断：旧 pbpaste stdout 备份已移除；Swift 原始快照按每个 NSPasteboardItem 的每个 type 保存完整 Data。单份 raw 16 MiB、序列化 24 MiB、128 items / 2048 types 有界；读取拒绝、无法兑现 promised representation、预算超限或读取中 changeCount 改变均在 Capture 失败时停止，调用者不会点击 Copy。
- 私有文件与输出：目录 0700、快照 0600，stdout 只含状态/count。capture 编译/读取失败清理；restore finally 清理，即使 helper 抛错也不会把剪贴板内容写入日志。
- 已 mark 后的新 Copy：owned 包含真实 changeCount 和全部 representations；后续 changeCount 不一致直接 preserve，包括用户复制相同文本的新 changeCount。恢复先准备全部对象，再复核当前完整 snapshot / changeCount，写后校验 representations。
- `/tmp/d-pi-clipboard-validation-2026-10-06.log` 已实际完成原有私有验证：multiformat、binary、textOverOneMiB、newerCopyPreserved、identicalNewCopyPreserved、interruptedCopy、budgetRejected 均 true，privateArtifactsRemaining=0。原 beforeCopyRejected 测试使用无 expected 的 restore，未覆盖上面的真实 finally 参数缺口。
- 最终原始 `clipboard-final.txt` 已完成：`beforeCopyRejected / identicalNewCopyPreserved / multiformat / binary / textOverOneMiB / newerCopyPreserved / unmarkedCopyPreserved / budgetRejected` 全部 true，`privateArtifactsRemaining=0`，声明只触及 private named pasteboard，未写 general。原 interruptedCopy 恢复保证已明确替换为保留未标记新内容，符合修复边界。
- `clipboard-fast.txt` 中固定环境、lint、文档、架构、生成报告和状态门禁通过；`check-final.txt` 有 123 passed / 1 skipped test files、722 passed / 2 skipped tests。只是读取根 Agent 的原始记录，没有把它描述为本 reviewer 重跑全矩阵。
- reviewer 精确命令 `node scripts/testing/test.mjs vitest src/app/renderer/reading/reading-segments.test.ts src/app/renderer/reading/bounded-reading-renderer.test.ts src/app/renderer/reading/bounded-history.test.ts`：3 files / 11 tests 全通过，CLI native smoke opt-in 明确 SKIP。

## 实际包记录与限制

读取 `package-final.txt` 时实际 `--long-reading --lifecycle --continuity` 失败：`validateLongReading:152` 等待长输出终结状态超时（`M2 package timeout`），证据目录 `/private/var/folders/0_/wqjm38lj5j5frqmvd7c4m5yh0000gn/T/d-pi-m2-package-df8apr`。尚未到剪贴板环节；不是 clipboard helper 的包内通过证据。根 Agent 正在调查，后续结果须按新实际日志更新。

`b575bea` 同步把重复 append 样本改为唯一索引行，避免固定 SDK 原生重复保护阻止终结；fixture 工具显式 essential，保持 supplier 确实通过实际 SDK 工具产生 10 MiB，而非直接注入 Renderer。此为验证输入与工具可用性修正，未改变正式产品源码。最终读取 `package-retest.txt` 只有 DevTools 启动行，尚未最终统计，不宣称该重跑通过；根 Agent 应在交付前确认其实际最终结果。

NSPasteboard 没有 compare-and-swap；helper 记录了最后核对与写入之间原子性限制。不可据此宣称对任意微小竞态的绝对保证。未标记内容现在保留；已 mark 后才允许按完整 owned 快照/changeCount 恢复。

未调用个人凭据/真实付费供应商；未声明用户认可、M2 全集完成或实际包准入完成。本 reviewer 只写 ignored 报告，不修改 source / 管理状态 / 版本。

## 15a1440 产品 Copy 权限修复独立增量复核

- 原缺陷证据：根 Agent 对 clean `67cb147` app trusted 鼠标真实点击 Copy，原始 `copy-rejection-probe.txt` 明确捕获 `NotAllowedError`、`Failed to execute 'writeText' on 'Clipboard': Write permission denied.`；harness 的原文复制要求被真实可达拒绝阻断。这是此前 mock `navigator.clipboard.writeText` 的 Renderer 回归无法覆盖的产品权限缺陷，必须实际修复包再验。
- 原因与范围：原 `secureWindow` permission request handler 全部 callback(false)，阻断当前正式 Renderer 的 `clipboard-sanitized-write`。新增窗口行为测试在原版本 callback false 对期望 true 真失败；TDD 记录补充该真实失败，未以预先通过的测试冒称红灯。
- 实现边界：`src/app/main/lifecycle/window.ts:36–54` 的 check/request 两入口共享 predicate：WebContents 必须等于当前应用窗口，permission 必须是 `clipboard-sanitized-write`，必须主框架，requestingUrl 必须等于当前 WebContents 的 getURL。clipboard-read、其他 permission、其他 WebContents / null、子框架及不匹配 URL 都拒绝；既有 will-navigate / webview / windowOpen 拒绝仍保持。没有新增通用读取 API 或 OMP 能力。
- 接口依据：核对固定本地 `node_modules/electron/electron.d.ts` 中 PermissionRequest / PermissionCheckHandlerHandlerDetails：requestingUrl 是请求 frame 最后加载的 URL；check 在非文档来源时可缺失，该 predicate 会拒绝。生产使用 loadFile 内置 Renderer，应用导航为 memory history，没有把 origin 粗粒度比较误当完整文档身份。
- reviewer 实测：`node scripts/testing/test.mjs vitest src/app/main/lifecycle/window.test.ts src/app/main/index.test.ts` → 2 files / 9 tests 全通过，CLI native smoke opt-in SKIP。覆盖请求成功、读取/其他权限拒绝、subframe、URL、other contents、check null 和 Main startup。
- 验收 harness 增量增加 unhandledrejection 捕获：真实 Copy 拒绝明确失败，不能因系统剪贴板已有相同文本误判成功；finally 仍使用无参 restore，之前已关闭的未拥有者 hash fallback 没有恢复。
- 工程证据限制：读取 `check-copy-final.txt` 时该轮全量结果为 1 failed / 123 passed / 1 skipped files、22 failed / 701 passed / 2 skipped tests、22 errors，exit 1。本 reviewer 未将这些尚未定位的全量失败归因于 Copy 修复，也未把前一轮 722 tests 通过挪作本轮全量成功；由根 Agent 核实并完成必要门禁。
- 收尾：该权限增量没有新的已确认高价值 Spec 缺陷；Copy 原缺陷的源码与局部回归修复已复核，实际新包 Copy / 同源身份 / 全量准入仍 pending。未操作真实 general clipboard。

## 84055cf 最终刷新：实际 SDK 大工具语义与门禁

- 根 Agent 查明上轮完整门禁失败为旧 integration Electron mock 未实现新增 permission check / getURL；`c531558` 只补 mock，未扩大实际权限。独立命令 `node scripts/testing/test.mjs vitest tests/integration/window-security.integration.test.ts` → 1 file / 22 tests 通过；输出的 MaxListenersExceededWarning 未造成该测试失败。原始 `window-security-final.txt` 另有窗口/Main/integration 31 tests 通过。
- 读取 `check-admission.txt` 核实最新完整门禁：723 passed / 2 skipped tests，34 architecture tests、70 tooling tests 通过；此前 `check-copy-final.txt` 的失败保留为历史失败，不拿它当最终结果。`pack-admission.txt` 记录 clean macOS arm64 打包在 `dist/long-reading-m2.16-final-clean/mac-arm64`，此报告不代替根 Agent 的最终 app.asar / ZIP 同源哈希核对。
- 正确 Enter 的 nativeVirtualKeyCode=36 和 keyDown CR / unmodifiedText 使真实 Chromium 按键产生 Enter 字符；仍是 trusted CDP keyboard input，分段控件的实际步骤不能用 `.click()` 代替该键盘证明。
- 固定 SDK 原生截断与 Host 截断必须区分。工具真正产生 10 MiB 后 SDK 已自动 middle truncate；进入原生 message / supplier 的仅约 41 KiB 原文，Host 没有拿到完整 10 MiB。新版 harness 读取当前 Thread 的数据库 native session_file、其 JSONL 的实际 m2_long_output 记录，再按原生 truncation.artifactId 读取 SDK artifact；验证 artifact 长度/首尾、totalBytes、direction、fixtureBytes，记录原始 SHA256；provider tool text 必须严格等于 native text；所有 GUI 工具段拼接必须严格等于 native text，并保留 `elided. Read artifact://`。因此不是伪称 Host 10 MiB 压力，也没有扩大 Host/OMP 镜像预算。
- reviewer 独立只读原始样本：`/private/var/folders/0_/wqjm38lj5j5frqmvd7c4m5yh0000gn/T/d-pi-m2-package-tgZO00/app-data/native-sessions/8f225377-66cb-45da-9b31-6855c7f47240/2026-10-06T06-50-51-833Z_01a10ffa-b839-7000-92fb-f2ccf1f42796.jsonl` 与同名目录 `0.m2_long_output.log`。artifact 为 10485760 bytes，逐字节严格等于固定的 start marker（21 bytes）+ 全部 T 重复 + end marker（21 bytes），SHA256 `d7338b6e19f80b4ddad7f6e013149b41d9c58198fca52233e12371e9d4a89cb2`；native text 41077 bytes，elision 提示可见，meta.truncation 为 middle / totalBytes10485760 / elidedBytes10444800 / artifactId0。没有打印正文或读取个人数据。
- 最终 `84055cf` 从字符串自身 Buffer.byteLength 推导 marker 边界，避免上一轮硬编码 20/22 的验证错误；旧失败记录不能当作最终通过。读取 `package-native-final.txt` 时仍只有 DevTools 启动行；当时根 Agent 预计该轮会在旧 marker 断言处失败。后续只读 probe 证实旧执行实际停在隐藏窗口的 rAF awaitPromise，未到 marker 断言，下面记录该更精确边界。最终候选只应引用实际完整通过的后续 result。
- Spec 结论：最终新增断言正确区分真实原始工具容量、SDK 已截断事实、Host 所得正文及 Renderer 表示；没有新增高价值 Spec 缺陷。完整 M2 性能组合、真实供应商／用户认可、最后实际包同源准入仍按当前规格和最终交接维护，不据本次局部验证扩大已完成范围。

## 17da39f 隐藏窗口与 CDP 有界等待复核

- 原始 `hidden-frame-probe.json`：outcome `no-frame-in-1000ms`，visibility `hidden`，page `1`，stalledMethod `Runtime.evaluate awaitPromise requestAnimationFrame`，clipboardPrivateArtifacts `0`；根 Agent 关闭仅隔离 app 并结束自有停滞 harness，旧数据保留。它证明旧 native 运行在 rAF 等待停滞，不能冒称已到 marker、工具步骤或完整包通过。
- 三处正文/工具下一段和正文返回首段的 rAF 等待，改为现有有界 `wait` 实际轮询 `data-reading-segment` 进入预期页。下一段 index+1、从末段返回 segments.length-2-attempt 与原遍历顺序一致；不依赖可见窗口动画帧调度，也不以固定延时假定 React 已提交。内容、单段节点数、长度和完整原文拼接断言保留。
- 每个 CDP call 新增 30 秒计时器；成功/协议错误用 wrapper resolve/reject 清理 timer，socket onclose 遍历 pending task.reject 同样清理，再清空 map；请求超时删除 pending 项并 reject，后到 response 找不到 task，不会重复结算。没有修改产品运行逻辑或 clipboard 拥有者规则。
- reviewer 命令 `node --check validation/m2/long-reading.mjs`、`node --check validation/m2/package.mjs` 均 exit 0。本轮按根要求没有重复 Renderer/SDK/Swift 矩阵或触及 general clipboard。
- 读取 `package-complete.txt` 时只存在 DevTools 启动行。源码增量复核无新增高价值 Spec 缺陷；真实完整 result、截图、候选同源检查仍须根 Agent 补最终通过证据。

## 2183925 最终实际包证据与结论

- 最后一行 selector 从不存在的内部工具名文本改为 `article` 内含 `details` 且带唯一固定 marker `M2_TEN_MIB_TOOL_START`；实际产品用通用“工具结果”标签，内部 SDK name 不作为产品展示要求。该 selector 在隔离 fixture 范围内唯一，不放宽单段长度、完整拼接、native/provider/artifact 真实性断言，也没有修改产品。
- 读取最终 `package-verified.txt`，日志有完整结果输出；根 Agent 记录 exit 0。独立读取 `.scratch/m2-first-release/evidence/long-reading-package-result.json`：checks 长度 21，build version `0.1.0-m2.16`，commit `c531558406e3c3b7da4544be8df55fe92d40530f`，dirty false，build id `c5315584-f375cd21`。sourceAsarSha256 为 `69b24c046a884c3d2b9aec7efa678cfa0209dd437c710a16f66aff8b2cfb37c8`（原始结果记录；最终 ZIP 同源校验由根 Agent 交接另维护）。
- 长回复真实 Copy 已通过，包括未显示的后续段和 finalized 内容；copiedLength 40784，SHA256 `3c591fdf2ca6199517e27653c2d2f75fc5a2f99910c1a5accfa187b90a93eec9`，clipboardRestoration `restored`。7 段长度为 `[8192,8192,8192,8192,4915,1752,1349]`，合计严格为40784。原 `NotAllowedError` 产品缺陷已由实际修复包路径关闭。
- 工具原始 artifact 10485760 bytes，原始 SHA256 与 reviewer 独立旧样本核验一致；obtainedBytes 41077，SDK middle elision 10444800 bytes、artifactId0。GUI 六段 `[8192,8192,8192,8192,8192,113]` 合计41073 UTF-16 units（与41077 UTF-8 bytes的单位区别保留），所有段拼接严格等于native text。首段length8192、高度336.59375，Host truncated false（SDK已原生截断，不能解释为完整10MiB进了Host）。
- 21项覆盖实际SDK/可信复制与键盘、旧段DOM/选择/scroll稳定、7段重建、Thread切换/reload无重发、原生历史分段、双scope/子Agent/lifecycle/冷只读等；system input source未实际覆盖、localhost fixture不等于真实供应商、完整M2性能组合和用户认可仍不声明完成。
- 只读查看最终暗色正常与浅色紧凑截图：分段说明、Copy、上一段/下一段与1/7页码在可视区域，正文有界且文字对比清楚。`m2-long-tool-native-gap.png` 当前视口显示主流程/原生输入/Composer，没有展示工具正文或artifact提示；该截图不能单独证明工具缺口视觉可见。原生JSONL、DOM分段拼接及检查已证明缺口文本仍保留，视觉缺口图可由根 Agent 定向重拍，不将截图取景不足误报为产品缺陷。
- 最终 Spec 轴结论：原要求与实现、修复及实际受影响路径匹配，无未解决的高价值问题。工程完成、候选试用和用户认可继续分开；最终候选交接、ZIP身份与管理状态由主 Agent 单写，本 reviewer 不据此自更新接受状态。

## 3fdb25f 最终取景与重跑确认（覆盖前一节截图限制）

- 最新原始 `long-reading-package-result.json` 来自独立隔离 root `/private/var/folders/0_/wqjm38lj5j5frqmvd7c4m5yh0000gn/T/d-pi-m2-package-9twqGK`，重新完整21 checks通过，仍为 c531558 / dirty false / build id c5315584-f375cd21。复制40784、7段原文长度、restored、原始artifact10485760与obtained41077、两份SHA256及sourceAsarSha256均与前轮一致。最新 `.scratch/m2-first-release/evidence/long-reading-package-log.txt` 对应该新root最终结果；dist中的package-verified.txt仍保留XlBDIl前轮通过，不混用旧停滞/失败运行作为本轮通过。
- reviewer 只读最新 `m2-long-tool-native-gap.png`：工具结果展开、6/6页码、末段marker及 `[Showing head and tail bytes of 1 line; 10.0MB elided. Read artifact://0 for full output]` 全部在视口清晰可见。前轮“工具缺口图取景不足”限制由该最新实际截图关闭；提示是SDK原文，不是假称App能够从该链接重读完整artifact。
- 6行取景改动只改变验证拍摄上下文：原文拼接断言已先完成，再进入专注阅读并滚动当前末段，250ms用于视觉截图稳定，拍摄后恢复控件。未用该固定延时替代分段提交/选择/滚动或复制真实性断言。
- 原始 ZIP integrity 日志包含全部压缩数据校验无错误；完整ZIP/sourceAsar stream SHA同源记录由根 Agent 维护，reviewer不提前代替尚在写入的integrity JSON下结论。
- 最终无未解决的高价值 Spec 缺陷；用户认可 pending、真实供应商和完整M2性能组合未验的限制保持。
