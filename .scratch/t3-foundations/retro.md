# T3 长任务工作流复盘

2026-10-07。用户明确授权：有复利价值则附赠一次 commit，没有则不强行修改。范围为本次会话的 Agent 工作环境；生产源继续固定 `b49c413f99ff417172a9f44b6cd124f1d222dd1f`。

## Applied：共享规则修复追踪实际消费者

原始证据：当前会话 `01a11502-3f78-7013-a24c-5915457c694c` 的 19:07 更新、两轴独立发现及[组合记录](evidence/07-integration.md)一致。`0cfd182` 修复目录 `documents.pdf` 的冻结导出判定，但正式 Preview 仍按文件名扩展名判定，返回 `unavailable`。追加同一场景的实际 Preview RPC 断言后得到 **1 failed /2 passed**；日志为 `/tmp/d-pi-t3-directory-preview-red.log`，临时日志不作为持久交付的唯一依据。

可重复成本：同一规则在两个真实入口不一致，局部修复转绿后仍需下一轮 review、修复及验证。根因已由源码差异与公开行为反例证实：第一次修改仅覆盖 `describe`，没有追踪 `preview` 对同一判定的消费。

最小回流位置：[review skill](../../.agents/skills/d-pi-code-review/SKILL.md) 的“核实与结论”增加一个有条件的操作指引。只有修复共享判定或所有权规则时才追踪消费者，把原反例用于受影响的公开入口，并说明未验证项；保持独立合同与无关矩阵的范围边界。现有产品合同、根 AGENTS 和工具入口无需追加相同要求。

历史修复证据：`b49c413` 将 `describe` 和 `preview` 的已知目录格式判定集中到 `identifyStoredContent`；[持久反例](../../tests/integration/clipboard-directory-format.integration.test.ts)覆盖导出、跨项目导入、Preview 和 prepare。相关 **5 files /41 tests passed**，普通 PDF 的严格判定在最终独立 Standards 复核中保持，详见组合记录。

本次回流的验证与限制：按新指引复查上述源码差异，实际搜索还找到动态 prepare 的 `identifyContent` 调用；该路径已有独立目录读取合同，不能盲目替换为存储内容判定。检查 review skill 原有固定范围、两轴和按风险复测要求，新增指引兼容这些约束。文档检查、快速门禁及既有交互检查入口测试在本次提交前运行并记录下方结果；本次只改 skill 与复盘/交接，不重跑生产构建或原生矩阵。未来修复轮次能否减少仍需后续任务证据，不宣称已测得效率增益。

## Declined

- **重复接线交互检查**：完整 `check` 经 `lint:design` 调用 `checkInteractionPolicy`，快速检查直接调用 `lint:interaction`；[现有测试](../../tests/tooling/interaction-policy.test.mjs)已覆盖该接线。不能只读 package 脚本的一层就判定缺门禁，本次不增加重复执行或第二套 checker。
- **自动刷新生成文件或每轮全矩阵**：结构/状态新鲜度失败已有明确生成与审查入口；自动在 hook 修改文件会违背[现有工程约定](../../docs/engineering/checks.md)。本次剪贴板保护检查在 Copy 前中止、随后按原保护流程重试通过，未证实需要改产品或建立新规则。

## 回流提交与验证

唯一回流提交包含本记录、review skill 和交接入口，提交标题为 `chore(workflow): trace shared-rule consumers in review fixes`。可从 `git log -1 --format=%H -- .scratch/t3-foundations/retro.md` 取回实际 SHA；原始缺陷与修复提交可用 `git show 0cfd182`、`git show b49c413` 核实。

- `pnpm check:fast` 退出0：工具、Biome、交互、文档、架构423文件、结构及状态新鲜度全部通过；没有修改生成文件。
- `node scripts/testing/test.mjs node tests/tooling/interaction-policy.test.mjs`：4 tests passed，确认既有正负例与完整/快速检查接线。
- `git diff --check` 通过；复盘正文的5个本地证据链接逐一核实存在。该文件不属于 documentation gate 的 scratch 入口集合，链接核实单独完成。
- 小型文档回流由本地分别覆盖 Spec（用户授权、最小范围）与 Standards（合同路由、固定证据、验证边界）两轴；无未处理发现，未委派独立 reviewer，未将历史产品测试记为本次重跑。
