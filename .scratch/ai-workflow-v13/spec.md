# AI 工作流升级

日期：2026-10-06。基点：`main@8cb39fc`；集成分支：`codex/ai-workflow-v13`。

## 推进与交接

- 2026-10-06 后续授权：用户要求将 [M2 retro 候选](m2-retro-2026-10-06.md)按标准流程处理干净、留下正确的 M2 继续入口后停下。本轮从 `codex/m2-diagnostics@7c9e1fe` 建立 `codex/m2-retro-closure`，只落实测试参数防错、包内等待与证据交接三项；允许本地实现、验证、独立 review、提交与交接，不开始其它 M2 功能。本轮起点的本地 main/已知 origin/main均为 `1c9c30a`，诊断提交当时尚未合入，当前本地整合结果见下；其它 worktree 保留。

- 后续工程结果：票04完成，三项applied；`b84ed9a`与`473dffe`通过目标回归、完整check/build、独立两轴复核和19项现有候选包内自动化重验。M2父票与acceptance不变，SDK资源丢失原因unknown，恢复同源原ZIP不生成新产品版本；[接手](m2-retro-handoff.md)、[验证](m2-retro-validation.md)。本轮仅本地整合，不将前一工作流PR特定授权沿用为本轮push授权，本地main已快进整合到`9959992`，最后追加结果记录后停下。

- 当前范围与授权：用户最初要求参考「对比v13工作流」、联网核对 Matt v1.3，并依据真实项目全面升级 AI 工作流；允许分段 commit 和独立 review subagent。包含仓库规则、skills、只读调度工具及必要验证。2026-10-06 用户在确认 PR/合入建议后明确要求「请直接开始，结束了叫我」，补充授权将本切片 push、创建 PR，并在最终 head CI 通过后合入 main。产品功能与全局 skills 更新仍不在本次范围。
- 产品判断：无新增产品待决。沿用 D-19/D-26/D-28–D-30，授权、工程、试用与认可分开；OMP/App 的所有权不变。
- 工程状态：完成。确定性 ready 集合、执行/review/PR/retro 路由已交付；完整检查、独立两轴 review、串行与真实双 worker 隔离试跑通过。原有任务解析、生成看板与门禁继续复用。
- 用户试用：本次为开发工作流，无 App 候选；以仓库命令和后续 Agent 可接手的入口交付。
- 继续边界：本切片的本地实现、检查、review、commit 与上述 PR/合入可继续；核实最终 head、CI 和远端结果后交付。M2 尚未完成范围和用户认可不改。

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
  {"id": "workflow-v13", "tickets": ["01", "02", "03"]},
  {"id": "m2-retro-closure", "tickets": ["04"]}
]
```

- [01 确定性切片计划](issues/01-slice-plan.md)
- [02 工作流规则与 skills](issues/02-workflow-skills.md)
- [03 验证、独立 review 与交接](issues/03-verify-handoff.md)
- [04 M2 retro 回流与继续入口](issues/04-m2-retro-closure.md)

## 依据与取舍

参考对话已读全部两轮，无附加文件。上游与本地差异及来源见 [research](research.md)。保留现有任务单源，新增 plan 只选票/注明暂缓，不复制 Status 或 Blocked by。并行和 worktree 是隔离手段；实际并发还要判断共享接口和文件写集。PR 可选，retro 不自动扩张授权。

```project-status
[
  {
    "id": "ai-workflow-v13",
    "title": "AI 工作流升级",
    "phase": "基建",
    "engineering": "complete",
    "trial": "not-applicable",
    "acceptance": "not-applicable",
    "evidence": ["handoff.md", "validation.md", "review.md", "research.md", "m2-retro-2026-10-06.md", "m2-retro-handoff.md", "m2-retro-validation.md", "m2-retro-review.md"],
    "next": "M2 retro三项applied，票04工程完成；管理复核与本地整合完成，本轮停下；后续按M2 spec与其它会话真实进度选定范围"
  }
]
```
