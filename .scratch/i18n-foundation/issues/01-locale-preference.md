# 01 共享 locale 与 Desktop 偏好

Status: resolved

阶段：S4 前基础。受影响决定：D-02/D-03/D-21/D-22/D-34/D-35/D-36。目标：共享 typed catalog/ICU facade；保存 preference 并从 Main 解析系统 locale，Main/Renderer 一致切换，菜单与原生弹窗本地化。依赖：无。拥有者：Desktop 偏好由 Main/SQLite 持久，Main 拥有解析值与原生 UI；Renderer 只订阅展示。验收：迁移、非法值、IPC、菜单重建、写入失败和无重启切换的失败先行测试及构建。工程完成后更新结果；用户试用状态在 spec 维护。

## Comments

- 2026-09-29：实施前发现偏好无 locale、Main 菜单先于存储读取、preload 回执漏比 sendKey，纳入本票。
- 2026-09-29：v5 偏好迁移与独立写、Main 系统语言解析/菜单/弹窗、严格 IPC、shared ICU facade 完成。失败测试先暴露缺口；存储/Main/preload 与共享检查通过，整体验证见[交接](../handoff.md)。
