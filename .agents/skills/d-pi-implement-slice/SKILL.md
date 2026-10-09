---
name: d-pi-implement-slice
description: "执行 d-pi 已授权任务，默认当前目录串行实现、相关验证与 Dev 交付；需要多票调度或并行隔离时再进入集成流程。规划或只读分析不自动转为实施。"
---

# 执行授权切片

当前任务入口是用户请求、[总看板](../../../docs/status.md)及所属记录；用户本轮明确范围优先。开发位置、记录与按需调度以[任务约定](../../../docs/agents/issue-tracker.md)为准。

## 日常执行

明确本段目标、范围、必要验证及重要待决，复用已有 spec 或票；普通任务不先造 DAG、独立规格或收尾文档。检查工作树与分支，记录起点，默认当前目录 main 串行开发；已有合适分支继续使用。保留用户改动，仅并发写入、冲突隔离或保留基线需要时选择短期分支/worktree。跨模块或新增功能本身不触发隔离。

功能/缺陷按项目 TDD 合同推进；文档和已有正确行为不伪造红灯。只加载目标需要的合同和工程 skills，沿用已读且未变化的上下文。环境准备复用[README](../../../README.md#环境准备与启动)，不为每次任务重建 SDK 或复制会混淆源码身份的构建输出。

按[验证选择](../../../docs/architecture/headless-features.md#日常改动的验证选择2026-10-07)运行受影响的自动测试与必要静态检查，满足当前风险即停止。需要 E2E、实机、供应商请求或完整矩阵时说明具体缺口和停止条件；各层分别选择，失败后只复测受影响部分。

## 按需派发与集成

只有需要调度已拆分任务或选择并行实现时读取 spec 的 implementation-plan，运行 `pnpm plan:slice -- .scratch/<feature>/spec.md --slice <id>`。核实授权、hold、共享接口与写集；主 Agent 单写票状态和 spec。选择有实际收益的 ready 子集，不为填满并发额度拆碎票；串行执行不要求独立 worktree。并行规则详见[任务约定](../../../docs/agents/issue-tracker.md#执行归属与集成)。

- 派并行 implementer 前建立独立目录/分支，明确绝对工作目录、固定基点、允许写集、公共合同和验收。`create_worktree` 默认远端分支不保证集成基点，必须指定 ref 并核实 HEAD。分支使用 `codex/` 前缀，主 Agent 记录必要归属映射；只读评审可用固定差异快照，不另建 worktree。
- Worker 提供 commit、变更、实际测试与未覆盖项，不追赶移动的集成 tip、不合入或写共享管理状态。承诺随提交保留的证据，用 `git ls-files --error-unmatch` 核实跟踪，主 Agent 用 `git cat-file -e <commit>:<path>` 核实可取回；普通操作日志不自动收录。
- 主 Agent 串行合入，核实基点和范围，检查跨票接口、所有权与资源释放；完成票的实际验收才 resolved，再更新必要状态和生成看板。新 worker 可从最新集成点开始，已运行 worker 保持原基点。
- 普通冲突自主解决，重大合同歧义仅暂停依赖部分；保留失败或未合入工作的可恢复位置，不 reset/stash 用户工作。无并行能力时串行完成，不固定起 exploration/merger Agent。

## 整段交付

主 Agent 一次 diff 审查覆盖当前要求与相关合同。执行/恢复/权限/事务/跨进程身份等高风险变化、复杂组合或用户明确要求时，按[d-pi-code-review](../d-pi-code-review/SKILL.md)选择独立评审；普通任务不派两个 reviewer 或生成独立报告。修复后刷新受影响验证和审查覆盖。

交付范围清楚的 commit/diff 与 `pnpm dev` 试用，只在所属记录简记完成内容、验证和剩余问题；工程、试用和用户认可分开。只有[本地交付](../../../docs/engineering/local-delivery.md#选择运行与交付方式)中的固定候选或打包差异需要才生成包。

仅用户要求或实际选择 PR 时加载[d-pi-pr](../d-pi-pr/SKILL.md)，否则不创建 `pr.md`、模拟 PR 或额外合并仪式。使用过 worktree 时核实保留用途，清理只限已保存可恢复且不再需要的工作；证据支持的环境问题可在同一记录留下 retro 候选，不自动执行复盘。
