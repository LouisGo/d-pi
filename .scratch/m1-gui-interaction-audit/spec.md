# AI Agent GUI 交互补遗审计（S1–S3，只读）

2026-09-28。当前授权：用户确认最近两次提交理解无误，范围锁定 S1–S3 已交付的 AI Agent GUI 交互补遗，不扩 S4/M2；先出只读审计报告，通过后再写新切片 spec+tickets 并按 TDD 实现。本文件即审计成果，不含实现票；不改源码、不推送。

基线：`c97ee19`（干净工作区，`?? .omo/` 忽略项除外）。受影响决定：D-01/D-02/D-03/D-08/D-11/D-16/D-17/D-21/D-22/D-23/D-24/D-25/D-26/D-28–D-35 均继续有效；B-04 关窗继续/M2 提醒策略/Composer 输入体验以 foundation-plan 为准。

## 方法

沿用两篇复盘的漏因模式，不猜测心理，只认行为证据：

- 三件事：事实由谁改变、还有哪些入口能改变它、用户下一步是否经真实调用链可完成（见 `m1-s3-control-recovery/integrity-review.md:32`）。
- 因果：不可逆收束/退出必须追观察归属（派发 ID/代次/版本）；单调事实（ACK/失败）与可过期观测（busy/连接/队列）分开；持久非终态必须有用户出口；跨进程每层存活分开核对（见 `causality-recovery-review.md:30`）。

抽查方式：官方文档/固定版本源码/已有证据优先；三路只读枚举 renderer/features/host/main/validation 后，对高风险项抽查源码原文核实（composer 键盘、interactions 写失败、历史分页、通知缺席、密度变量）。未逐行全审，有标注。

## 最近两次提交回顾（已对齐）

- `2008d59`：跨层提交与原生命令边界。Draft rejected 按 ID 释放捕获、disconnected 按 executingIds 定范围、prompt 命令策略封 move/wt/worktree/session delete、派发前授权/目录失败持久 rejected、收据单调合并、毫秒时间戳不作因果。
- `c97ee19`：因果观测与 prepared 恢复。observationVersion + idle-confirmed 匹配派发 ID/代次、prepared 重建后显式继续（复用原 ID、重核验、不自动派发）、原生 close 与传输断链分离、close-idle 旧观察保护。
- 共同漏因：终点早于真实点击链、替身合并故障路径、未穷举改变事实入口、未查邻接转移、结论强于证据；边界高一层、收束前提未反向审计、持久不等于可操作、进程层级被合并。

## 复核结论（2026-09-29，不改历史原文，只标施工效力）

经 `2008d59 → 548da1c` 后代码复核，以下条目为误报或论据不成立，**不得作为施工依据**；历史原文保留，仅此处标注效力：

- A3 误报：`mergeReceipt` 的 `state` 按单调规则合并，`updatedAt` 取大仅展示元数据；Coordinator 另核 `requestId`/目标/实例。不能据此新建因果系统。
- A5 误报：`captureSubmission` 拦截的是在途 `capture` 或同编辑 `captured.sequence===sequence`（防重），新编辑推进 `sequence` 后可正常捕获。不能据此改多槽 Map。
- A9 误报：`operation-result:acknowledged` 确认的是原生已处理调用，`observationVersion` 守的是回复携带状态是否新鲜。两者是不同事实；超车后仍确认调用为真，状态另行刷新。
- A12 误报：`dispatch` 非 `prepared` 快返只返回既有收据（`coordinator.ts:91`），无原生写入；`prepare` 同 ID 复用亦无新副作用。执行授权管新副作用，不阻止核对已发生事实。
- A13 表述不准：目录失败后 `canSubmit(trusted=false)` 已使 `coordinator` 走 `reject`，不先写 `dispatching`；Main/Host 两段准入出现 `dispatching→rejected` 是诚实不确定性，不是抖动。
- A16 待证实：`settleIdle` 仅删除已终态（rejected/failed/acknowledged 非 unknown）ID，非终态不因 idle 收束；stop/continue 无派发 ID 不改变此条件。需反例才实施。
- “confirm 必须卡住”澄清：指 App 永不自动作答 confirm；扩展自带原生 timeout 仍按官方以 false 结束，App 如实展示 expired（见 decisions 2026-09-29 澄清）。不据此要求 App 隐藏原生超时。

