# 06k 连贯正文阅读

Status: resolved
Blocked by: none

M2；当前授权、取代关系和验收见[spec](../spec.md#2026-10-08-长会话连续体验修复当前授权)。

移除正文分段与表示阈值切换，保持Markdown/代码结构、完整复制、单一连贯滚动与流式旧内容稳定。

拥有者：正文/历史由conversation，恢复执行由execution/OMP，App只组合；视图卸载不停止执行。

## Comments

2026-10-08：起点ae94bc0，目标缺口先失败测试，原生身份/事务/unknown不重发保持。

2026-10-08领取：continuous_reading（独立worktree）；写集分别为Renderer正文/样式、conversation投影+历史、execution/Host恢复，状态由主Agent维护。

2026-10-08工程验收完成：正式连续正文/运行中历史/同原生身份冷续作已串行集成，真实模型及独立双轴评审通过。实际覆盖与限制见[修复交接](../long-session-repair.md)。用户认可仍pending。
