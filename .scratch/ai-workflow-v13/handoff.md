# 工作流交接

日期：2026-10-06。实现分支 `codex/ai-workflow-v13`，基点 `8cb39fc`。固定研究：[Matt v1.3.1](https://github.com/mattpocock/skills/releases/tag/v1.3.1)；原始参考已完整读取，适配依据见 [research](research.md)。

## 现在如何流动

```text
用户目标 / 当前授权
  → spec 当前切片 → leaf tickets / Blocked by / hold
  → plan:slice 的全部 ready 候选 → 判断写集与合同
  → 独立 worktree 实现 → 主 Agent 单写状态、串行集成
  → 现有机器检查 → 独立 Spec / Standards review → 修复复核
  → 本地交接或已授权 PR → 候选 / 试用 / 认可分别记录
  → 有证据的 retro 候选 → 用户选择或现有明确授权内回流
```

日常直接说“开始当前已授权切片”，或提供 spec/票路径；Agent 负责补最近 leaf/依赖、计划、归属和验证，不要求用户手工调度每一张票。单票低风险工作可轻量推进；能力/额度不足时同一图串行执行。未阻塞不等于已授权，Git 无冲突不等于语义一致，worker 完成不等于已集成，merge 不等于用户认可。

多票计划例和命令契约见 [任务约定](../../docs/agents/issue-tracker.md#授权切片与-ready-frontier)。本次命令：

```sh
pnpm plan:slice -- .scratch/ai-workflow-v13/spec.md --slice workflow-v13
```

它只输出结构候选和不可执行原因；不创建 Agent、不改状态或执行代码。用户说“review 这个范围”“准备 PR”“复盘这个会话”时，根 AGENTS 会路由相应 skill；外部动作继续使用已有授权，没有授权时仍完成本地可审查结果。

## 入口与职责变化

```text
升级前
CONTEXT.md                         领域定义
.agents/skills/                    既有功能/类型/状态/架构/设计 skills
scripts/tasks/{task-records,project-status}.mjs   任务解析与聚合

升级后
GLOSSARY.md                        原样迁移的领域定义
.agents/skills/
  d-pi-implement-slice/             授权 leaf DAG、隔离与集成
  d-pi-code-review/                 真实差异、Spec/Standards 两轴
  d-pi-pr/                          行为、证据、风险与外部状态
  d-pi-retro/                       原始证据、最小环境回流
  ...                              既有工程 skills 继续负责实现
scripts/tasks/slice-plan.mjs        只读选票/依赖候选、计划校验与来源
.github/pull_request_template.md   三段式 PR 决策包
```

状态单源仍是 spec 的授权/工程/试用/认可和票的 Status/Blocked by，模块单源仍是 architecture/modules.json；没有引入通用标准文档、第二个 tracker、运行时队列或全局 skills 依赖。

## 工程证据与交付范围

完整 `pnpm check` / `pnpm build`、最终相关回归及快速门禁已通过，详见 [validation](validation.md)。两名独立 reviewer 在初稿发现同一个 P2，`748a9b5` 修复后各自复现通过，最终两轴无剩余高价值发现，详见 [review](review.md)。本轮 applied / no-change 的回流见 [retro](retro.md)；可审查 body 见 [PR 草稿](pr.md)。

独立 forward test 在临时纯 Node 仓库完整跑通新入口：额度不足时串行执行同一 DAG，02a/03/04 完成且9/9通过；05 的已有 claimed、06 的 hold 和07范围外保持基线，准确以 partial 交接。随后两个真实 worker 从同一 `ba096ffc` 起点、独立目录/写集交付；主 Agent 依次合入，再从最新集成点完成 fan-in，8/8通过、三票 resolved。具体微小源码写入时间自然错开；主 Agent 两目录目标测试进程确实重叠，各3/3通过，证据没有将二者混为一谈。

主 Agent 独立重跑9/9与8/8，核对最终 frontier、clean、保护票无 diff 和两叶 commit 均已进入集成历史。五个 worker checkout 在确认 clean/已集成后清理，分支和提交保留；两个集成 checkout 保留。固定来源与文件 SHA-256 见 [证据清单](evidence/snapshot-manifest.json)，原始 [forward review](evidence/forward/review.md) / [命令记录](evidence/forward/evidence/executor-command-record.md) 和 [并行集成记录](evidence/parallel-mini/evidence/orchestrator.md)已保存到仓库。首次 npm 默认读取个人配置的执行偏差及修正也保留，未借此增加全项目规则。03 已关闭。

本次只升级开发工作流；App、OMP 资源、lockfile 与 M2 试用/认可未改变。当前没有远端 PR/CI 或 main 合并声明，提交 hook 实测未安装，当前提交用显式 check:fast 验证。全局定制 skills 保留；历史证据未因改名重写，现行链接已同步。
