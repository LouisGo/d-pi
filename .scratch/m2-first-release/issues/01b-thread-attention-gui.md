# 01b 多Thread提醒正式GUI

Status: resolved
Blocked by: none

所属授权、范围与验收见[spec](../spec.md#2026-10-06-多-thread-提醒切片)，本票为工程验收，用户认可独立维护。

消费Main单源快照，侧栏待答/失败/完成与未读；不抢焦点的应用内提醒，点击用既有导航准入/保存流程进入真实Thread。通知偏好与能力/失败反馈；迟到scope/过期点击不答旧请求。真实React TDD、主题/密度/语言和焦点；视图卸载不终止工作。

2026-10-06：固定worker结果已串行集成；实际红绿与整体793行为/34架构/74工具门禁通过，评审修复在61f1e24。实际macOS候选与系统送达限制由01c单列，用户认可pending。

2026-10-06补充：实际672afdc截图发现失败收据裁切，TDD修复d272bd6，仅匹配failed收据进入既有阅读专注，保持Editor/草稿，可恢复controls；needs-answer/缺收据保持runtime可见。独立Spec/Standards增量复核通过，完整795行为通过，9a8c2ee clean候选强化几何与实际截图验收通过。原失败/修复证据见[交接](../attention.md)，系统显示/原生窗口另由01c保持claimed。

2026-10-06继续：原生验收多提醒实际截图及独立Spec审查确认阅读区挤压，真实旧包几何red为5提醒/160px、readingHeight=0。重新claimed，按共享control-height预算独立滚动修正，后续实际候选几何与交互验收通过再关闭。

2026-10-06最终：cap不足的真实red（9提醒64px、reading0）后，48cd01cc仅有提醒时预留4lh阅读下限，Composer保持；迟到Runtime inspect真实React红绿修复并避免后续状态夺焦。796行为/34架构/74工具通过，Spec/Standards独立复核无新增高价值问题。最终m2.19实际五组预算（9–10提醒/center64或60/reading78）全通过，最后提醒内部滚动与焦点可达、阅读/Composer完整可见、草稿及采样焦点恢复；18项实包检查通过。本票工程resolved，系统显示/点击仍由01c claimed，用户认可pending。见[当前交接](../attention.md)与[双轴评审](../attention-review.md)。
