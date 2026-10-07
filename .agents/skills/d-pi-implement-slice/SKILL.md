---
name: d-pi-implement-slice
description: "执行 d-pi 已授权的 spec 切片或任务：按 DAG 调度 leaf 票、隔离并行实现、串行集成并评审交付。规划或只读分析请求不自动转为实施。"
---

# 执行授权切片

授权、计划格式、票状态与单写归属以[任务约定](../../../docs/agents/issue-tracker.md#授权切片与-ready-frontier)为准。当前任务入口是[总看板](../../../docs/status.md)及用户指定 spec；用户本轮明确范围优先，不能只因看板 current 指向别处就忽略它。

## 准备与派发

1. 读取 spec 的推进与交接和目标票，明确本段可交付结果、真实验收及待决。复用已有规格；只补实施所需 leaf、依赖与指针，父票残余行为另拆，不顺手实现其他开放票。
2. 检查 `git status`、分支、现有 worktrees；固定 base SHA 和集成分支。用户改动保留原位置，必要时建立隔离 checkout；不要 reset 到上游。小单票可沿用当前合适分支，无须强制 worktree/DAG/PR。
3. 多票使用 spec 的 implementation-plan，运行 `pnpm plan:slice -- .scratch/<feature>/spec.md --slice <id>`。核实授权、hold、写集和共享合同；挑可安全并行的 ready 子集，按实际并发额度派发，不机械铺满。
4. 主 Agent 标 claimed 并记录归属。先建独立 worktree/分支，再给 implementer 发任务，显式给其绝对工作目录。以当次 integration SHA 为起点；工具 create_worktree 的默认远端分支不保证这一点，必须指定 ref 并核实实际 HEAD。分支默认 `codex/<slice>-<ticket>`，集成默认 `codex/<slice>`。

Worker 输入最少包含：spec 的相关节、票路径、基点/集成分支、允许写集、必须保持的公共合同、相关模块 AGENTS/skill、验收和交付格式。只读资料可共享；执行目录和写集不可共享。工程环境按[README](../../../README.md#环境准备与启动)准备固定依赖/资源，不复制或复用会混淆源码身份的构建输出。

功能/缺陷按项目 TDD 合同推进；文档和已有正确行为不伪造红灯。按目标加载 headless-features、TypeScript、state-query、architecture、design-system 等真实 SKILL.md，而非只在提示词中提名字；不要求与目标无关的全部 skills。

没有 subagent 或独立 worktree 能力时，按同一 frontier 串行做票，并明确实际模式。可用且获授权时优先并行独立实现；探索已够时不再固定起 exploration/merger Agent。

## 集成循环

- Worker 交付 commit SHA、变更范围、实际测试与未覆盖项。声明随提交保留的证据给出准确路径，交付前用 `git ls-files --error-unmatch -- <选定证据路径>` 核实已暂存/跟踪，主 Agent 用 `git cat-file -e <commit>:<path>` 核实能从提交取回；磁盘存在不等于交付。被忽略的选定工程证据可显式 force-add 或用局部例外，运行日志与业务内容不自动收录。Worker 不负责追赶移动的 integration tip、不合入集成分支，也不写共享管理状态；遇公共合同变化报告给主 Agent。
- 主 Agent 一次只合入一个结果。核实 commit 来自记录的起点与分支、未带范围外修改；用 merge/cherry-pick 等适合当前历史的方式集成。Git 无冲突还需检查跨票语义一致、接口和资源释放，不能据 merge 成功 resolved。
- 完成该票验收、更新票和 spec 后再生成看板；重算 frontier，让依赖票从最新 integration SHA 启动。集成期间已运行的独立 worker 保持原基点，主 Agent 承担新旧合同整合。
- 冲突先判断所有权与合同。普通冲突自主解决；确有收益才派独立 merger/fixer。无法证实正确时保留 worktree 和 blocker，继续其他不依赖工作；不丢弃失败现场。

## 整段交付

可运行体验默认交付 `pnpm dev` 的源码和试用步骤；只有[本地交付](../../../docs/engineering/local-delivery.md#选择运行与交付方式)中的固定候选或打包差异需要才生成包。创建 worktree/PR、完成切片本身不触发打包；验证按受影响行为选择，不为收尾机械重跑完整原生/E2E/Computer use。

运行受影响的确定性检查，再按[d-pi-code-review](../d-pi-code-review/SKILL.md)固定整个集成范围，独立 Spec/Standards review；核实发现并修复，修改后更新受影响检查和评审覆盖。需要真实 GUI 的验收仍按原功能合同，不以工具层通过替代。

按[d-pi-pr](../d-pi-pr/SKILL.md)准备可审查收尾；没有远端操作授权仍可交付本地分支和 body。记录工程状态、实际候选/试用、未完成父票和下一步，清理仅限已保存且可恢复的 worktree。证据支持的环境改进可记为 retro 候选，不自动加载或实施 retro。
