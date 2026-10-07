## Summary

Thread主区曾直接铺开目录/模型/子Agent/运行快照/阅读导航。本切片将默认界面整理为消息滚动区与底部Composer，保留按需Thread工具及必要运行操作。范围见[06](issues/06-thread-surface.md)。

## Evidence

源码6202f2e；[交接](thread-surface-handoff.md)记录真实红绿、46项受影响回归、11项隔离Electron、类型/设计/i18n/构建/环境及本地两轴复核。GUI使用模拟桥接，不代表真实provider或用户认可。独立开发资源可直接pnpm dev。

## Merge Danger

Two-way：仅Renderer布局/呈现和验证fixture，无持久化迁移、权限或资源所有权变化。影响Thread工具入口、运行操作展示及Composer几何；revert可恢复旧呈现，草稿/会话数据不被删除。本地分支交付，无远端PR/CI或合并声明。
