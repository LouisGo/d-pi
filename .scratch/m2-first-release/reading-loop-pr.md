## Summary

长会话离尾阅读时，同一流式实体追加现在显示新输出提示并保留内容锚点。用户可立即回当前 live 已保留列表尾部，或单独直达正文最新段；两种位置互不暗中改变。gap/截断可从现有 Thread tools 进入只读原生历史，再返回原 live 来源、段页与位置，历史刷新明确重读起始页。

真实 Markdown 完成保留稳定 Block 前缀、代码横滚与选区，同时正确处理最终围栏、迟到引用/脚注及中断原文。外层用户输入接管统一取消旧定位；新来源首帧、attention、隐藏/dispose、旧历史 attempt 有相关交错回归。所属 [spec](spec.md#2026-10-07-首个长会话阅读闭环本轮授权)，06h/06i/06j；布局、预算、执行/历史所有权和锁定依赖沿用。

## Evidence

[完整交接和 R1–R15 矩阵](reading-loop.md)、[独立双轴复审](reading-loop-review.md)。最新 main 组合 source `7e16f99` 的 pnpm check：1062行为/35架构/96工具通过，2既有测试跳过。干净 `d987f98` 的真实 Electron/生产组件隔离 fixture 24项及原生复制结果见 result.json；真实 pnpm dev + 已配置 Luna 两 Thread 三次请求、真实 Main/native 历史与最终 Markdown 另有实际元数据/截图，其 source c04e245，未冒称固定包。

必要红绿与边界逐项记录，既有正确行为补测不伪造红灯。基线 UI fixtures、共享尺寸 token 及源码检查失败作最小校准，未关闭门禁；Dev排他SDK锁与原生PDF测试竞争通过退出本轮Dev解决。VoiceOver、物理滚轮/provider重叠、系统IME、非macOS、完整10k长稳与固定包未实测，不声明用户认可或M2整体完成。

## Merge Danger

Door：two-way；无依赖、持久数据、协议或权限迁移。Blast radius：Renderer阅读/工具历史/最终Markdown及共享控件同值token整理；保留最新main窗口/菜单修复。Main/Host/Bun、原生历史写入、投影上限与冷恢复合同不变。

Rollback：可正常 revert 本次本地 PR merge；已有真实 QA 原生消息不会被回退清除，阅读选择仅当前Thread内存。Merge/push 只表示源码交付，试用证据、用户认可和公开发布分别表达。
