# 06m 原生会话冷恢复续作

Status: resolved
Blocked by: none

M2；当前授权、取代关系和验收见[spec](../spec.md#2026-10-08-长会话连续体验修复当前授权)。

获得原生全周期独占，复用同sessionfile/id冷启动；保留unknown不重发/草稿/冻结收据，失败不新建替代会话。

拥有者：正文/历史由conversation，恢复执行由execution/OMP，App只组合；视图卸载不停止执行。

## Comments

2026-10-08：起点ae94bc0，目标缺口先失败测试，原生身份/事务/unknown不重发保持。

2026-10-08领取：recovery_implement（独立worktree）；写集分别为Renderer正文/样式、conversation投影+历史、execution/Host恢复，状态由主Agent维护。

2026-10-08工程验收完成：正式连续正文/运行中历史/同原生身份冷续作已串行集成，真实模型及独立双轴评审通过。实际覆盖与限制见[修复交接](../long-session-repair.md)。用户认可仍pending。
