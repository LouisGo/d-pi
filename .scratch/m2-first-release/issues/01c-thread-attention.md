# 01c 提醒切片评审与macOS候选

Status: claimed
Blocked by: 01a, 01b

所属授权、范围与验收见[spec](../spec.md#2026-10-06-多-thread-提醒切片)，本票为工程验收，用户认可独立维护。

可信IPC/preload与跨窗口集成、双轴独立审查修复复核、必要完整检查、实际macOS后台/关闭重开/通知与点击证据、可用候选/ZIP同源/本地提交。系统送达不可确认时如实说明；不关闭M2父票或用户认可。

## 已完成与剩余

795行为/34架构/74工具门禁、两轴整体及增量独立评审/高价值修复复核、实际16项macOS包内检查和clean m2.18/ZIP同源完成；source9a8c2ee，build9a8c2eea-7f1a67df。[证据/候选/试用](../attention.md)、[本地PR body](../attention-pr.md)。

原生inspect到达后台checkpoint，Computer Use报告Mac锁定；已请求用户手动解锁、未确认，没有模拟通知回调/原生window事件或写observed，五分钟checkpoint超时。最终修复包自动检查通过，但系统通知实际显示/点击、真实关闭窗口及同Main重开仍未完成；保持claimed。解锁确认后继续同一候选--attention-inspect，准确记录系统不可用/失败与App回退。此票未完成不阻塞已获独立证据的App提醒试用，用户认可与M2父范围独立pending。
