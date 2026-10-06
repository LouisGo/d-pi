# 01b 多Thread提醒正式GUI

Status: resolved
Blocked by: none

所属授权、范围与验收见[spec](../spec.md#2026-10-06-多-thread-提醒切片)，本票为工程验收，用户认可独立维护。

消费Main单源快照，侧栏待答/失败/完成与未读；不抢焦点的应用内提醒，点击用既有导航准入/保存流程进入真实Thread。通知偏好与能力/失败反馈；迟到scope/过期点击不答旧请求。真实React TDD、主题/密度/语言和焦点；视图卸载不终止工作。

2026-10-06：固定worker结果已串行集成；实际红绿与整体793行为/34架构/74工具门禁通过，评审修复在61f1e24。实际macOS候选与系统送达限制由01c单列，用户认可pending。

2026-10-06补充：实际672afdc截图发现失败收据裁切，TDD修复d272bd6，仅匹配failed收据进入既有阅读专注，保持Editor/草稿，可恢复controls；needs-answer/缺收据保持runtime可见。独立Spec/Standards增量复核通过，完整795行为通过，9a8c2ee clean候选强化几何与实际截图验收通过。原失败/修复证据见[交接](../attention.md)，系统显示/原生窗口另由01c保持claimed。
