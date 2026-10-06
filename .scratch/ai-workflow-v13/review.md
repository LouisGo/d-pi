# 独立双轴 review

日期：2026-10-06。两名 reviewer 均只读，使用原始要求/合同和固定来源，不接受作者结论作为证明。

## 固定范围

- 初稿：`git diff 8cb39fc...cd198bb`，提交列表 `git log 8cb39fc..cd198bb --oneline`；实际 merge-base 为 `8cb39fc6951f5b92aff88191a2d42814dabde51e`，head 为 `cd198bb11cfddda21a44efb1db86548a84b8f26a`。
- 修复：单独审查 `git diff cd198bb...748a9b5`；head 为 `748a9b5745dbaf2aab3d64d3c39f3d7f7fe38bae`。Reviewer 通过 git show 提取固定模块与测试到临时目录，未把后续 WIP 混入原始结论。
- 原始参考两轮全文、官方 v1.3.1、当前六项 spec 验收、任务约定与源码分别核对；未照收参考中的 DAG 自动最大并发、强制 PR 或无人控制 retro 等推断。

## 发现与修复

| 轴 | 初稿结果 | 最终结果 |
| --- | --- | --- |
| Spec（review_spec） | 1 P2：无 project-status 行的合法 plan-only 规格未进入看板指纹 | 原触发场景及7项计划行为测试通过，发现关闭；无其他高价值发现 |
| Standards（review_standards） | 1 P2：独立复现同一漏报，违反计划变更刷新指纹合同 | 19项相关 tests 通过；原 CLI 场景正确报 STATUS-STALE，无剩余高价值发现 |

两轴发现是同一个问题，合并为一项修复，但保留各自覆盖与结论。初稿 `project-status.mjs` 只使用计划解析的 issues，来源仅含任务与看板行 spec；改选票/hold 后 frontier 已变化，digest 却不变。`748a9b5` 将 `readSlicePlans.sources` 纳入原有 sources/digest，复用同一状态体系。

独立复核方式不同：Spec reviewer 移除 hold，使 ready 从空变为01；Standards reviewer 改选票并增加 hold，通过 CLI write/check 验证。修复后前者 digest 变化并由 checkStatusSnapshot 报错，后者 check:status 返回1并报告 STATUS-STALE。

## 覆盖与限制

覆盖 DAG 分类/失败关闭、状态单源、主 Agent/worker 写入归属、worktree 起点与并发降级、WIP/新文件 review 输入、PR/retro 授权与回流、词汇表迁移。第一轮工具 review 另验证了未知选票同时被 documentation/status 拒绝。

本次固定差异 review 没有实际执行产品多 worktree 切片、远端 PR/CI 或 GUI；开发流程的隔离执行另由 forward_test 验证，包括真实双 worker、串行集成与 fan-in。原 fixture 的两轴 review 和执行记录修正见 [原始 review](evidence/forward/review.md)，主 Agent最终独立重跑与状态核实见 [validation](validation.md)。Reviewer 的零剩余发现不代表用户产品认可。
