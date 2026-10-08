# 06m 原生会话冷恢复续作

Status: claimed
Blocked by: none

M2；当前授权、取代关系和验收见[spec](../spec.md#2026-10-08-长会话连续体验修复当前授权)。

获得原生全周期独占，复用同sessionfile/id冷启动；保留unknown不重发/草稿/冻结收据，失败不新建替代会话。

拥有者：正文/历史由conversation，恢复执行由execution/OMP，App只组合；视图卸载不停止执行。

## Comments

2026-10-08：起点ae94bc0，目标缺口先失败测试，原生身份/事务/unknown不重发保持。

2026-10-08领取：recovery_implement（独立worktree）；写集分别为Renderer正文/样式、conversation投影+历史、execution/Host恢复，状态由主Agent维护。
