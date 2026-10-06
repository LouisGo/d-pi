# AI 工作流升级

日期：2026-10-06。基点：`main@8cb39fc`；集成分支：`codex/ai-workflow-v13`。

## 推进与交接

- 当前范围与授权：用户本轮明确要求参考「对比v13工作流」、联网核对 Matt v1.3，并依据真实项目全面升级 AI 工作流；允许分段 commit 和独立 review subagent。包含仓库规则、skills、只读调度工具及必要验证。没有由此授权产品功能、全局 skills 更新、push、创建远端 PR 或合并 main。
- 产品判断：无新增产品待决。沿用 D-19/D-26/D-28–D-30，授权、工程、试用与认可分开；OMP/App 的所有权不变。
- 工程状态：实施中。真实起点已有 Markdown 任务依赖校验、生成看板、check:fast 和 macOS CI；缺当前切片的确定性 ready 集合、稳定执行/review/PR/retro 路由。
- 用户试用：本次为开发工作流，无 App 候选；以仓库命令和后续 Agent 可接手的入口交付。
- 继续边界：本地实现、检查、review 与 commit 可继续；外部 Git 操作沿用当前会话授权，未授权时交付本地分支及 PR 草稿即可。M2 尚未完成范围和用户认可不改。

## 目标与验收

1. 当前授权切片以明确 leaf 票集合形成 DAG；只读命令列全部 ready / claimed / blocked / held / resolved 票。依赖来自原票，未选票不被自动执行，非法计划与依赖失败关闭。
2. 主 Agent 单写票状态、spec、聚合与集成分支；并行 implementer 使用独立 worktree、固定基点和最小上下文；串行能力降级、接手和冲突处理仍可完成目标。
3. 独立 Spec / Standards 双轴 review 固定真实差异，含 WIP 与新文件，不由代码作者给自己的实现背书；有证据的高价值问题修复并复核。
4. PR 按需形成 Summary / Evidence / Merge Danger，准确记录验证层级、rollback 和未覆盖路径；本地票不靠 GitHub closing keyword 关闭，merge 不代表试用或认可。
5. Retro 依据会话/失败/review 的原始证据，优先复用机器检查和既有合同，默认提建议；只在用户选择或当前授权明确覆盖时实施，避免无依据地累积规则。
6. `CONTEXT.md` 迁为 `GLOSSARY.md`，现行入口一起更新，历史快照不改；不新增重复的标准或任务注册表。

## 本轮实施计划

本计划用于调度，不代替上述授权。主 Agent 负责状态；01/02 可独立准备，03 消费两者最终结果。

```implementation-plan
[
  {"id": "workflow-v13", "tickets": ["01", "02", "03"]}
]
```

- [01 确定性切片计划](issues/01-slice-plan.md)
- [02 工作流规则与 skills](issues/02-workflow-skills.md)
- [03 验证、独立 review 与交接](issues/03-verify-handoff.md)

## 依据与取舍

参考对话已读全部两轮，无附加文件。上游与本地差异及来源见 [research](research.md)。保留现有任务单源，新增 plan 只选票/注明暂缓，不复制 Status 或 Blocked by。并行和 worktree 是隔离手段；实际并发还要判断共享接口和文件写集。PR 可选，retro 不自动扩张授权。

```project-status
[
  {
    "id": "ai-workflow-v13",
    "title": "AI 工作流升级",
    "phase": "基建",
    "engineering": "in-progress",
    "trial": "not-applicable",
    "acceptance": "not-applicable",
    "evidence": ["research.md"],
    "next": "完成 DAG 计划、skills、双轴 review 与本地交接"
  }
]
```
