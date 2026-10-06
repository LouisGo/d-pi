# M2 提醒预算修复：独立 Spec 增量复核

## 固定范围与覆盖方式

- base：`833d571ea59508ecabdf4f3c681a64625358f928`
- head：`e649ae443fd20d704a28d7ca532fb5451adf453e`
- 实际 merge-base：`833d571ea59508ecabdf4f3c681a64625358f928`
- 命令：两端完整 SHA 的 `git rev-parse`、`git merge-base`、`git diff <base>..<head>` / `--stat` / `--name-only`。
- 原 review worktree 已清理，本次通过 `git archive <固定head> <相关源/合同/原始证据>` 建立 `/tmp/d-pi-attention-budget-final-input` 不可变输入。审查未依赖正在变化的主 worktree 源码。
- 覆盖：attention.tsx、app.css、直接相关 token、attention.mjs、package.json、当前提醒 spec/01b 及相关提醒/导航/GUI 几何合同；独立核对真实预算 red log，未采用作者报告作为结论。

## 结论

原 P2 **源码层问题已关闭**；此次增量新增可达高价值 Spec 问题 **0**。本结论是源码/合同/断言质量判断，m2.19 实际 green 与候选交付仍由主 Agent 完成核实。

## 修复与断言核对

1. AttentionCenter 专用 class 仅附加到提醒区域，不改变其它 notice。CSS 用共享 `control-height` 设 `max-height: calc(2 * var(--control-height))`、`flex-shrink:0`、`overflow-y:auto`、`overscroll-behavior:contain`；因此内容行增加只增加内部 scrollHeight，不再按条数无界消耗 workbench 高度。normal/compact 自动随既有 token 更新，没有私建颜色/密度或改变执行事实。
2. entries.map、事件身份、unread 与 Thread 点击入口完整保留；read failure、coverage gap、blocked retry、stale 提示仍在可滚动区域内，没有删事件或伪造已读来换空间。两行预算是显示高度，全部操作仍为原生可 focus 按钮。
3. validateReminderBudget 使用实际 DOM 条目（至少 4）和当前可见 reading-pane，按真实 computed lineHeight 要求当前阅读高度容纳 4 行，并检查 A_UNSENT_DRAFT 原文。该断言直接验证原行为缺口，而非复述 max-height 实现。
4. 断言还 focus 最后一个提醒，检查它完整落在提醒区域内、确实成为 activeElement，再用 preventScroll 恢复原焦点与原 scrollTop。这能验证内部滚动与底部操作可达，没有点击导航或发送请求来污染当前用户状态。
5. 几何测量分别插在初始 normal、compact、560×720 窄窗口、恢复后的布局，以及开启实际 native inspection 时同 App 重开之后；记录 theme/density/viewport、centerHeight/scroll/client/readingHeight、lastReachable 与截图。覆盖随 actual native 开关分开，不以模拟 callbacks 补送达。
6. version 仅 m2.18→m2.19，属于同一 M2 提醒候选的预算修复。spec 保留系统 native failed/App 回退、旧包预算 red、m2.19 待实际验证与用户认可 pending；01b 保持 claimed 等候实际候选，不借此完成父 M2、扩 M3、使用签名密钥/个人凭据或推送。

## 红灯证据与验证界限

`attention-budget-red/package-log.txt` 已真实到达 validateReminderBudget 断言并失败：5 entries、centerHeight/scrollHeight/clientHeight=160、readingHeight=0、lineHeight=19.5、draft=A_UNSENT_DRAFT。它证明阅读空间被提醒挤掉且草稿保留，与原源码/截图发现一致。`attention-budget-initial-timeout` 的较早 interaction focus 超时是独立失败，未当作预算红灯。

本 reviewer 没有 install/build、启动或操作 App、改产品源/管理状态，也未复制 App。未查看或预设 m2.19 actual green 结果，未确认新候选系统显示/真实 click、Finder 同 Main 重开或 ZIP/app.asar 同源；旧 m2.18 native failed/重开证据不可外推为新版本完成。主 Agent 需核实本次 actual 几何与末条操作、同源和受影响工程 checks，之后才关闭试用/工程相关状态；用户认可继续独立。

## 追加：validation-only 样本修正独立复核

- 固定 base：`e649ae443fd20d704a28d7ca532fb5451adf453e`
- 固定 head：`63a578f02ec3c3ce5b901d8c113094c2e5b37953`
- 实际 merge-base：`e649ae443fd20d704a28d7ca532fb5451adf453e`
- 两端完整 SHA 的 diff/name-only 已确认 production TSX/CSS/package version 没有变化。用固定 head 的 git archive 建立 `/tmp/d-pi-attention-budget-sample-input`，独立阅读 attention.mjs、固定 package.mjs 的正式选择 helper 和原始 sample-missing log。

新增可达高价值 Spec 问题 **0**；前述原 P2 源码层关闭的结论保持。该增量纠正验证样本，没有放宽产品预算要求。

新样本路径是 4 次正式 New Thread 按钮创建、等待 Main active_thread 与真实 Runtime 就绪、输入独立 M2_ATTENTION_BUDGET_n 并点击发送、等待真实 localhost supplier request 被持有，然后通过侧栏按钮回到 A 且等待 Main/Renderer 选中身份，才释放实际 SSE response。每个 Thread 都从 shipped attention snapshot 观察到 completed+unread 后继续，不构造 Main/Runtime 事件、不直接改 SQLite 或 unread。supplier 的 completed mode 逐次 release 删除 in-flight holder，串行确认完成避免与下一次 holder 重叠。最后保存实际预算 Thread IDs 与 snapshot；开启完成提醒才展示这些新未读条目，与原默认完成不弹提醒规则一致。

validateReminderBudget 新增等待真实 DOM 至少 4 条 entry 和实际 reading-pane，避免将已访问旧 Thread 的合法已读状态当作产品故障；仍立即核对 entries>=4、readingHeight>=4*lineHeight、A_UNSENT_DRAFT 和末条 focus 完整落在 center 内。额外要求 scrollHeight>clientHeight，确保多条实际样本确有内部滚动，并继续恢复原焦点/scrollTop。没有以等待代替几何断言，也没有降低原阅读要求。

原 `attention-budget-sample-missing/package-log.txt` 在预算入口收到 null、失败原因是 sample missing；这与先前预算真实红灯的 5 entries/readingHeight=0 是不同证据，不将它归入生产 budget 回归。新候选实际 green 尚未由本 reviewer 执行/核实，不能因这次源码复核声称包内几何/滚动或 native 已通过；实际运行结果仍由主 Agent 后续独立核对。