B1/B2 等已在 `ae3c5fa` 修复的真问题保持有效。本审计其余 P0/P1 仍需在各自票内复核源码为准，误报不得转入 hardening 施工清单。

## 发现清单

严重度：P0=不可逆/丢数据/卡死；P1=用户下一步走不通或误导；P2=缺口但有绕行或待产品确认。

### A. 提交/队列/停止/继续（D-11/D-24）

- A1 P1 `src/features/submission/contracts.ts:25-31`：收据 state 缺 preparing/cancelled，停止取消的提交无终态可落。三件事-1。
- A2 P1 `src/renderer/conversation.tsx:104-115`（已核实模式）：dispatching/preparing/unknown 同归“结果未知”，用户分不清未派发/在途/已取消。三件事-3。
- A3 P0 `src/features/submission/model.ts:19-50`：`mergeReceipt` 用 wall-clock 取大，注释自认非因果；同毫秒旧 reply 与事件交错靠字段钳制，未绑 request/event 因果 ID。因果-过期观测。
- A4 P1 `src/features/submission/model.ts:98-115`：acknowledged+failed/unknown 不清稿亦无手动清入口，草稿残留与回执脱节。三件事-3。
- A5 P0 `src/features/draft/controller.ts:276-308`：单捕获槽，第二次发送静默 null，前一次 rejected 才释对应 ID；DB“可重试”≠用户可点击。三件事-2。
- A6 P1 `src/features/draft/controller.ts:309-337`：`restorePrepared` 要求 revision/正文/sequence 全匹配，重打出相同 A 即 null，且 consume 要求 sequence 相等，原稿可永久不清。三件事-3。
- A7 P1 `src/renderer/composer.tsx:47-61` + `shortcut.ts:1-19`（已抽查核实）：Enter 恒调 `send()` 默认 followUp；忙时排队 vs steer 干预仅按钮区分，键盘发不出 steer。三件事-2。
- A8 P1 `coordinator.ts:45-47,85-116` + `session-host.ts:377-379`：`streamingBehavior` 两处重复构造，steer→preview `steering` 映射无收敛校验。三件事-1。
- A9 P0 `src/host/session-host.ts:425-464`：`operation-result:acknowledged` 无条件先发，被超车 continue 仍报成功而状态未应用。因果-旧观察越过。
- A10 P1 `src/renderer/runtime-panel.tsx:41-58`：Stop/继续仅按 stopping/phase/trusted 禁用，continue 在途仍可再点 stop，靠 Host 后写覆盖，无 App 层串行。因果-停续竞争。
- A11 P1 `control/contracts.ts:12-19` + `runtime-panel.tsx:34-39`：队列 64 条/单条 2048 截断无溢出计数；交互 32 项/128/`native-session.ts:133` 64 三处上限不统一。三件事-2/3。
- A12 P0 `src/main/runtime-service.ts:507-583`：prepare 同 ID 复用与 dispatch 非 prepared 快返在目录/授权校验之前，旧 target 换目录重放可绕本次校验。三件事-2。
- A13 P1 `runtime-service.ts:550-551,574-575`：授权/目录失败仍先调 dispatch 写 dispatching 再被 Host 拒，产生可观察派发抖动。因果-证明归属。
- A14 P1 `storage/submissions.ts:40-65,89-107`：`retryOf` 跳防重且 ACK 跳清稿，同 revision 多收据且重发永不清稿；`conversation.tsx:123-140` 只标来源未说明。三件事-3。
- A15 P0 `session-host.ts:306-339`：Host 派发前不复核目录身份，Main 校验与写出间 TOCTOU。三件事-2。
- A16 P0 `runtime-service.ts:210-240,243-251`：`settleIdle` 要 idle-confirmed 匹配，但 stop/continue 无派发 ID 关联，停续期 idle 可误收束提交。因果-证明归属。
- A17 P1 `validation/s3/app-control.cjs:166-179` + `app-recovery.cjs:150-167`：GUI 证据缺 steer 队列、dispatching 在途重载、continue+stop 连点。三件事-3。

### B. 原生交互回答闭环（S3-02）

