# 固定来源与项目差异

核对日期：2026-10-06；本地源码基点 `8cb39fc`。参考对话：[对比v13工作流](chatgpt-conversation://6ac3aafa-6f64-83ec-91ba-b3d1b2b3d367)，两轮全文已读取，作为建议而非项目事实。

## 上游

官方[发布列表](https://github.com/mattpocock/skills/releases)与作者[v1.3 说明](https://www.aihero.dev/skills/skills-changelog-v13-implement-spec-pr-retro-and-glossary-md)显示 v1.3.1 为本次核对的最新发布；原始材料固定到 [v1.3.1](https://github.com/mattpocock/skills/releases/tag/v1.3.1)，不用移动 main 充当版本。

- [implement-spec](https://github.com/mattpocock/skills/blob/v1.3.1/skills/engineering/implement-spec/SKILL.md)：票是有 blocker 的任务图，ready frontier 跨独立 worktree 实现，落在一个集成分支；PR 只在 tracker 通过 PR 关闭工作或用户要求时创建，并须已有领先提交。集成后全范围 review。
- [code-review](https://github.com/mattpocock/skills/blob/v1.3.1/skills/engineering/code-review/SKILL.md)：独立 Spec 与 Standards。D-PI 采用双轴覆盖，报告仍需核实触发条件与高价值缺陷，不照收上游通用 smell 列表或子 Agent 的未验证结论。
- [pr](https://github.com/mattpocock/skills/blob/v1.3.1/skills/engineering/pr/SKILL.md)：最小表达解释改动，前后证据，可逆性与影响范围。D-PI 不为文档或既有正确行为制造失败测试；验证注明 fixture、真实 SDK、GUI、用户反馈的层级。
- [retro](https://github.com/mattpocock/skills/blob/v1.3.1/skills/engineering/retro/SKILL.md)及作者说明：从真实 session 寻找导航、检查、判断规则、工具成本和信息缺口；默认给人选择，不能无人控制地自我改写。
- 词汇表改名为 GLOSSARY；resolving-merge-conflicts 已删除。普通合并由宿主 Agent 处理，不增加固定 merger Agent。

这里吸收方法并写成适配仓库的原创说明，不批量复制上游或覆盖用户全局 skills。当前全局 tdd 仍引用 CONTEXT，仓库的领域约定明确以 GLOSSARY 为准；未来全局升级单独处理。

## 当前源码证据

| 入口 | 事实与本次选择 |
| --- | --- |
| `scripts/tasks/task-records.mjs` | 已解析 NN/NNletter、状态、缺失依赖、环及 resolved 时依赖仍开放；新计划复用解析结果 |
| `scripts/tasks/project-status.mjs` | 工程/试用/认可独立，源内容 hash 保证看板新鲜度；计划纳入同一校验，不造第二份状态 |
| `docs/agents/issue-tracker.md` | Frontier 仍为最小编号单票；提升为当前切片所有可执行 leaf 的集合 |
| `.scratch/m2-first-release/issues/04-input-attachments.md` | 父票包含已完成 04a 与剩余 PDF/B4；不能因 open/claimed 就把父票作为单个 implementer 任务 |
| `package.json`、`.githooks/pre-commit`、`.github/workflows/check.yml` | 已有快速门禁和完整 macOS CI；新检查接入现有路径，提交 hook 需显式安装且不代表 CI 已运行 |
| `CONTEXT.md`、`docs/agents/domain.md` | 实际内容是单领域词汇；仅改名和现行引用，UI 文案继续由 product-terminology 维护 |

## 与参考方案的修正

Ready DAG 只是候选集，不能自动决定最大并发：共享资源/接口/文件可能要求串行或先完成合同票。PR 不是本地票完成的前提；当前没有外部发布授权时仍可完成本地集成、评审和交接。Retro 放在有证据的工程收尾或异常之后，不等用户产品认可，也不自动修改所有后续规则。主 Agent 单写管理状态，worker 仅交付代码/测试/commit 和证据。
