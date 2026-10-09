---
name: d-pi-pr
description: "在用户要求或已选择 PR 时，为 d-pi 编写描述、准备 Draft/ready 或核实合入；表达行为、证据与回滚风险。普通任务收尾不触发。"
---

# PR 工程交接

仅用户要求 PR 或任务实际采用外部审查/远端合并门禁时使用；普通 commit/Dev 交付不生成 PR 草稿。先读所属记录、真实 base/head 差异和[任务约定](../../../docs/agents/issue-tracker.md#reviewpr-与-retro-收尾)。Body 使用[仓库模板](../../../.github/pull_request_template.md)的三个部分，按风险缩放，不机械填空。

- **Summary**：先说具体问题和最终行为，再用有价值的最小伪代码、调用树、文件树或 diff 表达变化。小修一两句足够，不强制画图。链接所属 spec/切片/票；使用[GLOSSARY](../../../GLOSSARY.md)中的领域词，不记开发聊天史。
- **Evidence**：具体 Before/After 与实际命令/结果、原始证据路径和 source commit。TDD 使用真实失败→通过；文档或补测已有行为用实际差异和通过的检查，明确没有行为红灯。注明 fixture/真实固定 SDK/包内 GUI/用户反馈各自覆盖，不用“全绿”冒称产品认可；保留未运行或失败项。
- **Merge Danger**：说明 one-way/two-way door 的依据、影响链、数据/资源/权限变化、回滚方法及可能无法恢复的外部效果。纯 revert 不一定回滚持久化迁移；风险不能靠写“低”或“two-way”消失。

已有评审按实际模式链接，普通任务的一次双轴审查不冒称独立 review，也不为 PR 补两份报告。本地任务文件路径用仓库相对链接，不用 `Closes #01` 假装 GitHub 票；工程完成、候选、试用与用户认可分别表达。

## 外部操作

本地任务完成不以远端 PR 为前提。用户要求创建/更新 PR 或已有相同动作范围授权时继续；只讨论 PR 规则不产生 push、merge 或发布授权。已要求 PR 但缺远端动作授权时，在所属记录准备可审查 body 和准确提交；需要独立交接时才另建 `pr.md`。用户要求本地合入时核实并执行 Git 集成，不套用 GitHub Draft/ready 状态。

需要 Draft 时先确认目标 remote/base、领先提交和是否已有同一切片 PR，复用它；空分支不能开 PR。CLI 多行 body 写文件并用 `--body-file`，不能以 shell 插值构造。每个实际创建的 PR 都调用 `attach_artifact` 关联当前 Codex chat；用户要求继续已有 PR 也 attach。

转 ready 前核实最终 diff、适当检查、按风险选择的评审及必需 CI；评审模式见[review skill](../d-pi-code-review/SKILL.md)。远端 CI 从该 head 的实际 run 读取，配置存在不算通过。CI 未运行/失败/权限不可用时保留 Draft 和原因；无 CI 要求的场景明确说明验证覆盖。没有 PR 则报告本地验证，不能声称远端 ready/merged。

用户请求 merge 时核实确切 head、目标分支、阻塞检查与风险决定，并按现有授权操作；完成后核实目标端状态。PR merge 不自动关闭验收父票，不更新 acceptance 为 accepted。具体试用按[本地交付](../../../docs/engineering/local-delivery.md#选择运行与交付方式)选择；Dev 是日常默认，打包不是创建/ready/合并 PR 的通用前置，包内验收只在对应证据缺口需要时运行。