- B1 P0 `src/host/interactions.ts:43-76`（已抽查核实）：`answer()` 先置 unknown 再 write，catch 直接 false，不回滚/不删 ids；下次因 status≠pending 拒绝，形成“不能重答且永久 pending”死锁。重复回答/写失败。
- B2 P0 `src/host/interactions.ts:89-95`（已抽查核实）：host_tool_cancel/host_uri_cancel 只删 ids 不更新 dialogs、不 changed；快照仍 pending，Renderer 继续渲染可答 UI，点击后 false→unknown 假象。交互-取消。
- B3 P0 `src/host/interactions.ts:15-25`：`dispose/disconnect` 不清 ids/overflow；disconnect 后 pending 永久 true，阻塞 close-idle，且无手动重问出口。断链残留。
- B4 P1 `src/host/interactions.ts:114-116,153-155`：overflow 一旦 true 永不清，多请求超 128/32/256KB 后永久 unsupported+pending，只能等进程退出。交互-不支持。
- B5 P1 `src/host/interactions.ts:26-37`：timeout 删 ids 留 expired；`DialogSchema.timeout` 可选可永不过期；原生“超时删请求不发 cancel”靠本地 timer 正确，但重订阅前无新帧时 Main 视图滞后。交互-timeout。
- B6 P1 `src/renderer/runtime-panel.tsx:219-231`（已抽查核实）：expired/cancelled/unknown/sent 一律纯文案，无“确认后重问/转历史核对”动作；是否为有意产品选择待确认。断链重答。
- B7 P0 `src/renderer/runtime-panel.tsx:135-153,220-230`：本地 sent 不可逆，Host 回 unknown/failed 仍显示“已提交”；`key={generation-id}` vs 历史 `key={id}` 致重挂载重置 sent，跨重载可重复点击而同实例内无法再试。重复回答。
- B8 P1 `src/host/session-host.ts:306-339`：有任一 pending 即全拒后续 prompt；PendingInteractions 本支持 128 并发，与 follow-up 可排队语义保守冲突。多请求并发。
- B9 P1 `src/host/session-host.ts:321-326,340-368`：30s ack 超时与 NativeSession 30s 命令超时叠加；超时后 executingIds 持有至 15min，无手动取消在途。多请求/过期。
- B10 P1 `session-host.ts:402-409,425-432` vs `runtime-service.ts:384-386,402-406`：Host 侧代次/线程不匹配静默 return 无回执，Renderer 只显示“未知”，分不清过期 vs 传输失败。过期代次。
- B11 P1 `src/host/interactions.ts:96-107`：原生 notify 直接丢弃（另见 C 组系统通知缺席）。

### C. 关窗/重开/退出/恢复（B1/B6/D-24，含 09 待决）

