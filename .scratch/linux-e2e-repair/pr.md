## Summary

Linux 原生测试发现 Settings 的 scope 菜单被模态遮挡、模型栏多余横向滚动、固定 SDK 超预算，以及读取失败和从未初始化窗口缺少恢复路径。本切片修正共享 Portal 层叠与 rail 尺寸，提供只读 Retry，按真实 ready 发布开启窗口草稿保护并合并提示；固定 Linux x64 18.4.6 分发只保留可回退的官方 baseline。

范围与授权见 [spec](spec.md)；交付见 [handoff](handoff.md)。交付分支 `codex/linux-e2e-repair`，base `c14297c3`，PR 目标为 `main`。

## Evidence

用户报告与源码基点相同，61 个证据文件 bytes/hash 一致。目标行为先失败后修复；隔离 Electron 组件验证菜单真实可见/命中/选择/focus 和短长 rail；相关行为/集成 54 项、SDK tooling 13 项、架构 tooling 30 项通过；类型检查、lint、边界门禁与生产构建通过。命令与限制见 [validation](validation.md)，独立 Spec/Standards 评审及修复闭环见 [review](review.md)。

原 Linux SDK import/原生 GUI 复试与用户认可待反馈。报告中的 build 137 原因未知，未作为 OOM 或持续产品白屏修复。

仓库 CI 为 macOS arm64 的完整 SDK/环境/check/build 链；远端运行结果按本次 PR head 核实，未完成前保留 Draft。本地验证不能替代该远端结果。

## Merge Danger

Two-way：源码和分发规则可 revert，未改变数据库、凭据、权限或 OMP 源码。共享 Portal 影响所有嵌套浮层；关闭 guard 影响 Main 的退出握手，已有可编辑窗口的保存失败/超时保护和执行退出协调仍保留。Linux 使用 baseline 可能失去 modern 的性能优化；升级固定版本需重新核对 loader 和资源规则。

回滚源码后需退出对应旧 App/原生实例，再重新准备 SDK/构建；旧 Linux 分发会重新遇到 650 MiB 预算失败。回滚不能替用户恢复外部供应商操作，本次没有这些操作。工程完成或将来合并不等于 Linux 功能验收。
