# S3 独立评审修复与 S4 进入检查

2026-09-28，基线 `a954633`。用户授权修复三项评审问题，验证后确认 S4 进入条件，再本地提交；不推送。本轮不实施 S4。变更与 TDD 过程见 [06](issues/06-review-fixes.md)。

## 修复结果

1. 待答交互期间，发送/干预按钮及 Enter 与 Main 使用相同准入规则。若准入后才出现交互，明确记录 rejected（从未写入 OMP），保留原文与草稿；处理阻塞后用户可显式新发送，不会留下永久 unknown 或卡住 prepared 的草稿版本。
2. 被较新停止覆盖的 continue 等控制失败只结束当前操作，不将健康会话降级成失联；当前代次仍可明确继续，真实断链仍受保护。
3. 明确失败不再永久占用在途集合。只有原生执行、队列、后台、异步、admitted 与待答均已收束时才释放；未知及未回执记录不会因 idle 被清掉。回执晚于最后一次状态也能收束。

原生普通 error 可能发生在业务接受后，故仍保留 outcome=failed 与调用 ACK 的分别记录，不改写为未派发。新增 rejected 只用于 Main/Host 已知未写出；沿用 SQLite JSON 收据，无物理表结构迁移。拒绝不消费草稿，旧 ID 不重发。

## 验证记录

- `pnpm check`：类型、Biome、设计 lint/边界通过；101 测试通过、1 项旧 CLI 可选 smoke 跳过。原有 92 项全部保留，增加 9 项针对性检查；[输出](evidence/review-fixes-check.txt)。
- `pnpm build`：通过，保留现有 Zod PURE 注释与大 chunk 提示。
- `node validation/s3/sdk-control.mjs`：固定官方 SDK 的停止保留队列、幂等停止、较新停止覆盖继续、明确继续同会话消费及最终空闲通过。
- `D_PI_VALIDATION_EVIDENCE_DIR=/tmp/d-pi-s3-review-gui pnpm exec electron validation/s3/app-control.cjs`：最终源码构建通过真实 Main/preload/Renderer/utility Host/SDK 链路；排队→停止→刷新→继续、四类交互、待答时按钮与 Enter 禁用、SQLite 无多余提交、草稿保留和回答后发送恢复、正常退出 exit 0；[输出](evidence/review-fixes-gui.txt)。复用现有主题/密度操作，无新样式改动。
- `git diff --check`：通过；本轮未改 runtime/官方 SDK、依赖和打包配置。

真实 GUI 自动化使用隔离配置、本地模型 fixture 和临时 App 数据，不使用个人模型服务。控制失败与故障时序由可控 Host/真实 SQLite 回归验证，原生覆盖继续由固定 SDK 样本验证；不把它们表述为人工 GUI 连点验收。

## S4 工程进入判断

核对 [M1 切片表](../development-foundation/spec.md)、[文件与编辑器](../../docs/architecture/modules/files-editor.md)、[变化记录与 Git](../../docs/architecture/modules/changes-git.md)及基础契约 §8：S4 文件/Git 读取可独立推进；选区依赖已交付的 S1/S2，工具证据接 S2。S3 冷恢复单写证明缺失只限制恢复入口，不阻塞 S4 的只读文件、选区和来源明确的 Diff。

本轮验证已完成，三项评审缺陷已关闭，未发现阻止进入 S4 开发的前置问题。可以进入 S4；启动实施前按项目约定补齐 S4 spec，落实读取授权/symlink/句柄复核、只读 Git 禁用外部 diff/textconv、选区来源冻结与 Monaco worker 的验收。这些是 S4 自身工作，不作为本轮提前实现或验收的内容。S3 用户试用反馈仍待收集，不将工程通过写成用户认可，也不等于 S5/M2 已通过。

## 试用与产物边界

本轮验证当前源码构建，启动可使用 `pnpm dev`（已有 resources/sdk 可复用）。试用：触发原生交互时检查发送禁用且草稿保留；回答后发送恢复；排队→停止→明确继续仍可用；工作完成后正常退出。

此前 `dist/s3-candidate` 是 `a954633` 前构建的旧候选，未包含本轮修复；不覆盖其历史 SHA/迁移证据。本轮不重新打包，不宣称旧候选已修复。真实供应商/中文 IME/干净机器及用户认可仍未新增验证；官方 SDK 未修改，冷恢复只读、unknown 不自动重发继续有效。