- C1 P1 `src/host/session-host.ts:389-396` + `runtime-service.ts:426`：attach 只回放 projection，不推 interactions；`inspect` 为空操作返回缓存，若 Main 丢视图无主动拉 Host 快照 RPC。重订阅快照。
- C2 P1 `src/preload/index.ts:87-112` + `features/conversation/model.ts:27-42`：connect 换 port 无序号；缺号 gap 永久置位，无“放弃重连转只读历史”出口。重订阅。
- C3 P1 全仓 focus 仅 `composer.tsx:210-215`/`runtime-panel.tsx:193-210`/`main/index.ts:192-197` + CSS `:focus-visible`：NativeDialog 无 autoFocus/焦点陷阱/aria-live，pending→unknown/expired 靠轮询文本；S3 spec 要求覆盖焦点但无证据。焦点。
- C4 P1 `src/host/session-host.ts:433-464,199-214`：control 有版本守卫，但 `d_pi_control_state` 被动帧无版本直接覆盖 paused，与在途 control 竞态以最后到达为准。观察版本。
- C5 P1 `src/main/index.ts:150-155,395-397`：点 X 一律 preventDefault+requestClose（仅核对草稿），不查 hasActiveWork；符合“关窗继续”但无后台工作显式告知，与 Quit 体验分裂。关窗继续。
- C6 P0 `src/main/index.ts:406-434,441-462` + `features/control/quit.ts:9-28`：wait 无超时无进度，永不结束则永不退出；stop 失败直接 dispose 无重试；will-quit 无超时，hang 后 catch 重建窗口但轮询已死，需再按一次 Quit。真退出。
- C7 P0 `src/main/host-connection.ts:97-112` + `session-host.ts:467-510`：closeIdle 5s 超时 reject，但 Host 可能随后仍 exit(0)；Main 残留旧引用，下次 start 被单写门槛挡，需重启 App。真退出。
- C8 P1 `src/main/index.ts:103-120,343-364`：关窗令牌 5s 超时保留窗口；令牌不对直接丢弃；`render-process-gone:162-184` 未等 prepareClose 即 destroy，内存尾部丢失仅文案告知。关窗继续。
- C9 P0 `session-host.ts:238-249` + `runtime-service.ts:210-240`：control 被动空闲帧 `void refresh()` 不等待，与 dispatch 同 tick 时旧飞行可先发 idle-confirmed，靠 afterSubmissionId 拒绝正确但依赖时序；缺“d_pi_state 慢回+连续两次派发”用例。idle 误收束。
- C10 P1 `runtime-service.ts:210-240,597-624`：control 空闲先到、state.busy 后到时 idleConfirmed 已置位但 settle 被 busy 挡，需等下一次 idle-confirmed，无 state 空闲补发证明。idle/后台。
- C11 P0 `session-host.ts:467-502`：close-idle 强校验仅 `sdkEntry` 路径，非 SDK 只查 busy/pending/starting，queued/background/pendingAsync/admitted 可被跳过；`HostStart.sdkEntry` 可选，契约未强制。后台任务。
- C12 P1 `runtime-service.ts:192-209` vs `session-host.ts:93-123` + `host-connection.ts:39-45`：closeIdle 成功与异常掉线都走 onExit→unknown，靠 hasActiveWork 间接推断，建议补显式 code。close vs 断链。
- C13 P1 `native-session.ts:177-191,133,156-160`：忙闲守卫全在 SessionHost，NativeSession.close 无守卫；pending≥64/1MB 拒绝皆通用 Error，输入超限被 dispatch 转 disconnected(write) 误报断链。关窗/退出。
- C14 P1 `submission/model.ts:19-50,76-96`：accept 只留最近 100 条，超限最旧 prepared 失“继续发送”入口；rejected 无一键重发。重建出口。
- C15 P1 `submission/model.ts:125-167` + `conversation.tsx:131-155`：sending 互斥再次点击直接 return 无队列；慢网重复点击无反馈；冷恢复 target==null 时 resend 抛 `Resend source unavailable` 无文案区分。重建出口。
- C16 P1 `conversation.tsx:88-100,144-148,169-236` + `native-history.ts:66-75`：unknown 警告正确但 History cursor 绑文件身份，轮转后 `changed` 无一键从头重读。重建出口。
- C17 P0 `runtime-service.ts:133-134,479-486`：冷恢复单写门槛为进程内内存标志，非跨进程锁；DB 行可被拷走/删除绕过；spec T4 已明示仍缺失。冷恢复单写。
- C18 P0 `storage/database.ts:76-80` + `runtime-service.hasActiveWork` 冷启动 view==null 返 false：dispatching→unknown 重载、unknown+admitted 组合未覆盖；unknown 收据冷启动不挡 Quit，与热路径保守挡退出分裂。冷/热语义。
- C19 P1 `storage/threads.ts:63-84` + `runtime-service.ts:164-167`：bindNativeSession 冲突后 close-idle 可能因 busy 失败残留原生进程；nativeSessionRef 绝对路径，目录改名多处重验但历史文件存在性仅阅读时暴露。冷恢复。
- C20 P1 issue 09（待决，`issues/09-quit-discard-decision.md:1-9`）：停止后非空队列无“放弃剩余输入后退出”出口；spec 要求下次试用前回看；`app-recovery.cjs:186-188` 把 Quit 对话框断言为不应出现，未覆盖有队列/后台/交互三按钮分支。真退出产品待决。

### D. 阅读/流式/历史（V1-07/基础契约 §6）

