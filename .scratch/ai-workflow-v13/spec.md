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
    "evidence": ["handoff.md", "validation.md", "review.md", "research.md", "m2-retro-2026-10-06.md", "m2-retro-handoff.md", "m2-retro-validation.md", "m2-retro-review.md", "validation-retro-2026-10-07.md"],
    "next": "2026-10-09单人维护流程已精简；普通任务默认main串行、相关验证、一处简记与Dev交付，PR/隔离/独立评审按需；下一轮检验实际执行成本"
  }
]
```

## 2026-10-07 验证工作流改善

用户授权先改善工作流程并推进完成PR，落实现有D-28，不扩大产品范围。[本轮retro记录](validation-retro-2026-10-07.md)维护证据、工程验证、独立复核与交付；后续开发按所属功能规格选择必要验证，不默认叠加完整E2E或Computer use。

## 2026-10-09 单人维护工作流精简

授权：用户在本会话讨论验证/文档成本和 worktree/PR 管理后，明确要求“开始按照这几轮对话的结论，优化工作流”。本轮从当前目录 `main@44f7911` 串行修改规则、合同与项目 skills；提交时发现纯文档受无关应用lint阻塞，补现有hook的检查选择和必要回归。不修改产品实现、测试并发配置、个人全局规则或 memory，不清理旧 worktree，不沿用历史远端授权。

本节是当前推进记录，取代上方 2026-10-06/07 的完整切片流程作为日常默认；历史工程、评审和交付证据不改写。沿用 D-28，OMP/App 所有权、TDD、数据/权限与恢复合同不变，无产品待决。

| 状态 | 原始证据与成本 | 原因及改进落点 | 验证 |
| --- | --- | --- | --- |
| applied | [10-07复盘](validation-retro-2026-10-07.md)记录局部CSS后68条Electron、14条包内记录与CUA；设计合同仍要求相关控件变化跑完整interaction | 入口过宽和默认规则仍有强制升级；headless/design合同改为相关静态/行为检查，具体风险才升级 | 文档入口与场景推演；下一轮核对高成本验证是否有具体缺口 |
| applied | Provider/Models 的spec、handoff、validation、PR与local-merge重复更新同一交付身份；提交4d1223b/99ec699/c14297c可查 | 日常记录未与复杂交接分开；任务约定、Dev交付和skills改为所属spec或票一处简记 | 检查所有收尾路由；下一轮普通任务只需一处手工记录 |
| applied | 实施skill无条件进入PR，任务约定却称PR可选；本轮Git列出10个额外检出目录，不能据数量判定均可删 | 并行切片方式被用于串行日常；当前目录main为默认，分支/worktree/PR独立按需选择 | 普通单写、高风险串行、并行写者与明确PR场景核对 |
| applied | 实施skill要求独立两轴review，review skill按较大切片固定两个reviewer | 检查维度与评审人数绑定；普通diff一次覆盖两轴，高风险/复杂组合/用户要求才选独立评审 | 普通文档/UI与恢复/身份场景核对；不冒称独立review |
| applied | 本轮纯规则提交的原hook被main已有两处应用Biome错误阻塞，HEAD源码核实错误并非本轮引入 | 全工作树lint与暂存范围脱节；现有hook按Markdown-only选择docs/status，其余保留快速门禁并限Biome到暂存文件，配置变化仍全量 | Markdown-only目标先失败再实现；真实Git提交fixture覆盖混入代码、代码改名、配置变化及失败拒绝，其余正确行为为回归覆盖 |
| proposed | [Provider验证](../providers-models/validation.md)记录同一worker两次SIGABRT，限并发后完整套件通过 | 根因仍unknown；后续有复现时调查测试并发/worker，当前只明确重复全量重跑不能代替诊断 | 本轮不修改测试配置或运行完整套件 |

本轮主 Agent 一次核对两轴：Spec 覆盖用户确认的串行main、按风险验证、一处简记和按需PR；Standards 核对并行单写/隔离、固定评审输入、TDD、恢复与认可边界。普通UI场景走相关静态/组件检查与Dev反馈；恢复场景增加对应集成和独立评审而不自动建worktree；并行写者隔离并串行集成；明确PR才进入body/CI/合入。上述为规则场景核对，未执行这些产品流程，不冒称独立review。

文档链接/锚点/D-ID检查与生成看板检查通过，`git diff --check`通过；四个修改skill的YAML/frontmatter及UI metadata经系统Ruby YAML检查通过。标准Python quick validator因本机和bundled Python均缺PyYAML未能启动，未安装依赖，改用现有YAML解析器核对相同字段约束。git-hooks/documentation-gate/project-status/engineering-entrypoints共32个相关用例通过（hook最终18项复核通过，含status失败和未知入口拒绝），两个改动脚本文件Biome通过；测试代理实际转发原fast链，保留失败传播。未运行应用测试、build、Electron、供应商或完整检查。工作流真实收益留待下一轮任务观察，不把文档检查称为已证实提速。

首次本地提交被已安装的快速hook拒绝：默认pnpm shim尝试获取11.24.0且环境拒绝网络，未取得目标12.8.1版本。改用已有 `/tmp/dpi-composer-tools/pnpm` 的12.8.1精确入口后，Node及48个依赖检查通过，但原全量Biome被main已有两处格式错误拒绝；未改应用源码或将失败记为通过。随后按上表修正hook检查范围，未停用hook或修改机器环境配置；最终提交及hook结果见本节所在Git提交和本会话输出。

新hook实际提交检查中，暂存Biome、interaction、documentation和architecture通过，structure仍正确拒绝main的旧生成报告（518源文件，当前522）。使用现有生成器刷新并审查报告，变化对应HEAD已有UI源码而非本轮产品修改，模块合同不变；此生成快照一起交付，不修改模块权限或关闭门禁。
