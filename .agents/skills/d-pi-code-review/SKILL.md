---
name: d-pi-code-review
description: "评审 d-pi 的 PR、分支、提交范围或 WIP，独立核对 Spec 与 Standards 两轴，只报告有触发条件和证据的高价值问题。纯评审不自动修复或提交。"
---

# 双轴评审

按[任务约定](../../../docs/agents/issue-tracker.md#reviewpr-与-retro-收尾)区分工程与体验验收。审查所请求的真实差异；规范来自当前模块 AGENTS、合同及相关项目 skills，不另造 CODING_STANDARDS。

## 固定输入

- 先 `git status --short`。记录 base/head SHA、审查命令与目标 spec/切片；PR 从实际 base/head 读取，用户无效 ref 不能猜一个替代。未指定时可用当前实现记录的基点，只有范围会实质改变结论才澄清。
- 分支：`git diff <base-SHA>...<head-SHA>`、`git log <base-SHA>..<head-SHA> --oneline`。三点比较的是 merge-base，同时记录实际 merge-base SHA，不能把传入 base 名字冒称实际 diff 起点。
- WIP：`git diff HEAD --` 包含 tracked staged/unstaged；用 `git ls-files --others --exclude-standard` 枚举并阅读相关新文件。指定 staged-only/unstaged-only 时遵从指定。分支+WIP 审查包含两份差异及重叠文件最终状态；空 committed diff 不等于没有修改。
- 为独立 reviewer 固定一次输入：保存差异/相关新文件副本到临时目录，或使用已提交且不再变化的 ref/worktree。记录覆盖文件，审查中不要修改这些源；若发生变化，刷新受影响覆盖后才能声称结论适用于当前版本。
- Spec 优先使用当前用户请求与所属 spec/票，读其授权、验收和受影响决定；没有 spec 继续标准轴并标明规格未验证。缺必须材料仅暂停依赖部分。

## 两轴独立检查

较大切片用两个只读独立 review subagent；给它们相同固定差异和必要原始依据，不给作者结论或预设问题。小改动、委派未授权/不可用时本地分别覆盖两轴并说明模式。

| 轴 | 提示与最少依据 |
| --- | --- |
| Spec | 当前 spec/选票/决定/相关行为合同。检查遗漏或部分实现、实际错误、范围扩大；每条发现引用原要求及可触发路径，区分工程验证与用户认可 |
| Standards | 目标模块与直接依赖、AGENTS、相关工程 skill/合同。检查所有权、真实身份、提交/恢复、状态/React 生命周期、资源释放、环境/模块边界；纯文档/tooling 只读相关规范 |

机器能判的 lint/类型/结构问题先用现有检查；不拿启发式 smell 当缺陷，不为了统一风格提出无价值重构。发现应有：严重度、轴、具体文件/行、触发条件、要求/合同、实际影响、最小修复方向。根因未证实标为未知与验证方式；可无发现，不凑数量。

## 核实与结论

主 Agent 在真实源或隔离复现中核实每个候选发现；不照收 reviewer 文本。重复问题可合并并保留两轴标签；按影响排列，但分别保留 Spec/Standards 是否覆盖、问题数与未验证项，不以一个总分掩盖任一轴失败。

修复共享判定或所有权规则时，先搜索实际消费者并追踪可达入口，区分采用同一规则的路径与有独立合同的路径。把原反例用于受影响的公开行为边界，核对修复是否完整；报告已覆盖入口与仍未验证项，不以最先失败的入口转绿代替整体修复，也不扩大到无关矩阵。

纯 review 到报告结束。已授权实现中的 review 由主 Agent 修复有依据问题，复跑受影响验证，再由独立 reviewer 复核对应差异与整体合同；无需为无关文件重跑全部矩阵。收尾准确记录 base/head 或 WIP 指纹、检查结果和限制；对未授权远端评论、提交、merge 不自动操作。