- D1 P1 `conversation.tsx:43-83` + `conversation/projection.ts:93-100,170-211` + `model.ts:34-51`：流式 put 全量替换经 Streamdown 重渲染，无滚动锚定/选中保留/跟随暂停；32ms flush 可打断选中复制。流式选中。
- D2 P1 `conversation.tsx:72-79` + `app.css:236-241`：assistant Markdown 全量渲染无折叠/虚拟化，仅 pre 限高；与 V1-07“长输出不无限扩张”未对齐。长输出。
- D3 P0 `conversation.tsx:169-236` + `history/contracts.ts:15-36` + `native-history.ts:29-147`（已抽查核实）：HistoryPage 无 busy 分支；运行中 streaming/compacting 的 session_busy 只能落 invalid/unavailable 或 error“读取连接失败”，与“busy 不能显示成无历史”冲突。session_busy 占位。
- D4 P1 同上 + `foundation-contracts.md:110-114`：HistoryCursor 仅 offset 分页，无 watermark/seq/generation；无缺号重同步提示。watermark/seq。
- D5 P1 `conversation.tsx:210-213,228-230` + `native-history.ts:82-100,124-133` + `projection.ts:173-186`：单行超 PAGE_BYTES 直接 unavailable/unsupported，无字节区间+重读占位；gap 仅一句文案，无受影响 ID 区间/droppedBefore。截断占位。
- D6 P2 `conversation.tsx:214-222` + `native-history.ts:18-26,102-112`：分支仅 `{id} ← {parentId}` 文本，无分支选择/当前位置/branch()/navigateTree()；压缩后来源/位置一致性待验证。分支压缩（S4 前不实现，此处仅记缺口）。

### E. Composer 输入（V1-04/D-33，M2 范围需标注）

- E1 P1 `composer.tsx:47-61` + `shortcut.ts:1-19`：无 `@` 菜单状态，Enter 优先于候选确认；迟到/连续查询可被发送吞掉。@ 确认冲突。
- E2 P2 `composer.tsx:26,112,130-136,242-244` + `app.css:133-148`：放大仅改 min-height，无对话框/焦点陷阱/Esc/覆盖恢复状态机；附件/选区保留无代码（附件根本缺席见 E5）。放大模式。
- E3 P1 `composer.tsx:48,63-66,84,146` + `shortcut.test.ts:4-24` + `plain-text-editor.ts:16-31`：IME 仅防误发，无候选确认显式区分、无组合中禁用可视；缺拼音+@+展开组合用例，真机 IME 待 foundation-plan 验证。IME。
- E4 P0（M2）`src/renderer/*` 无 mention/@/索引/迟到丢弃实现；`@message@List`、前导/中间 @、真实项目规模延迟均无候选。@ 检索整体缺席。
- E5 P0（M2）附件管线整体缺席：无预览/缩放/重排/删除、无 preparing/ready/failed、无 MIME/损坏校验；composer 仅文字，`foundation-contracts §4` 私有存储/冻结/GC 无 Renderer 接入。附件整体缺席。
- E6 P1（M2）`runtime-panel.tsx:26` + `submission-admission.ts:5-17`：仅展示模型名，无切换器；无附件/引用与目标兼容重预检、无阻止+显式选项、无切回/准备中切换/迟到处理。模型预检缺席。
- E7 P1 `draft/controller.ts:255-275`：超限仅文字 4MiB；无单源 25MiB/单提交 100MiB/PDF100 页/编码后字节/stripImageInput 预检 UI。超限。

### F. 多 Thread 提醒（foundation-plan 167-173，M2）

- F1–F5 P1（M2）`app.tsx:35-55` + `threads/contracts.ts:11-14` + `model.ts` + `main/index.ts` + `host/interactions.ts:96-107`（通知缺席已 grep 核实 `src` 无 Notification）：无 Thread 列表/待答/失败/完成徽标；无不抢焦点契约；系统通知整体缺席（notify 直接丢弃，偏好仅 theme/density/sendKey）；无点击定位；过期仅终态文本无侧栏联动；后台活动仅计数文本，无完成通知偏好分支。均为 M2 已确认策略的未实现部分，本轮记缺口不提前实现。

### G. 主题/密度/可访问/图标（D-17/D-31/D-32）

