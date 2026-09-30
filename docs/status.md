# 项目总看板

此页由所属规格的 `project-status` 块和任务的 `Status` / `Blocked by` 生成，禁止手工改进度。更新源后运行 `pnpm report:status:write`；`check` / `check:fast` 拒绝非法字段、依赖与陈旧结果。读取约定见 [任务约定](agents/issue-tracker.md#总看板读取约定)。

当前工作：[S5 前基建收口](../.scratch/infrastructure-closure/spec.md)。本轮已完成并停止；S5/M2 未启动，后续依所属范围与明确授权推进

工程完成、交付试用与用户认可独立；下面的计划不构成阶段授权。G1 按受影响能力验证，M1 是内部闭环，M2 是首版，M3 是后续增强。

| 阶段 | 切片 / 规格 | 工程 | 试用 | 用户认可 | 构建 / 证据 | 下一步 |
| --- | --- | --- | --- | --- | --- | --- |
| G1 | [G1 按能力验证](../.scratch/development-foundation/spec.md) | 部分完成 | 不适用 | 不适用 | — [证据1](validation/runtime-feasibility.md) | 相关功能及 SDK 升级时复核所需证据 |
| M1 | [S1 项目与草稿](../.scratch/m1-s1-project-draft/spec.md) | 工程完成 | 已反馈待处理/复试 | 待认可 | — [证据1](../.scratch/m1-s1-project-draft/handoff.md) · [证据2](../.scratch/m1-s1-project-draft/hardening.md) | 原文粘贴已修，等待用户复试 |
| M1 | [S2 提交与阅读](../.scratch/m1-s2-submit-read/spec.md) | 工程完成 | 已交付待试用 | 待认可 | 0.1.0-s2.0 [证据1](../.scratch/m1-s2-submit-read/handoff.md) | 等待真实供应商与输入体验反馈 |
| M1 | [S3 控制、交互与恢复](../.scratch/m1-s3-control-recovery/spec.md) | 工程完成 | 已交付待试用 | 待认可 | 0.1.0-s3.0 [证据1](../.scratch/m1-s3-control-recovery/handoff.md) · [证据2](../.scratch/m1-s3-control-recovery/integrity-review.md) | 等待试用，退出放弃另行对齐 |
| M1 | [S4 文件、选区与差异](../.scratch/m1-s4-files-diff/spec.md) | 工程完成 | 已交付待试用 | 待认可 | 0.1.0-s4.0 [证据1](../.scratch/m1-s4-files-diff/handoff.md) | 等待用户试用；不自动进入 S5 |
| M1 | [S5 组合验收](../.scratch/development-foundation/spec.md) | 未实施 | 未交付 | 待认可 | —  | 基建收口后，另按用户授权细化范围与验收 |
| M2 | [M2 首版](../.scratch/development-foundation/spec.md) | 未实施 | 未交付 | 待认可 | — [证据1](product/first-release.md) | 未启动，按首版范围逐功能授权 |
| M3 | [M3 后续增强](../.scratch/development-foundation/spec.md) | 未实施 | 未交付 | 待认可 | —  | 未启动，保留边界 |
| 基建 | [领域目录治理](../.scratch/domain-directory-governance/spec.md) | 工程完成 | 不适用 | 不适用 | — [证据1](../.scratch/domain-directory-governance/handoff.md) | 沿用模块机器清单，目录规模不作为硬门槛 |
| 基建 | [国际化基础](../.scratch/i18n-foundation/spec.md) | 工程完成 | 已交付待试用 | 待认可 | 0.1.0-i18n.0 [证据1](../.scratch/i18n-foundation/handoff.md) | 等待热切换与输入体验反馈 |
| 基建 | [S5 前基建收口](../.scratch/infrastructure-closure/spec.md) | 工程完成 | 未交付 | 不适用 | 3285474e-dirty-1f488792（工程安全候选） [证据1](../.scratch/infrastructure-closure/handoff.md) | 本轮已完成并停止；S5/M2 未启动，后续依所属范围与明确授权推进 |
| 基建 | [核心重写及外观补修](../.scratch/rewrite-preparation/spec.md) | 工程完成 | 已交付待试用 | 待认可 | 441b27b4-1525b713 / 2b1990fa-6a10f88e [证据1](../.scratch/rewrite-preparation/handoff.md) · [证据2](../.scratch/rewrite-preparation/issues/09-appearance-performance.md) | 构建继续待试用；当前实施转到基建收口 |
| 基建 | [状态与查询对齐](../.scratch/state-query-alignment/spec.md) | 工程完成 | 已交付待试用 | 待认可 | 441b27b4-1525b713（随重写包） [证据1](../.scratch/rewrite-preparation/handoff.md) · [证据2](../.scratch/state-query-alignment/issues/04-integration-verification.md) | 04 含试用验收，继续 claimed 等待反馈 |

## 当前任务与真实阻塞

这里只汇总未解决票。无工程依赖不代表已授权实施；历史候选及试用验收继续由所属规格限定。

| 所属范围 / 任务 | 状态 | 未解决的工程依赖 |
| --- | --- | --- |
| [m1-interaction-hardening / 03 派发授权排序与 Host 目录复核](../.scratch/m1-interaction-hardening/issues/03-dispatch-authorization.md) | open | 无；范围以所属规格为准 |
| [m1-interaction-hardening / 04 历史 busy 语义复核](../.scratch/m1-interaction-hardening/issues/04-history-busy.md) | open | 无；范围以所属规格为准 |
| [m1-interaction-hardening / 07 退出健壮性与 GUI 可访问补齐](../.scratch/m1-interaction-hardening/issues/07-quit-a11y.md) | open | 无；范围以所属规格为准 |
| [m1-s3-control-recovery / 09 暂缓队列后的退出出口](../.scratch/m1-s3-control-recovery/issues/09-quit-discard-decision.md) | open | 无；范围以所属规格为准 |
| [state-query-alignment / 04 集成验证与试用交接](../.scratch/state-query-alignment/issues/04-integration-verification.md) | claimed | 无；范围以所属规格为准 |

## 重要待决与继续边界

- [09 暂缓队列后的退出出口](../.scratch/m1-s3-control-recovery/issues/09-quit-discard-decision.md)（open），影响及替代路径见所属票；记录存在不表示问题解决。
- [G1 按能力验证](../.scratch/development-foundation/spec.md)：执行全周期单写尚未证实，冷恢复只读；不是全部能力一次性验收。
- [S3 控制、交互与恢复](../.scratch/m1-s3-control-recovery/spec.md)：冷恢复仅只读，unknown 不自动重发；退出非空队列尚无放弃出口。
- [S5 前基建收口](../.scratch/infrastructure-closure/spec.md)：只本地 commit、不 push 或公开发布；许可证由权利人决定，签名/公证/更新尚未实施。
- [核心重写及外观补修](../.scratch/rewrite-preparation/spec.md)：同题复测未证明接手效率提升；真实供应商、系统 IME 与用户体验未认可。
- [状态与查询对齐](../.scratch/state-query-alignment/spec.md)：刷新失败保留旧采样的体验尚待试用；不因工程通过改变产品策略。

<!-- source-sha256: 3129d45494cbecbdf0d2ac42a86cfa49eb07099714a4b02280d921ce412770d9; sources: 68 -->
