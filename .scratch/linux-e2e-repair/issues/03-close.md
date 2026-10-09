# 从未初始化窗口与关闭提示合并

Status: resolved
Blocked by: none
Owner: 主 Agent；codex/linux-e2e-repair；base c14297c3

Main 在发布任何 ready 快照前开启窗口草稿保护，此前不可编辑窗口可直接关闭。已开启保护跨导航保留；保存不确认继续拒绝关闭，恢复提示与握手去重，旧 token/窗口无权关闭新窗口。执行中的退出继续由 QuitCoordinator 保护。验证初始化边界、成功/失败/超时/迟到/重复请求、释放与实际 IPC 接线。

## 结果

2026-10-09：guard 和生产 IPC 接线已实现；初始关闭、可编辑后握手、保存成功/失败、超时/迟到、提示合并、旧窗口释放及退出协调通过。独立 Standards 发现的既有 mock 回归已修复并补充审查关闭；真实 Main/SQLite 集成两文件 32 项通过。Linux 原生弹窗体验待复试，见 [validation](../validation.md)、[review](../review.md)。