- G1 P1 `model.ts:140-141,161-162` + `tokens.css:49-54`（已抽查核实）：compact 仅覆盖 control/panel/gap，editor/sidebar/content/text 未联动；列表行距/命中区/虚拟重测无代码。密度部分缺口。
- G2 P2 `url-decoration.tsx:28-46`：每个链接 createRoot 独立树，未验证继承 data-theme/density/reduced motion。弹层继承。
- G3 P2 `tokens.css:3-48` + `app.css` + `button.css` + `.oxlintrc.json:18-28`：token 单源成立、无硬编码 hex，但对比度/hover/disabled/focus 深浅验证无证据；需深浅×两密度真机记录。验收证据缺失。
- G4 P1 `button.css:27-30` + `app.css:141-148,189-202`：Button/tiptap 有 focus-visible，但 draft-comparison/native-answer textarea、details>summary、侧栏文本无；tiptap outline:none 依赖父选择器，Tab 进入可无可见焦点。焦点可见。
- G5 P1 `composer.tsx:122-152` + `conversation.tsx` + `app.tsx:60-85`：展开/主题/密度/下一页/复制/继续发送皆鼠标 onClick，无 Esc/跳链/地标导航；快捷键提示与 @/IME 实际不一致。键盘。
- G6 P2 `icons/common.tsx:1-69` + `app.tsx`：Hugeicons 经 Icon Layer 形式成立（供应商仅 common 导入，size/stroke/currentColor/aria-hidden 符合），但缺 IconButton 语义封装、未知品牌降级（仅 github/generic）、reduced motion/四档视觉样例、bundle 裁剪证据；路径与合同 `icons/` 组织差异需记录。图标部分缺口。

### H. 诊断/权限/命令边界（D-21/D-22/D-25，S3 已有边界需守）

- H1 P1 命令边界：S3 已封 move/wt/worktree/session delete，但顶层 delete/new/clear/resume/fork/branch/rewind/tree/quit 仅 TUI handler、fresh/add-dir/remove-dir 语义、受信任扩展副作用仍未宣称审计；普通文本可进扩展/模型非沙箱。保持 integrity-review 排除项表述，不扩大。
- H2 P1 诊断：traceId/类型化错误/unknown 保留已有；迟到回执无诊断（`native-session.ts:118-127` 双匹配忽略后无计数）、错代 ready 吞没（`host-connection.ts:51-56`）、Host 代次不匹配静默 return 等三处无“过期 vs 传输失败”区分。用户排障时易误判。
- H3 P1 权限：项目执行信任与 App 文件访问分离已有；只读 Git 外部 diff/textconv 限制、选区来源版本冻结、symlink/句柄复核为 S4 自身规格范围，本轮不实现，仅记 S3 收尾已声明的 S4 前置。

## 产品待决（需用户对齐，不得自行定案）

1. issue 09：停止后非空队列“放弃剩余输入后退出”是否提供正常出口？本轮仍仅记录。
2. B6/unknown：expired/cancelled/unknown 是否永远无“确认后重问/转历史核对”动作？若为有意选择需记为已确认。
3. A11：队列/交互超限走静默截断还是显式计数+unsupported 提示？
4. F 组：M2 多 Thread 提醒/通知偏好是否仍按 foundation-plan（默认仅标记完成、可开启完成通知、不抢焦点）验收？
5. C5：关窗后台继续是否需要显式告知？还是保持与 Quit 双轨体验？

## 下一步准备（待用户批准后执行，不在本轮实施）

1. 新切片 `.scratch/<slug>/spec.md` + `issues/NN-*.md`（一票一文件，Status/Blocked by 按 issue-tracker），复用本审计为证据，不改写 S3 已交付结论。
2. 按行为拆票：建议先 P0（B1/B2/C6/C7/C11/A12/A15/A16/D3/E4/E5 为 M2 则后移），每票写清拥有者/生命周期/验收证据；GUI 票消费无头合同并验焦点/主题/密度。
3. TDD：先失败测试（真实调用链、字节级/帧级交错、Renderer 重建、冷/热双路径），最小修复；`pnpm check/build` + 受影响 validation；试用交付后本地 commit，不推送。
4. S4/M2 未授权项只记录，不实现；重要产品判断先对齐（上节 5 项）。

## 限制

- 本轮只读，未新增/修改实现与测试，未跑 `pnpm check/build/validation`（实现阶段按受影响路径补）。
- 三路枚举有抽查核实（composer/interactions/历史/通知/密度），其余文件行号待实现票内复核；若复核发现误报，以源码为准并更新本审计。
- 旧候选包、S2 证据、S3 交接保持历史含义；用户试用仍待反馈，不视为认可。
