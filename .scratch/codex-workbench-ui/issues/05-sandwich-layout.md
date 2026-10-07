# 05 顶中底基础布局与状态栏

Status: resolved
Type: task
Blocked by: none

## 授权与归属

2026-10-07 用户确认三层布局并授权实施。单写 Agent：主 Agent；基点 d4f380c；分支 codex/sandwich-layout；隔离目录 /Users/louistation/.codex/worktrees/sandwich-layout/d-pi。

## 交付

移除 ActivityRail；Thread 列表底部固定横向设置（宽）与开发工具（窄），无会话 icon。保留顶层导航/标签；中部独立滚动；全局固定 28px 状态栏按实时列宽对齐。版本号位于左段，对话概况消费真实公开状态，详细信息可快速预览。同步当前合同、布局说明、组件目录与验证入口，不改原始历史证据。

## 验收

全宽预算、最小窗口自动暂藏/恢复、拖拽过程与右/底宿主的顶底对齐；设置与开发入口始终可恢复；主会话/输入资源保持；light/dark、中英、键盘及原生标题栏预算。消息数量仅代表当前有界实时投影，不伪称全历史轮数；未接入的 token/cache/context 不展示为 0。完整工程门禁、受影响隔离 Electron、Spec/Standards review；不等同用户认可。


## 工程结果

源码 `bded41f`。当前票的布局、真实状态、窗口/主题/键盘与资源行为已通过工程和隔离GUI验证，双轴review的2个P2已修复复核；[交接与证据](../sandwich-validation.md)、[独立审查](../sandwich-review.md)。本票resolved表示工程交付，原A3物理拖窗/系统IME/VoiceOver/长时性能与用户认可不提升。


2026-10-07后续视觉反馈：底栏连续柔和底色、与顶栏略有区分，透明留白取代结构分割线，覆盖初版分段底色策略；详见[本轮交接](../chrome-feedback.md)。只做一次针对性静态/4项原生CSS检查，前轮完整工程证据保留为对应源码历史。
