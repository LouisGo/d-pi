# d-pi 工作约定

## 当前工作入口

从固定[项目总看板](docs/status.md)找到当前范围、所属规格和任务，再按本页路由读取相关合同。授权、工程完成、交付试用与用户认可由所属 `spec.md` 维护；任务状态在所属票，看板只生成聚合，交接是特定构建的快照。

历史切片的授权或限制只描述当时范围，不能覆盖后续用户明确授权；计划、提议、工程通过和用户未回复都不构成授权或认可。发现重要待决时只暂停依赖部分，不据此阻塞独立工程工作。状态读取、更新与交接规则见[任务约定](docs/agents/issue-tracker.md)。

## 决定连续性

- 产品设计、选型或实现前，查[决定登记](docs/decisions.md)、[首版方案](docs/product/first-release.md)及相关需求/ADR，识别受影响 ID 与状态；其他任务只读相关材料。已读且未变化的内容不重复加载。
- 已确认决定与沿用基线继续有效。改变既定方向、数据/权限、重大范围或无法确定的概念冲突时，列出旧决定、证据、替代方案和影响，与用户对齐；仅暂停依赖部分。常规可逆工程选择自主完成。
- 决定变更保留日期、依据和取代关系，同步登记与规格；不得事后改规格迁就实现。文档、代码与观测不符时分别说明要求、实现事实和证据缺口。
- 近期切片开始时简述交付结果、范围、验收及重要待决；补规格、拆票、内部接口由 Agent 完成。每段可操作体验及时交付试用。状态与参与细则单源见[任务约定](docs/agents/issue-tracker.md#spec-对齐与跨会话交接)。

## 稳定边界

- OMP 拥有执行、工具和原生历史；Main 拥有桌面生命周期与 App 持久化，SessionHost 管连接/关联/镜像，Renderer 管交互。保留事务原子性、恢复顺序和真实身份边界，见[基础契约](docs/architecture/foundation-contracts.md)。
- unknown 提交不自动重发；缺执行全周期单写证据，恢复继续只读。执行不可用与内容可读分别表达，不删除数据库、伪造 ready 或新建替代会话掩盖恢复失败。
- 业务生命周期独立于 React；Zustand 管展示状态，TanStack Query 管只读异步查询，不形成两份可独立双写的事实。发送类副作用沿用协调器/收据合同，不交给查询重试。职责与写法见下方合同和 skill。
- D-21/D-22 从功能开始落实：跨实际经过的应用边界传播同一 `traceId`，记录阶段与真实身份，保留类型化原因及处理归属；根因未证实保留 unknown。诊断轻量、异步、有界，默认不记秘密或业务全文，不重建 OMP 日志。
- 最终目标是基本承接适合 GUI 的 OMP TUI 能力，逐功能交付；全集和完整组件基础不是可用版本前置。G1/M1/M2/M3 与当前授权分开，验证通过不替代产品决定。
- macOS 优先，其他平台支持未承诺；拟采用平台独占的必需能力时，说明原因、影响及替代方案并由用户决定。首版新增认证仅 OpenAI 账户（`openai-codex`）与 DeepSeek API key，已有其他可用配置仍复用。
- 项目执行信任与 App 文件访问分开，不冒称工具沙箱。只翻译 d-pi 自有文案，Main/Renderer 共用解析语言，OMP/SessionHost 不格式化原生或用户内容。
- 已定技术路线由 D-17、D-30–D-38 及对应合同维护：Biome、Base UI、自有 Icon Layer、最小 Tiptap、SQLite、ts-pattern、Zod v4、Zustand 与 Query、应用导航的 TanStack Router；不引入 XState。GUI 共享 token 与全局主题/密度，设计 lint 不得关闭来消除违规。
- `docs/archive/pre-reset/` 只保留历史证据，来源与取回见[归档说明](docs/archive/pre-reset/README.md)。不改写原始证据，不把旧命令、源码或候选当当前执行指令；独立实验也不是生产基础设施。

## 常用命令与验证

环境准备、SDK 资源与启动顺序见[README](README.md#环境准备与启动)。快速本地检查为 `pnpm check:fast`（显式安装的提交 hook 调用），完整检查为 `pnpm check`、`pnpm build`；边界任务按需用 `pnpm check:architecture`、`pnpm test:architecture`、`pnpm report:structure`。

功能与缺陷遵循 TDD：目标缺口先失败测试，再最小实现；既有正确行为补测不伪造红灯。优先固定官方源码、文档和已有证据，关键未知才做最小实验；自动化证明常规行为，Computer use 仅补必要原生/视觉证据或响应用户明确要求。按风险完成必要检查，足够即交付，不逐票重跑无关矩阵。详细规则见[无头功能合同](docs/architecture/headless-features.md)。

## 按任务读取

| 任务 | 入口 |
| --- | --- |
| 功能规划、拆票、模块实现或架构评审 | [d-pi-headless-features](.agents/skills/d-pi-headless-features/SKILL.md)、[无头功能合同](docs/architecture/headless-features.md)、相关基础契约节；普通文档/skill 审计、纯文字或纯样式不触发 |
| 模块与跨模块接入 | [模块地图](docs/architecture/modules/README.md)的目标模块及直接依赖，跨模块再读[交接图](docs/architecture/modules/flows.md) |
| 领域归属、目录迁移、公开面或门禁 | [d-pi-architecture](.agents/skills/d-pi-architecture/SKILL.md)、`architecture/modules.json`、模块 `AGENTS.md` 与相关模块页；机器清单是单源 |
| 应用 TypeScript 与类型/数据边界 | [d-pi-typescript](.agents/skills/d-pi-typescript/SKILL.md)、[TypeScript 合同](docs/architecture/typescript.md)；不用于文档审计或纯样式 |
| 展示状态、按需订阅与渲染边界、React 绑定、只读查询 | [d-pi-state-query](.agents/skills/d-pi-state-query/SKILL.md)、[无头功能合同 §4](docs/architecture/headless-features.md#4-对外合同与状态工具)及目标模块 |
| GUI 样式、组件、主题/密度与布局性能、外部 UI 源码 | [d-pi-design-system](.agents/skills/d-pi-design-system/SKILL.md)、[设计系统合同](docs/architecture/design-system.md)、[图标合同](docs/architecture/icon-system.md)；纯样式也适用 |
| 跨进程操作、错误、性能 | [诊断合同](docs/architecture/diagnostics.md)及相关模块 |
| 文案、语言和产品术语 | [国际化架构](docs/architecture/internationalization.md)、[产品术语](docs/product-terminology.md) |
| 领域术语、ADR、本地任务 | [领域约定](docs/agents/domain.md)、`CONTEXT.md`、相关 ADR；工作记录按[任务约定](docs/agents/issue-tracker.md)放 `.scratch/<feature>/` |
| 重新评估既有方向或复用旧实现 | [架构总览](docs/architecture/overview.md)、[历史证据索引](docs/prototype/handoff.md)、[库雷达](docs/prototype/frontend-library-radar.md)的相关部分，保留理由与来源 |
