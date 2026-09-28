# 08 原生命令与 App 会话身份边界

Status: resolved

2026-09-28。授权同 [07](07-cross-layer-integrity.md)，M1/S3 收尾，不提前实现 S4/工作区迁移或完整命令管理。沿用 D-02/D-03/D-24/D-25。

固定官方 OMP 18.3.0 的 prompt 会执行 headless builtin。Main 准备/派发及 Host 原生写出前，阻止 move、wt/worktree、session delete；普通发送、steer 和显式 resend 使用相同边界。拒绝在原生写入前明确展示，保留草稿和旧绑定；不靠命令执行后追补 SQLite 绑定。

新增必修发现：顶层 delete 只有 TUI handler，但 session delete 有 headless handler，直接 dropSession。不能只按顶层名称排查能力。策略遵守原生大小写、空白/冒号及子命令规则；不把输入的统一 trim/lowercase 当原生语义。

验证：先失败跨 Main/Host 测试，再阻断；固定官方 parser/registry 核对别名及反例；隔离正式 GUI/SDK 拒绝后原文、原生历史及 SQLite 绑定不变，正常文字继续同一会话。不是工具沙箱，不封禁所有斜杠命令，不修改官方 SDK。

## 完成

生产修复及针对性验证完成；114 项测试、构建、固定 SDK 命令语义和隔离 GUI/SDK 检查通过。详细分层证据与限制见 [收尾复盘](../integrity-review.md)。工程完成不替代用户试用认可。
