## Summary

后台Thread等待回答或执行失败时，用户需要可点击且不抢焦点的提醒。本切片复用真实RuntimeView/SubmissionReceipt，在Main维护有界投影，正式GUI提供侧栏状态、应用内提醒、失败收据/当前交互定位及独立持久化通知偏好。完成默认只更新完成/未读，系统/完成通知须明确开启；reload、暂时无窗口仍观察，未知提交不重发。

所属[spec](spec.md#2026-10-06-多-thread-提醒切片)，[01a](issues/01a-thread-attention.md)、[01b](issues/01b-thread-attention-gui.md)、[01c](issues/01c-thread-attention.md)。本地分支codex/m2-thread-attention，base/merge-base为7c9e1fee48ccb467db359a18401d8a30ca57a04e；无远端PR，01c待原生验收，不声称整体切片已完成。

## Evidence

真实TDD覆盖Main因果归纳、可信IPC/导航后复核、preload关联、SQLite偏好、正式React导航/订阅/焦点/编辑器保留；具体红绿和保留失败见[证据](evidence/attention-tdd.md)。独立Spec/Standards整体审查发现4项高价值问题，均修复并独立复核；诊断故障码脱敏增量亦独立复核。

多提醒预算与迟到Runtime首样本定位也已TDD修复：独立滚动、当前阅读至少4行且Composer保留；等待实际interaction就位，后续状态不夺焦。五组实际9–10提醒预算通过，796行为/34架构/74工具和增量两轴review通过。产品source48cd01cc，外部harness adcd4d3。

实际候选截图另发现失败收据被阅读容器裁切，已按新的真实React红灯修复：仅匹配failed收据时开启既有专注阅读；需要回答或收据缺失时保持runtime/setup可见。原脚本window rectangle断言改为状态段落在所有overflow祖先可见交集内可读，修复前结果完整保留。

最终完整检查、精确clean产品source/build、实际macOS包内结果、截图、ZIP CRC/app.asar同源见[交接](attention.md)与[两轴报告](attention-review.md)。固定SDK+localhost供应商是实际SDK接入，未使用个人认证或付费供应商；Chromium组合事件不替代系统IME。最终m2.19实际18项检查通过，真实关窗/Finder重开同Main无重发与冷启动偏好持久化完成。系统通知实际failed，显示/点击未验收、根因unknown，App回退保留，01c保持claimed；用户认可pending，M2父范围未关闭。

## Merge Danger

源码可revert，但SQLite schema11为持久化one-way door：升级前备份before-v11；旧候选拒绝打开新schema，单纯revert不会降级数据。需要退回旧版时先保留现有数据库/附件和新增工作，再在独立数据根验证升级前备份；不要覆盖新数据或删除数据库掩盖恢复失败。通知两个偏好字段与既有主题/密度/语言分开保存。

影响链为Main真实观察→有界提醒投影→trusted IPC/preload→GUI定位、通用Electron Notification及应用窗口显式点击入口。观察/通知失败不改变执行、答案、历史或已持久化收据。不开新OMP调度器，不添加自动重试或上传；通知文案不含路径、业务正文或秘密。候选未签名/公证，系统available仅表达能力；原生送达限制单列，不能以模拟回调宣称通过。不push、不公开发布、不扩M3，合并或工程检查不替代用户认可。
