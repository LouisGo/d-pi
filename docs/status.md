# 项目总看板

此页由所属规格的 `project-status` 块和任务的 `Status` / `Blocked by` 生成，禁止手工改进度。更新源后运行 `pnpm report:status:write`；`check` / `check:fast` 拒绝非法字段、依赖与陈旧结果。读取约定见 [任务约定](agents/issue-tracker.md#总看板读取约定)。

当前工作：[M2 首版](../.scratch/m2-first-release/spec.md)。06c/06d长正文有界阅读工程完成，m2.16候选交付待试用；PDF视觉/OCR与余下M2队列/子Agent/固定负载/故障组合验收开放，真实供应商试用与用户认可pending，冷旧Thread只读

工程完成、交付试用与用户认可独立；下面的计划不构成阶段授权。G1 按受影响能力验证，M1 是内部闭环，M2 是首版，M3 是后续增强。

| 阶段 | 切片 / 规格 | 工程 | 试用 | 用户认可 | 构建 / 证据 | 下一步 |
| --- | --- | --- | --- | --- | --- | --- |
| G1 | [G1 按能力验证](../.scratch/development-foundation/spec.md) | 部分完成 | 不适用 | 不适用 | — [证据1](validation/runtime-feasibility.md) | 相关功能及 SDK 升级时复核所需证据 |
| M1 | [S1 项目与草稿](../.scratch/m1-s1-project-draft/spec.md) | 工程完成 | 已反馈待处理/复试 | 待认可 | — [证据1](../.scratch/m1-s1-project-draft/handoff.md) · [证据2](../.scratch/m1-s1-project-draft/hardening.md) | 原文粘贴已修，等待用户复试 |
| M1 | [S2 提交与阅读](../.scratch/m1-s2-submit-read/spec.md) | 工程完成 | 已交付待试用 | 待认可 | 0.1.0-s2.0 [证据1](../.scratch/m1-s2-submit-read/handoff.md) | 等待真实供应商与输入体验反馈 |
| M1 | [S3 控制、交互与恢复](../.scratch/m1-s3-control-recovery/spec.md) | 工程完成 | 已交付待试用 | 待认可 | 0.1.0-s3.0 [证据1](../.scratch/m1-s3-control-recovery/handoff.md) · [证据2](../.scratch/m1-s3-control-recovery/integrity-review.md) | 等待试用，退出放弃另行对齐 |
| M1 | [S4 文件、选区与差异](../.scratch/m1-s4-files-diff/spec.md) | 工程完成 | 已交付待试用 | 待认可 | 0.1.0-s4.0 [证据1](../.scratch/m1-s4-files-diff/handoff.md) | 等待用户试用；不自动进入 S5 |
| M1 | [S5 组合验收](../.scratch/m1-s5-combination-acceptance/spec.md) | 工程完成 | 已反馈待处理/复试 | 待认可 | 0.1.0-s5.0 / 4b003e84-4c6aa4ad [证据1](../.scratch/m1-s5-combination-acceptance/handoff.md) · [证据2](../.scratch/m1-s5-combination-acceptance/evidence/acceptance.md) · [证据3](../.scratch/m1-s5-combination-acceptance/evidence/final-s5-result.json) · [证据4](../.scratch/m1-s5-combination-acceptance/evidence/frozen-review.md) | M1 工程完成、用户未认可；入口反馈由已授权 M2 接续处理 |
| M2 | [M2 首版](../.scratch/m2-first-release/spec.md) | 实施中 | 已交付待试用 | 待认可 | 0.1.0-m2.16 / c5315584-f375cd21 [证据1](product/first-release.md) · [证据2](../.scratch/m2-first-release/handoff-entry.md) · [证据3](../.scratch/runtime-hardening-omp1845/handoff.md) · [证据4](../.scratch/m2-first-release/configuration-sharing.md) · [证据5](../.scratch/m2-first-release/mainflow-feedback.md) · [证据6](../.scratch/m2-first-release/progress-audit.md) · [证据7](../.scratch/m2-first-release/navigation-continuity.md) · [证据8](../.scratch/m2-first-release/development-tools.md) · [证据9](../.scratch/m2-first-release/rendering-isolation.md) · [证据10](../.scratch/m2-first-release/e2e-convergence.md) · [证据11](../.scratch/m2-first-release/warm-session-liveness.md) · [证据12](../.scratch/review-seven-commits/spec.md) · [证据13](../.scratch/m2-first-release/next-stage.md) · [证据14](../.scratch/m2-first-release/queue-configuration-review.md) · [证据15](../.scratch/m2-first-release/content-preparation.md) · [证据16](../.scratch/m2-first-release/lifecycle.md) · [证据17](../.scratch/m2-first-release/lifecycle-review.md) · [证据18](../.scratch/m2-first-release/project-references.md) · [证据19](../.scratch/m2-first-release/project-references-review.md) · [证据20](../.scratch/m2-first-release/long-reading.md) · [证据21](../.scratch/m2-first-release/long-reading-review.md) | 06c/06d长正文有界阅读工程完成，m2.16候选交付待试用；PDF视觉/OCR与余下M2队列/子Agent/固定负载/故障组合验收开放，真实供应商试用与用户认可pending，冷旧Thread只读 |
| M3 | [M3 后续增强](../.scratch/development-foundation/spec.md) | 未实施 | 未交付 | 待认可 | —  | 未启动，保留边界 |
| 基建 | [AI 工作流升级](../.scratch/ai-workflow-v13/spec.md) | 工程完成 | 不适用 | 不适用 | — [证据1](../.scratch/ai-workflow-v13/handoff.md) · [证据2](../.scratch/ai-workflow-v13/validation.md) · [证据3](../.scratch/ai-workflow-v13/review.md) · [证据4](../.scratch/ai-workflow-v13/research.md) | 后续已授权切片沿用新入口，按实际任务规模选择并行、review、PR 与 retro |
| 基建 | [领域目录治理](../.scratch/domain-directory-governance/spec.md) | 工程完成 | 不适用 | 不适用 | — [证据1](../.scratch/domain-directory-governance/handoff.md) | 沿用模块机器清单，目录规模不作为硬门槛 |
| 基建 | [Effect 原生连接生命周期](../.scratch/effect-native-lifecycle/spec.md) | 工程完成 | 不适用 | 不适用 | — [证据1](../.scratch/effect-native-lifecycle/issues/01-native-lifecycle.md) · [证据2](../.scratch/effect-native-lifecycle/validation.md) · [证据3](../.scratch/effect-native-lifecycle/evidence/process-supervision.json) | NativeSession 接入完成；SessionHost 与 Main transport 后续按实际替代收益接入 |
| 基建 | [国际化基础](../.scratch/i18n-foundation/spec.md) | 工程完成 | 已交付待试用 | 待认可 | 0.1.0-i18n.0 [证据1](../.scratch/i18n-foundation/handoff.md) | 等待热切换与输入体验反馈 |
| 基建 | [S5 前基建收口](../.scratch/infrastructure-closure/spec.md) | 工程完成 | 未交付 | 不适用 | 3285474e-dirty-1f488792（工程安全候选） [证据1](../.scratch/infrastructure-closure/handoff.md) | 本轮已完成；S5 按新授权进入所属规格，M2 未启动 |
| 基建 | [OMP 18.4.6 升级与运行时边界加固](../.scratch/runtime-hardening-omp1845/spec.md) | 工程完成 | 已交付待试用 | 待认可 | 0.1.0-m2.7 / 24f086e7-fa83a4f5 [证据1](../.scratch/runtime-hardening-omp1845/handoff.md) · [证据2](../.scratch/runtime-hardening-omp1845/evidence.md) | 完整切片已本地交付；等待用户试用，M2其它能力与S3退出待决继续留原票 |
| 基建 | [全项目组织整理](../.scratch/project-organization/spec.md) | 工程完成 | 不适用 | 不适用 | — [证据1](../.scratch/project-organization/spec.md) | 组织整理与工程验证完成；继续按职责落点维护，新功能由所属切片授权 |
| 基建 | [核心重写及外观补修](../.scratch/rewrite-preparation/spec.md) | 工程完成 | 已交付待试用 | 待认可 | 441b27b4-1525b713 / 2b1990fa-6a10f88e [证据1](../.scratch/rewrite-preparation/handoff.md) · [证据2](../.scratch/rewrite-preparation/issues/09-appearance-performance.md) | 构建继续待试用；当前实施转到基建收口 |
| 基建 | [类型安全桌面路由](../.scratch/router-integration/spec.md) | 工程完成 | 已交付待试用 | 待认可 | 0.1.0-m2.9 / acf535c4-88948e3f [证据1](../.scratch/router-integration/issues/01-routing.md) · [证据2](../.scratch/router-integration/review.md) · [证据3](../.scratch/router-integration/handoff.md) · [证据4](../.scratch/router-integration/evidence/native-result.json) | 试用本地 macOS 候选：页签、会话切换和前进后退；用户认可待反馈 |
| 基建 | [状态与查询对齐](../.scratch/state-query-alignment/spec.md) | 工程完成 | 已交付待试用 | 待认可 | 441b27b4-1525b713（随重写包） [证据1](../.scratch/rewrite-preparation/handoff.md) · [证据2](../.scratch/state-query-alignment/issues/04-integration-verification.md) | 04 含试用验收，继续 claimed 等待反馈 |

## 当前任务与真实阻塞

这里只汇总未解决票。无工程依赖不代表已授权实施；历史候选及试用验收继续由所属规格限定。

| 所属范围 / 任务 | 状态 | 未解决的工程依赖 |
| --- | --- | --- |
| [m1-interaction-hardening / 03 派发授权排序与 Host 目录复核](../.scratch/m1-interaction-hardening/issues/03-dispatch-authorization.md) | open | 无；范围以所属规格为准 |
| [m1-interaction-hardening / 04 历史 busy 语义复核](../.scratch/m1-interaction-hardening/issues/04-history-busy.md) | open | 无；范围以所属规格为准 |
| [m1-interaction-hardening / 07 退出健壮性与 GUI 可访问补齐](../.scratch/m1-interaction-hardening/issues/07-quit-a11y.md) | open | 无；范围以所属规格为准 |
| [m1-s3-control-recovery / 09 暂缓队列后的退出出口](../.scratch/m1-s3-control-recovery/issues/09-quit-discard-decision.md) | open | 无；范围以所属规格为准 |
| [m2-first-release / 01 项目与 Thread](../.scratch/m2-first-release/issues/01-project-threads.md) | claimed | 无；范围以所属规格为准 |
| [m2-first-release / 02 配置、认证与模型](../.scratch/m2-first-release/issues/02-configuration-models.md) | claimed | 无；范围以所属规格为准 |
| [m2-first-release / 03 主流程与候选](../.scratch/m2-first-release/issues/03-entry-candidate.md) | claimed | [01](../.scratch/m2-first-release/issues/01-project-threads.md)、[02](../.scratch/m2-first-release/issues/02-configuration-models.md) |
| [m2-first-release / 04 输入与附件](../.scratch/m2-first-release/issues/04-input-attachments.md) | claimed | 无；范围以所属规格为准 |
| [m2-first-release / 05 队列与子 Agent](../.scratch/m2-first-release/issues/05-queue-subagent.md) | open | 无；范围以所属规格为准 |
| [m2-first-release / 06 阅读与组合验收](../.scratch/m2-first-release/issues/06-reading-acceptance.md) | open | 无；范围以所属规格为准 |
| [m2-first-release / 06e 有界诊断读取与脱敏](../.scratch/m2-first-release/issues/06e-bounded-diagnostics.md) | claimed | 无；范围以所属规格为准 |
| [m2-first-release / 06f 正式诊断GUI与反馈闭环](../.scratch/m2-first-release/issues/06f-diagnostics-feedback-gui.md) | claimed | 无；范围以所属规格为准 |
| [m2-first-release / 06g 诊断切片集成与macOS候选](../.scratch/m2-first-release/issues/06g-diagnostics-candidate.md) | open | [06e](../.scratch/m2-first-release/issues/06e-bounded-diagnostics.md)、[06f](../.scratch/m2-first-release/issues/06f-diagnostics-feedback-gui.md) |
| [state-query-alignment / 04 集成验证与试用交接](../.scratch/state-query-alignment/issues/04-integration-verification.md) | claimed | 无；范围以所属规格为准 |

## 重要待决与继续边界

- [09 暂缓队列后的退出出口](../.scratch/m1-s3-control-recovery/issues/09-quit-discard-decision.md)（open），影响及替代路径见所属票；记录存在不表示问题解决。
- [G1 按能力验证](../.scratch/development-foundation/spec.md)：执行全周期单写尚未证实，冷恢复只读；不是全部能力一次性验收。
- [S3 控制、交互与恢复](../.scratch/m1-s3-control-recovery/spec.md)：冷恢复仅只读，unknown 不自动重发；退出非空队列尚无放弃出口。
- [S5 组合验收](../.scratch/m1-s5-combination-acceptance/spec.md)：不 push、不公开发布、不扩 M2/M3；冷恢复只读，unknown 不自动重发；暂停队列放弃出口继续待决。
- [M2 首版](../.scratch/m2-first-release/spec.md)：2026-10-06用户追加授权push及相关PR收尾；集成交互策略PR #2后将本阶段交付到main。Node24.21.0/pnpm12.8.1已对齐；不公开发布、不扩M3，冷恢复只读，unknown不自动重发；用户认可pending。
- [Effect 原生连接生命周期](../.scratch/effect-native-lifecycle/spec.md)：Effect 限定 execution/host 与 execution/main/transport；unknown 不自动重发，冷恢复只读。
- [S5 前基建收口](../.scratch/infrastructure-closure/spec.md)：只本地 commit、不 push 或公开发布；许可证由权利人决定，签名/公证/更新尚未实施。
- [OMP 18.4.6 升级与运行时边界加固](../.scratch/runtime-hardening-omp1845/spec.md)：2026-10-01 用户认可方案及实施范围，允许合理分工与适量 sub agent；本次从4d294e0实施；随后授权18.4.6及唯一导入修正。保留冷恢复只读、unknown 不自动重发和同目录多 Thread 基线。
- [全项目组织整理](../.scratch/project-organization/spec.md)：保留领域公开面、资源所有权、持久化事务和恢复顺序；历史证据不改写。
- [核心重写及外观补修](../.scratch/rewrite-preparation/spec.md)：同题复测未证明接手效率提升；真实供应商、系统 IME 与用户体验未认可。
- [类型安全桌面路由](../.scratch/router-integration/spec.md)：本地实施和提交；不 push、不改变 OMP 执行及冷恢复政策。
- [状态与查询对齐](../.scratch/state-query-alignment/spec.md)：刷新失败保留旧采样的体验尚待试用；不因工程通过改变产品策略。

<!-- source-sha256: 8fcadffbd4f64fd61f6862c3bb97071b190ef3007af267e914ec5ffa93a9eaa1; sources: 113 -->
