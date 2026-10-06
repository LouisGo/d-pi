# M2 提醒列表高度预算：独立原始审查

## 固定输入

- 固定集成 head：`833d571ea59508ecabdf4f3c681a64625358f928`。
- 实际候选 evidence 的 product source：`9a8c2eea41196b5584a46fcc575ed589a7cfe392`、build `9a8c2eea-7f1a67df`、dirty=false（native-m2.18/m2-result.json）。
- 原独立 review worktree 已被清理，故未复用/改变其他聊天 checkout；以 `git archive 833d571ea59508ecabdf4f3c681a64625358f928 <相关源/合同>` 保存不可变输入到 `/tmp/d-pi-attention-budget-spec-input`，在其上只读审查。未修改产品源码、状态或构建，也未复制 App。

## P2 / Spec + GUI：无界提醒列表挤掉当前 Thread 阅读空间

位置：`src/app/renderer/shell/attention.tsx:220`；相关布局 `application-layout.tsx:71-75`、`styles/app.css:287-292,317-320,495-496`。

触发：后台多个 Thread 产生未读 failed/needs-answer，或用户开启完成提醒后积累未读 completed。AttentionContent 将全部条目直接 map 到 `<section className="notice">`；该 section 位于 workbench 的 work-content 之前，既无最大高度、独立 overflow，也无收起/聚合机制。Main 条目数量有 512 上限，但这不是屏幕空间预算；每个额外 entry 都消耗高度。workbench 是 overflow:hidden 的 flex column，work-content flex:1/min-height:0，thread-reading 也 flex:1/min-height:0，因此提醒增长会优先吞掉当前 Thread 可用阅读高度。

实际证据：独立查看 `.scratch/m2-first-release/evidence/attention-native-m2.18/m2-attention-preferences-english-narrow.png`。560px 宽的代表性窄窗口中有 **5 条**完成/失败提醒，上方提醒列表已占据约 160px，再加其 margin、toolbar/configuration、阅读导航和不收缩 Composer，Conversation 内容区被压到几乎不可见，只剩阅读导航后紧接 Composer。同组截图 `m2-cold-new-thread.png` 在无提醒时保有正常阅读空间。此结论不依赖父 Agent 对 7 Thread/6 提醒截图的描述，也不把 Main bounded map 当 UI budget。

要求：多 Thread 提醒策略要求不夺走当前操作、后台状态可点击进入；当前正式 GUI 的阅读/Composer/控制应在代表性窗口继续可用。design-system 的实际几何/无截字遮挡要求，以及原有独立滚动/布局预算约定适用。用户不应为了读当前 Thread 而逐个切换后台 Thread、将提醒清成已读。

影响：支持的多 Thread 使用路径下，当前内容读取直接退化甚至接近零高度；完成提醒属于用户正式设置，不是异常压力数据。即便用户没有丢稿，当前工作也被后台提醒淹没，属于可行动 P2。

最小修复：为提醒区域设置受共享布局/密度约束的明确高度预算和独立滚动（或等价可展开汇总），保留每个提醒的 Thread 导航、unread、当前状态与 pending retry 可达性，不截掉事件或伪造已读。无需改变 Main 所有权/调度/通知事实。预算应给当前 reading-pane 留下有意义的阅读空间，不仅约束整个 app 不水平溢出。

## 验证与未验证

- 建议用真实 SDK/localhost provider 留出至少 4 个实际未读提醒，验证同一 Thread 的 A_UNSENT_DRAFT 保留、提醒区域内部可滚动、当前 reading-pane 至少容纳约 4 行原有正文行高，且列表底部 Thread 的按钮可滚动进入/点击；覆盖代表性 normal/compact 与窄窗口。
- 本轮 `/tmp/d-pi-attention-reminder-red-log.txt` 已结束于 `attention.mjs:284` 的 M2 package timeout，尚未执行新 validateReminderBudget 断言；**不能把这次超时记作预算几何红灯**。该故障和预算发现应分开保留。原实机截图与固定源码链已足够支持本项 P2；实际数值红绿待新的定向运行。
- 当前 shell 测试与外观验证只证明提醒条目/侧栏偏好等，不证明多提醒下阅读高度。失败收据专注模式的前项修复不能替代普通当前 Thread 的预算。
- 本 reviewer 未操控 App、改变数据/状态、跑 build 或复制包；native 系统通知 failed 与 App 回退、CmdW/同 Main 重开等已在另一实际验收记录中表达，本报告不重新宣称这些通过，也不构成 M2/用户认可。

结论：新增 **1 项高价值 P2**，建议候选修复后定向重验。
