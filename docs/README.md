# 文档导航与事实来源

更新：2026-09-26。当前产品尚未实现；已有历史原型和 Runtime 验证不能冒充当前产品验收。先按任务选择材料，只有全局审计才需要通读下列各层。路径里的 `prototype`、`draft` 或 `.scratch` 不决定文档是否有效。

## 各类文档负责什么

| 文档 | 职责与使用边界 |
| --- | --- |
| [AGENTS.md](../AGENTS.md) | 仓库执行约定、授权与资料路由；不另立产品规格 |
| [决定登记](decisions.md)与[相关 ADR](adr/) | 已确认 `D-*`、沿用 `B-*`、提议 `P-*` 及取代关系；提议未确认前不能覆盖现行方向 |
| [产品需求](../.scratch/product-requirements/spec.md)与[基础方案](../.scratch/product-requirements/foundation-plan.md) | 用户目标、范围和交付阶段；未交付不等于被删除 |
| [基础契约](architecture/foundation-contracts.md)、[无头功能](architecture/headless-features.md)、[诊断](architecture/diagnostics.md)、[图标](architecture/icon-system.md) | 各自负责行为与工程边界；细节集中维护，不在每个入口复制 |
| [TypeScript 合同](architecture/typescript.md) | D-35 的应用写法与验收标准：严格类型、ts-pattern、Zod v4；库版本与实际集成在接入时验证 |
| [CONTEXT.md](../CONTEXT.md) | 领域概念和统一用语；技术字段、传输与持久化细节以合同为准 |
| [验证记录](validation/)、[历史 GUI 证据](archive/stage1-evidence.md)及机器结果 | 支持特定版本、平台和场景的事实；验证通过不决定产品范围，也不证明未来集成已通过 |
| [技术审议](architecture/technology-selection-review.md)、[增量评估](../.scratch/product-requirements/technical-evaluation.md)、[Composer 研究](../.scratch/product-requirements/composer-research.md) | 候选、比较和待验证问题；建议按决定登记辨别状态 |
| [无头功能 skill](../.agents/skills/d-pi-headless-features/SKILL.md)、[TypeScript skill](../.agents/skills/d-pi-typescript/SKILL.md)与[任务约定](agents/issue-tracker.md) | 在当前授权范围内组织工作，按需引用合同；不自行扩大范围或批准候选 |
| [不可变归档](archive/pre-reset/README.md) | 来源提交、原文、代码和实验；只作历史依据，不作为当前构建或执行指令 |

文档冲突先查决定的日期、状态与明确取代关系，不按文件新旧、目录名或措辞强弱猜测。代码/观测与文档不符时，应分别报告实现事实、既定要求和证据缺口；不能以当前行为自动改写规格。

## 全局审计：从底层到顶层

| 顺序 | 阅读范围 | 核对问题 |
| --- | --- | --- |
| 1. 原始事实与历史 | [归档清单](archive/pre-reset/README.md)、[Runtime](validation/runtime-feasibility.md)、[Settings](validation/settings-feasibility.md)、[随包验证](validation/packaged-runtime-evidence.md)、[独立探针](../.scratch/omp-runtime-feasibility/spec.md)、[历史 GUI](archive/stage1-evidence.md) | 实际测了什么；版本、平台、固定模型/真实模型和未覆盖范围是否清楚 |
| 2. 领域与所有权 | [CONTEXT](../CONTEXT.md)、[进程所有权 ADR](adr/0001-omp-session-client.md)、[配置 ADR](adr/0002-share-native-omp-config.md) | 谁拥有执行、历史、状态与资源；术语是否一致 |
| 3. 行为与架构合同 | 基础契约、诊断、无头功能、图标、TypeScript 合同及[整理后的架构](prototype/v1-architecture-draft.md) | 接受/失败/恢复、权限、生命周期和验收条件是否可执行 |
| 4. 需求、阶段与候选 | 产品需求、基础方案、[审查关闭记录](../.scratch/product-requirements/preflight-review.md)、[库雷达](prototype/frontend-library-radar.md)及各技术研究 | 最终目标与 G1/M1/M2/M3 是否一致；候选是否越权成为默认选型 |
| 5. 决定与变更关系 | 决定登记与[清理记录](../.scratch/workspace-reset/spec.md) | 已确认、沿用、提议、被取代是否对应，旧理由是否保留 |
| 6. AI 入口与交接 | 根 README、AGENTS、项目 skill、[领域约定](agents/domain.md)、任务约定、[交接索引](prototype/handoff.md) | 新任务能否找到当前依据，避免重复调查、重复确认和遗漏约束 |

本次覆盖和核验结果见 [2026-09-26 文档审计](../.scratch/documentation-audit/spec.md)。

## 日常任务的最短路径

1. 明确当前请求是调查、文档、验证、实现还是评审。产品设计/选型/实现读取决定登记、基础方案与相关需求/ADR；文字修正等小任务只读相关材料。
2. 按受影响场景查对应合同和已有证据。功能任务需要哪一项 G1 就验证哪一项，不等待全产品 G1；证据版本或适用条件变化时才补验证。
3. 在当前任务记录结果、实际验证和剩余缺口。已确认方向不重开选型；改变决定时同步登记、规格与取代记录，不把普通实现细节升级成用户问卷。

旧 `.scratch/omp-gui-m1` / 归档中的 **M1** 指历史原型阶段；当前 **M1** 指基础契约定义的内部闭环，两者不能互换。归档中失效的临时路径或旧命令保留原貌；复用时核实当前资源与版本。当前 `docs/prototype/` 三份文档是整理后的有效交接、架构与候选索引，不因目录名而失效。
