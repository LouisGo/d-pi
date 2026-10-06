# d-pi PR 独立 Spec 评审

固定输入：base/merge-base `1c9c30afb83a01531b11b02d30f2dd8f7ff6f586`，head `f7dff7bc2c980ae1a61fb7f3736d15a0de6a6d8c`，31 提交。使用固定 `git show`/`git diff`，未将浮动 WIP 纳入结论；评审期间主 Agent 有管理文档 WIP，生产判断仍限固定 head。遵循 d-pi-code-review Spec 轴。

结论：1 项确认的 P2；其他所查组合路径未发现新增高价值问题。

## P2：切换中旧 Thread 的新提醒仍会被直接记为已读

定位：`src/app/renderer/shell/attention.tsx:68-73`（主位置）；`src/app/main/wiring/thread-attention.ts:304-309`。

触发：A 前台显示并已声明 visible(A)；用户切换 B。`AppModel.changeThread` 发布 `threadTransition=pending` 后等待保存/选择；当前 selector 仅排除 unknown，因此仍返回 A。effect 依赖 current/currentEntry/pathname，进入 pending 时这几个值未改变，不发送 visible(null)。`desktop-history` 在准入完成后才提交目标路径，而 `DesktopCommandService.execute(select-thread)` 先 select(B)，restore 再等待异步 resolveDirectory。因此存在已确认 Main active=B、路由及 attention.visibleThread 仍为 A 的实际 I/O 窗口。

此时 A 到来新的待答/失败（或完成）事件，ThreadAttention.add 只检查 foreground 与旧 visibleThread，直接写 unread=false。事件发布后 Renderer 尝试 visible(A)/seen(A) 会被可信 IPC 的 activeThread 检查拒绝，但无法恢复已经丢失的 unread；抵达 B 后 A 仅留侧栏状态，应用内提醒列表按 unread 过滤，用户无法通过该列表发现并返回处理这条新待答/失败。冻结旧工作区也处于 inert，不能用暂时仍挂载代替已确认显示/处理。

要求：固定 `docs/architecture/navigation.md:33` 明确“已读仅在窗口实际聚焦、路由与已确认 Thread 对齐后提交 seen”；01a/01b 和 spec 要求后台待答/失败保留应用内提醒。既有“Main 先切 B，路由后提交”的回归只覆盖 B 不提前被 seen，没有覆盖旧 A 期间的新事件。

证据：固定源码的 `ThreadAttention` 临时只读副本通过 Node 类型转换运行，执行 foreground=true、visible(A)、初始 Runtime(A)，再在上述选择空窗输入 A 新 pending Runtime，输出 `[{"kind":"needs-answer","unread":false}]`。未安装/构建或启动 App。跨层可达性来自实际选择先写后异步恢复和 Router 准入调用链；未声称原生 GUI 亲测。

最小修复方向：进入 pending 时撤销旧可见声明，不把 pending 当可见 current；Main 在选择实际变化时及时撤销旧 visibility，或在归纳/自动已读前核对实际 active Thread，避免依赖异步 Renderer 清理的窗口。回归应延迟 B 的恢复 I/O，并在 Main 已切 B、路由仍 A 时发 A 新 needs-answer/failed，确认 unread=true、到 B 后仍可点击处理；保留已有 B 不提前清未读回归。

## 已覆盖与限制

依据：固定 AGENTS、spec、01a/b/c、06e/f/g、diagnostics-review、attention-review、诊断/导航合同。重点覆盖 Main Runtime/receipt 提醒观察、存储偏好与窗口生命周期、可信 attention/diagnostics IPC、通知失败原 trace/Thread 到诊断白名单的组合、Renderer 镜像/路由准入/当前结果定位/未读、诊断筛选读取与本地反馈导出；查阅相关行为测试与既有修复证据。未机械重复已关闭的预算、失败收据裁切、Q2 去重或迟到首次 inspect 问题。

系统通知实际 failed、显示/点击未验，01c claimed；整体 V1-00/B6、真实供应商、M2 父范围与用户认可开放。这些明示待验不作为新增缺陷。诊断白名单已覆盖所有新增 attention 操作及 notification-unavailable，Main 通知失败保留原事件 trace/Thread，未发现该组合的新高价值问题。

本报告是源码与最小纯类复现的 Spec 结论；未运行工程矩阵、安装、构建、启动 App 或原生交互，未修改源码/票/提交，不能代替包内/原生验收或用户认可。
