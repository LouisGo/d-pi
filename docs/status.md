# 项目总看板

此页由所属规格的 `project-status` 块和任务的 `Status` / `Blocked by` 生成，禁止手工改进度。更新源后运行 `pnpm report:status:write`；`check` / `check:fast` 拒绝非法字段、依赖与陈旧结果。读取约定见 [任务约定](agents/issue-tracker.md#总看板读取约定)。

当前工作：[会话默认流程体验](../.scratch/m2-first-release/spec.md)。默认历史与按项目整理、重复新建免授权免手动启动、CLI 原会话续问和冷重启续问、生成中阅读已完成正式 GUI 与真实模型复核；等待用户复试认可。

工程完成、交付试用与用户认可独立；下面的计划不构成阶段授权。G1 按受影响能力验证，M1 是内部闭环，M2 是首版，M3 是后续增强。

| 阶段 | 切片 / 规格 | 工程 | 试用 | 用户认可 | 构建 / 证据 | 下一步 |
| --- | --- | --- | --- | --- | --- | --- |
| G1 | [G1 按能力验证](../.scratch/development-foundation/spec.md) | 部分完成 | 不适用 | 不适用 | — [证据1](validation/runtime-feasibility.md) | 相关功能及 SDK 升级时复核所需证据 |
| M1 | [S1 项目与草稿](../.scratch/m1-s1-project-draft/spec.md) | 工程完成 | 已反馈待处理/复试 | 待认可 | — [证据1](../.scratch/m1-s1-project-draft/handoff.md) · [证据2](../.scratch/m1-s1-project-draft/hardening.md) | 原文粘贴已修，等待用户复试 |
| M1 | [S2 提交与阅读](../.scratch/m1-s2-submit-read/spec.md) | 工程完成 | 已交付待试用 | 待认可 | 0.1.0-s2.0 [证据1](../.scratch/m1-s2-submit-read/handoff.md) | 等待真实供应商与输入体验反馈 |
| M1 | [S3 控制、交互与恢复](../.scratch/m1-s3-control-recovery/spec.md) | 工程完成 | 已交付待试用 | 待认可 | 0.1.0-s3.0 [证据1](../.scratch/m1-s3-control-recovery/handoff.md) · [证据2](../.scratch/m1-s3-control-recovery/integrity-review.md) | 等待试用，退出放弃另行对齐 |
| M1 | [S4 文件、选区与差异](../.scratch/m1-s4-files-diff/spec.md) | 工程完成 | 已交付待试用 | 待认可 | 0.1.0-s4.0 [证据1](../.scratch/m1-s4-files-diff/handoff.md) | 等待用户试用；不自动进入 S5 |
| M1 | [S5 组合验收](../.scratch/m1-s5-combination-acceptance/spec.md) | 工程完成 | 已反馈待处理/复试 | 待认可 | 0.1.0-s5.0 / 4b003e84-4c6aa4ad [证据1](../.scratch/m1-s5-combination-acceptance/handoff.md) · [证据2](../.scratch/m1-s5-combination-acceptance/evidence/acceptance.md) · [证据3](../.scratch/m1-s5-combination-acceptance/evidence/final-s5-result.json) · [证据4](../.scratch/m1-s5-combination-acceptance/evidence/frozen-review.md) | M1 工程完成、用户未认可；入口反馈由已授权 M2 接续处理 |
| M2 | [Composer M1/M2 编辑体验](../.scratch/composer-quality/spec.md) | 工程完成 | 已反馈待处理/复试 | 待认可 | main merge98fa5db；sourceec09aeb/行为ace6a19；完整check/build通过 [证据1](../.scratch/composer-quality/handoff.md) · [证据2](../.scratch/composer-quality/validation.md) · [证据3](../.scratch/composer-quality/review.md) | 已完整合入本地main；用户复试Finder回返outline、图片/文件与长期性能，实机认可pending |
| M2 | [M2 首版](../.scratch/m2-first-release/spec.md) | 实施中 | 已交付待试用 | 待认可 | 0.1.0-m2.20 / 3c4c1060-8b550d60 [证据1](product/first-release.md) · [证据2](../.scratch/m2-first-release/handoff-entry.md) · [证据3](../.scratch/runtime-hardening-omp1845/handoff.md) · [证据4](../.scratch/m2-first-release/configuration-sharing.md) · [证据5](../.scratch/m2-first-release/mainflow-feedback.md) · [证据6](../.scratch/m2-first-release/progress-audit.md) · [证据7](../.scratch/m2-first-release/navigation-continuity.md) · [证据8](../.scratch/m2-first-release/development-tools.md) · [证据9](../.scratch/m2-first-release/rendering-isolation.md) · [证据10](../.scratch/m2-first-release/e2e-convergence.md) · [证据11](../.scratch/m2-first-release/warm-session-liveness.md) · [证据12](../.scratch/review-seven-commits/spec.md) · [证据13](../.scratch/m2-first-release/next-stage.md) · [证据14](../.scratch/m2-first-release/queue-configuration-review.md) · [证据15](../.scratch/m2-first-release/content-preparation.md) · [证据16](../.scratch/m2-first-release/lifecycle.md) · [证据17](../.scratch/m2-first-release/lifecycle-review.md) · [证据18](../.scratch/m2-first-release/project-references.md) · [证据19](../.scratch/m2-first-release/project-references-review.md) · [证据20](../.scratch/m2-first-release/long-reading.md) · [证据21](../.scratch/m2-first-release/long-reading-review.md) · [证据22](../.scratch/m2-first-release/diagnostics.md) · [证据23](../.scratch/m2-first-release/diagnostics-review.md) · [证据24](../.scratch/ai-workflow-v13/m2-retro-handoff.md) · [证据25](../.scratch/m2-first-release/attention.md) · [证据26](../.scratch/m2-first-release/attention-review.md) · [证据27](../.scratch/m2-first-release/progress-2026-10-06.md) · [证据28](../.scratch/m2-first-release/real-provider-e2e.md) · [证据29](../.scratch/m2-first-release/pr4-integration.md) · [证据30](../.scratch/m2-first-release/reading-loop.md) · [证据31](../.scratch/m2-first-release/reading-loop-review.md) | m2.20诊断/提醒候选已交付，PR#4已合入main，后续从最新main开始UI迭代；首次本机OpenAI GPT-5.6 Luna新Thread真实生成/GUI阅读完成。M2尚未完成，PDF视觉/OCR、01c系统显示/点击、V1-00/B6组合、其余真实账户/供应商路径及用户认可保持开放；冷旧Thread只读 |
| M2 | [首个长会话阅读闭环](../.scratch/m2-first-release/spec.md) | 工程完成 | 已交付待试用 | 待认可 | Dev c04e245 / Chromium d987f98 [证据1](../.scratch/m2-first-release/reading-loop.md) · [证据2](../.scratch/m2-first-release/reading-loop-review.md) · [证据3](../.scratch/m2-first-release/reading-loop-pr.md) | 首个长会话阅读闭环已本地PR合main并push，远端源码289d36d已核实；从main pnpm dev试用。R1–R15、双轴无高价值遗留、真实Luna/Dev及干净Chromium证据已交付；用户认可pending，M2父范围仍开放。 |
| M2 | [长会话连续体验修复](../.scratch/m2-first-release/spec.md) | 工程完成 | 已交付待试用 | 待认可 | Dev source c4bc00b [证据1](../.scratch/m2-first-release/long-session-repair.md) | 本地Dev三项修复已交付，两次冷恢复及真实模型/GUI/双轴评审通过；等待用户复试认可，M2其它项保持。 |
| M2 | [Provider 与 Models 完整闭环](../.scratch/providers-models/spec.md) | 工程完成 | 已交付待试用 | 待认可 | main merge 55550021；source 99ec699b；历史 GUI 构建身份见交接 [证据1](../.scratch/providers-models/local-merge.md) · [证据2](../.scratch/providers-models/handoff.md) · [证据3](../.scratch/providers-models/validation.md) · [证据4](../.scratch/providers-models/review.md) | 已合入 main 并 push；从原项目目录 pnpm dev 试用实际账户与 Provider/Models 体验 |
| M2 | [会话默认流程体验](../.scratch/m2-first-release/spec.md) | 工程完成 | 已交付待试用 | 待认可 | Dev source f795b82 [证据1](../.scratch/m2-first-release/seamless-sessions.md) | 默认历史与按项目整理、重复新建免授权免手动启动、CLI 原会话续问和冷重启续问、生成中阅读已完成正式 GUI 与真实模型复核；等待用户复试认可。 |
| M3 | [M3 后续增强](../.scratch/development-foundation/spec.md) | 未实施 | 未交付 | 待认可 | —  | 未启动，保留边界 |
| M3 | [集成终端 B 方案](../.scratch/integrated-terminal/spec.md) | 未实施 | 未交付 | 待认可 | — [证据1](../.scratch/integrated-terminal/handoff.md) · [证据2](architecture/terminal.md) · [证据3](validation/terminal.md) | B与xterm路线已确认、文档已交付；待关联/退出产品答复及后续开发授权。 |
| 基建 | [AI 工作流升级](../.scratch/ai-workflow-v13/spec.md) | 工程完成 | 不适用 | 不适用 | — [证据1](../.scratch/ai-workflow-v13/handoff.md) · [证据2](../.scratch/ai-workflow-v13/validation.md) · [证据3](../.scratch/ai-workflow-v13/review.md) · [证据4](../.scratch/ai-workflow-v13/research.md) · [证据5](../.scratch/ai-workflow-v13/m2-retro-2026-10-06.md) · [证据6](../.scratch/ai-workflow-v13/m2-retro-handoff.md) · [证据7](../.scratch/ai-workflow-v13/m2-retro-validation.md) · [证据8](../.scratch/ai-workflow-v13/m2-retro-review.md) · [证据9](../.scratch/ai-workflow-v13/validation-retro-2026-10-07.md) | 2026-10-07按风险验证与窄场景入口工程完成、独立两轴复核通过；PR#7合并后从main进入下一阶段 |
| 基建 | [Beautiful UI 基础视觉体系升级](../.scratch/beautiful-ui-system/spec.md) | 工程完成 | 已交付待试用 | 待认可 | — [证据1](../.scratch/beautiful-ui-system/handoff.md) · [证据2](../.scratch/beautiful-ui-system/review.md) · [证据3](../.scratch/beautiful-ui-system/evidence/native-observations.json) | 用户在Dev组件看板及真实入口试用统一视觉体系；认可pending |
| 基建 | [Codex 式工作台基础布局](../.scratch/codex-workbench-ui/spec.md) | 部分完成 | 已交付待试用 | 待认可 | Dev / codex/thread-layout / 16568d3 [证据1](../.scratch/codex-workbench-ui/feedback-handoff.md) · [证据2](../.scratch/codex-workbench-ui/thread-surface-handoff.md) · [证据3](../.scratch/codex-workbench-ui/sandwich-validation.md) · [证据4](../.scratch/codex-workbench-ui/baseline-refinement.md) | Dev试用Thread工具Modal、TabStrip独立组合与搜索焦点修正；后续消息/Composer细化等用户指令，原A3缺口仍开放 |
| 基建 | [开发者工具与基础组件看板](../.scratch/component-dashboard/spec.md) | 工程完成 | 已交付待试用 | 待认可 | e97c5a05-b19549d5 [证据1](../.scratch/component-dashboard/handoff.md) · [证据2](../.scratch/component-dashboard/validation.md) · [证据3](../.scratch/component-dashboard/review.md) | 用户试用修正版图标预览、常驻目录与独立工作区；认可pending |
| 基建 | [领域目录治理](../.scratch/domain-directory-governance/spec.md) | 工程完成 | 不适用 | 不适用 | — [证据1](../.scratch/domain-directory-governance/handoff.md) | 沿用模块机器清单，目录规模不作为硬门槛 |
| 基建 | [Effect 原生连接生命周期](../.scratch/effect-native-lifecycle/spec.md) | 工程完成 | 不适用 | 不适用 | — [证据1](../.scratch/effect-native-lifecycle/issues/01-native-lifecycle.md) · [证据2](../.scratch/effect-native-lifecycle/validation.md) · [证据3](../.scratch/effect-native-lifecycle/evidence/process-supervision.json) | NativeSession 接入完成；SessionHost 与 Main transport 后续按实际替代收益接入 |
| 基建 | [国际化基础](../.scratch/i18n-foundation/spec.md) | 工程完成 | 已交付待试用 | 待认可 | 0.1.0-i18n.0 [证据1](../.scratch/i18n-foundation/handoff.md) | 等待热切换与输入体验反馈 |
| 基建 | [S5 前基建收口](../.scratch/infrastructure-closure/spec.md) | 工程完成 | 未交付 | 不适用 | 3285474e-dirty-1f488792（工程安全候选） [证据1](../.scratch/infrastructure-closure/handoff.md) | 本轮已完成；S5 按新授权进入所属规格，M2 未启动 |
| 基建 | [Linux E2E 反馈修复](../.scratch/linux-e2e-repair/spec.md) | 工程完成 | 已交付待试用 | 待认可 | base c14297c3 / codex/linux-e2e-repair [证据1](../.scratch/linux-e2e-repair/handoff.md) · [证据2](../.scratch/linux-e2e-repair/validation.md) · [证据3](../.scratch/linux-e2e-repair/review.md) | 原 Linux 机器复试 SDK import 和原生 GUI；137 的终止来源仍未知，用户认可待反馈。 |
| 基建 | [OMP 18.4.6 升级与运行时边界加固](../.scratch/runtime-hardening-omp1845/spec.md) | 工程完成 | 已交付待试用 | 待认可 | 0.1.0-m2.7 / 24f086e7-fa83a4f5 [证据1](../.scratch/runtime-hardening-omp1845/handoff.md) · [证据2](../.scratch/runtime-hardening-omp1845/evidence.md) | 完整切片已本地交付；等待用户试用，M2其它能力与S3退出待决继续留原票 |
| 基建 | [打包体积收敛](../.scratch/package-size/spec.md) | 工程完成 | 已交付待试用 | 待认可 | 0.1.0-workbench.3 / a0367bec-dirty-fa25a054；App851.4MiB / ZIP283.0MiB [证据1](../.scratch/package-size/handoff.md) · [证据2](../.scratch/package-size/comparison.json) · [证据3](../.scratch/package-size/runtime-verification.json) · [证据4](../.scratch/package-size/license-verification.json) · [证据5](../.scratch/package-size/review.md) | 试用体积收敛的macOS arm64本地包；以后升级依赖复核预算和运行闭包；用户认可独立。 |
| 基建 | [全项目组织整理](../.scratch/project-organization/spec.md) | 工程完成 | 不适用 | 不适用 | — [证据1](../.scratch/project-organization/spec.md) | 组织整理与工程验证完成；继续按职责落点维护，新功能由所属切片授权 |
| 基建 | [核心重写及外观补修](../.scratch/rewrite-preparation/spec.md) | 工程完成 | 已交付待试用 | 待认可 | 441b27b4-1525b713 / 2b1990fa-6a10f88e [证据1](../.scratch/rewrite-preparation/handoff.md) · [证据2](../.scratch/rewrite-preparation/issues/09-appearance-performance.md) | 构建继续待试用；当前实施转到基建收口 |
| 基建 | [类型安全桌面路由](../.scratch/router-integration/spec.md) | 工程完成 | 已交付待试用 | 待认可 | 0.1.0-m2.9 / acf535c4-88948e3f [证据1](../.scratch/router-integration/issues/01-routing.md) · [证据2](../.scratch/router-integration/review.md) · [证据3](../.scratch/router-integration/handoff.md) · [证据4](../.scratch/router-integration/evidence/native-result.json) | 试用本地 macOS 候选：页签、会话切换和前进后退；用户认可待反馈 |
| 基建 | [设置页与配置组件](../.scratch/settings-ui/spec.md) | 工程完成 | 已交付待试用 | 待认可 | Dev / codex/settings-ui / d02201c + b0a7ab6 [证据1](../.scratch/settings-ui/handoff.md) · [证据2](../.scratch/settings-ui/validation.md) · [证据3](../.scratch/settings-ui/review.md) | 等待设置页 Dev 试用反馈 |
| 基建 | [状态与查询对齐](../.scratch/state-query-alignment/spec.md) | 工程完成 | 已交付待试用 | 待认可 | 441b27b4-1525b713（随重写包） [证据1](../.scratch/rewrite-preparation/handoff.md) · [证据2](../.scratch/state-query-alignment/issues/04-integration-verification.md) | 04 含试用验收，继续 claimed 等待反馈 |
| 基建 | [T3 研究与基础重构](../.scratch/t3-foundations/spec.md) | 工程完成 | 已交付待试用 | 待认可 | 组合源a20a9c2；check/build通过；历史macOS证据b49c413 [证据1](../.scratch/t3-foundations/research.md) · [证据2](../.scratch/t3-foundations/handoff.md) · [证据3](../.scratch/t3-foundations/evidence/07-integration.md) · [证据4](../.scratch/t3-foundations/local-main-integration.md) | 从main按handoff试用并收集反馈；用户认可仍pending |

## 当前任务与真实阻塞

这里只汇总未解决票。无工程依赖不代表已授权实施；历史候选及试用验收继续由所属规格限定。

| 所属范围 / 任务 | 状态 | 未解决的工程依赖 |
| --- | --- | --- |
| [codex-workbench-ui / A3 验证与交付](../.scratch/codex-workbench-ui/issues/04-validation-delivery.md) | claimed | 无；范围以所属规格为准 |
| [integrated-terminal / 01 可信 PTY 与受管生命周期](../.scratch/integrated-terminal/issues/01-managed-pty.md) | open | 无；范围以所属规格为准 |
| [integrated-terminal / 02 受限会话协议与屏幕恢复](../.scratch/integrated-terminal/issues/02-session-protocol.md) | open | [01](../.scratch/integrated-terminal/issues/01-managed-pty.md) |
| [integrated-terminal / 03 有界输出与背压](../.scratch/integrated-terminal/issues/03-output-control.md) | open | [02](../.scratch/integrated-terminal/issues/02-session-protocol.md) |
| [integrated-terminal / 04 正式工作台终端](../.scratch/integrated-terminal/issues/04-workbench-terminal.md) | open | [03](../.scratch/integrated-terminal/issues/03-output-control.md) |
| [integrated-terminal / 05 多终端、撤销与组合退出](../.scratch/integrated-terminal/issues/05-multiple-shutdown.md) | open | [04](../.scratch/integrated-terminal/issues/04-workbench-terminal.md) |
| [integrated-terminal / 06 组合验证与 Dev 交付](../.scratch/integrated-terminal/issues/06-validation-delivery.md) | open | [05](../.scratch/integrated-terminal/issues/05-multiple-shutdown.md) |
| [m1-interaction-hardening / 03 派发授权排序与 Host 目录复核](../.scratch/m1-interaction-hardening/issues/03-dispatch-authorization.md) | open | 无；范围以所属规格为准 |
| [m1-interaction-hardening / 04 历史 busy 语义复核](../.scratch/m1-interaction-hardening/issues/04-history-busy.md) | open | 无；范围以所属规格为准 |
| [m1-interaction-hardening / 07 退出健壮性与 GUI 可访问补齐](../.scratch/m1-interaction-hardening/issues/07-quit-a11y.md) | open | 无；范围以所属规格为准 |
| [m1-s3-control-recovery / 09 暂缓队列后的退出出口](../.scratch/m1-s3-control-recovery/issues/09-quit-discard-decision.md) | open | 无；范围以所属规格为准 |
| [m2-first-release / 01 项目与 Thread](../.scratch/m2-first-release/issues/01-project-threads.md) | claimed | 无；范围以所属规格为准 |
| [m2-first-release / 01c 提醒切片评审与macOS候选](../.scratch/m2-first-release/issues/01c-thread-attention.md) | claimed | 无；范围以所属规格为准 |
| [m2-first-release / 02 配置、认证与模型](../.scratch/m2-first-release/issues/02-configuration-models.md) | claimed | 无；范围以所属规格为准 |
| [m2-first-release / 03 主流程与候选](../.scratch/m2-first-release/issues/03-entry-candidate.md) | claimed | [01](../.scratch/m2-first-release/issues/01-project-threads.md)、[02](../.scratch/m2-first-release/issues/02-configuration-models.md) |
| [m2-first-release / 04 输入与附件](../.scratch/m2-first-release/issues/04-input-attachments.md) | claimed | 无；范围以所属规格为准 |
| [m2-first-release / 05 队列与子 Agent](../.scratch/m2-first-release/issues/05-queue-subagent.md) | open | 无；范围以所属规格为准 |
| [m2-first-release / 06 阅读与组合验收](../.scratch/m2-first-release/issues/06-reading-acceptance.md) | open | 无；范围以所属规格为准 |
| [state-query-alignment / 04 集成验证与试用交接](../.scratch/state-query-alignment/issues/04-integration-verification.md) | claimed | 无；范围以所属规格为准 |

## 重要待决与继续边界

- [09 暂缓队列后的退出出口](../.scratch/m1-s3-control-recovery/issues/09-quit-discard-decision.md)（open），影响及替代路径见所属票；记录存在不表示问题解决。
- [G1 按能力验证](../.scratch/development-foundation/spec.md)：执行全周期单写尚未证实，冷恢复只读；不是全部能力一次性验收。
- [S3 控制、交互与恢复](../.scratch/m1-s3-control-recovery/spec.md)：冷恢复仅只读，unknown 不自动重发；退出非空队列尚无放弃出口。
- [S5 组合验收](../.scratch/m1-s5-combination-acceptance/spec.md)：不 push、不公开发布、不扩 M2/M3；冷恢复只读，unknown 不自动重发；暂停队列放弃出口继续待决。
- [Composer M1/M2 编辑体验](../.scratch/composer-quality/spec.md)：仅本地PR/merge，不push；本轮未运行GUI/真实Host/provider；Finder原生事件、IME/VoiceOver、长期性能及用户认可pending。
- [M2 首版](../.scratch/m2-first-release/spec.md)：2026-10-06最新授权先push并处理远端PR/提交、让main干净供后续UI开发；允许整合、验证后合并PR#4。不公开发布、不扩M3，冷恢复只读，unknown不自动重发；用户认可pending。
- [首个长会话阅读闭环](../.scratch/m2-first-release/spec.md)：2026-10-07当前明确授权本地PR合main并push，允许现有OMP Luna与并行工作。live/native分源，预算和冷恢复只读保留；不公开发布、不扩M3。
- [长会话连续体验修复](../.scratch/m2-first-release/spec.md)：2026-10-08用户明确授权修复并取代手动分段及冷旧Thread一律只读边界；保留unknown不重发、原生身份与真实独占，允许本机真实模型复核；本地交付，不自动push或公开发布。
- [Provider 与 Models 完整闭环](../.scratch/providers-models/spec.md)：本地 PR 已合入 main 并 push，不公开发布；真实认证服务与用户认可待试用；默认并行测试 worker 失败与限制并发通过分开记录
- [会话默认流程体验](../.scratch/m2-first-release/spec.md)：2026-10-08用户追加授权 CLI 原会话继续，取代 CLI 来源统一只读；首次陌生目录信任保留，unknown不重发，外CLI占用不强占；本地交付，无远端操作。
- [集成终端 B 方案](../.scratch/integrated-terminal/spec.md)：本次仅方案与文档；不开发终端、不新增终端依赖、不远端push/合并；本地合入main已授权；不扩大M2或D-39。
- [Beautiful UI 基础视觉体系升级](../.scratch/beautiful-ui-system/spec.md)：本地源码交付；GUI证据为隔离Electron真实Renderer，不是provider或固定包验收。
- [Codex 式工作台基础布局](../.scratch/codex-workbench-ui/spec.md)：用户已授权本UI分支push、PR及合并；不公开发布或发起真实账户请求。
- [开发者工具与基础组件看板](../.scratch/component-dashboard/spec.md)：仅本地实施与交付；开发者区域固定中文；不改变Thread执行与持久化。
- [Effect 原生连接生命周期](../.scratch/effect-native-lifecycle/spec.md)：Effect 限定 execution/host 与 execution/main/transport；unknown 不自动重发，冷恢复只读。
- [S5 前基建收口](../.scratch/infrastructure-closure/spec.md)：只本地 commit、不 push 或公开发布；许可证由权利人决定，签名/公证/更新尚未实施。
- [OMP 18.4.6 升级与运行时边界加固](../.scratch/runtime-hardening-omp1845/spec.md)：2026-10-01 用户认可方案及实施范围，允许合理分工与适量 sub agent；本次从4d294e0实施；随后授权18.4.6及唯一导入修正。保留冷恢复只读、unknown 不自动重发和同目录多 Thread 基线。
- [打包体积收敛](../.scratch/package-size/spec.md)：不改OMP行为或持久化；不扩平台支持；未签名不发布；全量tooling两个本机环境用例失败见交接。
- [全项目组织整理](../.scratch/project-organization/spec.md)：保留领域公开面、资源所有权、持久化事务和恢复顺序；历史证据不改写。
- [核心重写及外观补修](../.scratch/rewrite-preparation/spec.md)：同题复测未证明接手效率提升；真实供应商、系统 IME 与用户体验未认可。
- [类型安全桌面路由](../.scratch/router-integration/spec.md)：本地实施和提交；不 push、不改变 OMP 执行及冷恢复政策。
- [状态与查询对齐](../.scratch/state-query-alignment/spec.md)：刷新失败保留旧采样的体验尚待试用；不因工程通过改变产品策略。
- [T3 研究与基础重构](../.scratch/t3-foundations/spec.md)：unknown 不重发，冷恢复只读；native/live 无可靠原生身份时保持独立来源；M3 能力仅作设计储备

<!-- source-sha256: e811c714d154bf891823e49e1226aa87ec7a8069bd48ea4d3f5da89f86749458; sources: 185 -->
