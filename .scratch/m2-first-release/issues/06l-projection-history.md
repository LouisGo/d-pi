# 06l 正文投影与运行中历史

Status: claimed
Blocked by: none

M2；当前授权、取代关系和验收见[spec](../spec.md#2026-10-08-长会话连续体验修复当前授权)。

真实完整快照避免首块重复；区分中断/失败及续写原因，正常事件不误报；历史读已提交前缀，生成不中断读取。

拥有者：正文/历史由conversation，恢复执行由execution/OMP，App只组合；视图卸载不停止执行。

## Comments

2026-10-08：起点ae94bc0，目标缺口先失败测试，原生身份/事务/unknown不重发保持。

2026-10-08领取：主Agent（集成checkout）；写集分别为Renderer正文/样式、conversation投影+历史、execution/Host恢复，状态由主Agent维护。
