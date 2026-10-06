# 01a Main多Thread提醒与偏好

Status: claimed
Blocked by: none

所属授权、范围与验收见[spec](../spec.md#2026-10-06-多-thread-提醒切片)，本票为工程验收，用户认可独立维护。

复用RuntimeView与SubmissionReceipt，只在真实待答/失败/完成变化生成有界提醒，接受与结果分开。Main观察独立于窗口/Renderer，去重/错代/过期点击及当前状态可核对；系统提醒显式开启、失败保留App提示，通用内容不泄漏业务。App SQLite偏好TDD、迁移保持恢复顺序；原生适配受限、诊断保留trace。
