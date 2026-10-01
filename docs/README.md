# 文档导航

按任务找当前依据。授权、工程验证和用户试用在各切片 `spec.md` 维护，`handoff.md` 是对应构建的交付快照；本页只导航，不复制进度。文档路径或更新时间不能代替决定状态与取代关系。

## 日常入口

| 要回答的问题 | 材料与职责 |
| --- | --- |
| 当前允许做什么、下一步是什么 | [项目总看板](status.md)指向所属 spec；[根 AGENTS](../AGENTS.md)维护稳定规则与任务路由；先读其推进与交接，再按实际依赖查任务 |
| 产品目标、阶段和用户已经决定什么 | [决定登记](decisions.md)、[产品需求](product/requirements.md)、[首版方案](product/first-release.md)及相关 [ADR](adr/)；候选和历史默认值不能代替用户决定 |
| 业务和资源由谁拥有、实现在哪里 | [架构总览](architecture/overview.md)、[模块地图](architecture/modules/README.md)与目标模块页；跨模块再读[交接图](architecture/modules/flows.md) |
| 提交、恢复、权限、输出和阶段门槛 | [基础契约](architecture/foundation-contracts.md)；功能职责、生命周期及验证看[无头功能合同](architecture/headless-features.md) |
| 进程错误、trace 与故障阅读 | [诊断合同](architecture/diagnostics.md)及对应模块的实际接入路径 |
| TypeScript、状态与查询的写法 | [TypeScript 合同](architecture/typescript.md)、[d-pi-typescript](../.agents/skills/d-pi-typescript/SKILL.md)、[d-pi-state-query](../.agents/skills/d-pi-state-query/SKILL.md)；合同维护政策，skill 维护有条件的写法 |
| GUI 组件、样式、图标与外部源码 | [设计系统合同](architecture/design-system.md)、[固定源码依据](architecture/design-system-references.md)、[图标合同](architecture/icon-system.md)及[d-pi-design-system](../.agents/skills/d-pi-design-system/SKILL.md) |
| 文案、语言和概念 | [国际化架构](architecture/internationalization.md)、[产品术语](product-terminology.md)、[CONTEXT](../CONTEXT.md)；[领域约定](agents/domain.md)约束术语和 ADR |
| 目录、公开面、允许依赖与门禁 | [源码边界](architecture/source-layout.md)、[d-pi-architecture](../.agents/skills/d-pi-architecture/SKILL.md)；`architecture/modules.json` 是机器单源，实际依赖与允许依赖分开 |
| 功能拆票、状态更新和交付 | [任务约定](agents/issue-tracker.md)、[d-pi-headless-features](../.agents/skills/d-pi-headless-features/SKILL.md)；切片记录放 `.scratch/<feature>/` |

日常只补目标模块、直接依赖和受影响合同，不先重建项目时间线。代码、观测与文档不符时分别报告实现事实、既定要求和证据缺口，不按当前行为自动改规格。

## 工作记录

当前工作从固定[项目总看板](status.md)进入[M2 首版规格](../.scratch/m2-first-release/spec.md)。[OMP 18.4.5 升级与边界加固](../.scratch/runtime-hardening-omp1845/spec.md)是 2026-10-01 用户已认可、待新会话实施的方案，尚未替换运行资源。[基建收口](../.scratch/infrastructure-closure/spec.md)与[重写准备与执行](../.scratch/rewrite-preparation/spec.md)保留原交付范围与试用状态，对应重写构建见[重写交接](../.scratch/rewrite-preparation/handoff.md)；[M1 开发准备](../.scratch/development-foundation/spec.md)保存阶段和跨模块责任。各切片范围、授权、工程状态、试用及继续边界直接读取所属规格：

- [S1 项目与草稿](../.scratch/m1-s1-project-draft/spec.md)、[S1 巩固](../.scratch/m1-s1-project-draft/hardening.md)、[S2 提交与阅读](../.scratch/m1-s2-submit-read/spec.md)。
- [S3 控制与恢复](../.scratch/m1-s3-control-recovery/spec.md)、[i18n 基础](../.scratch/i18n-foundation/spec.md)、[S4 文件与差异](../.scratch/m1-s4-files-diff/spec.md)、[S5 组合验收](../.scratch/m1-s5-combination-acceptance/spec.md)。
- [领域目录治理](../.scratch/domain-directory-governance/spec.md)、[状态/查询对齐](../.scratch/state-query-alignment/spec.md)。

每份 spec 链接对应任务和交接，索引不另维护已完成表。旧规格的“本轮不启动后续阶段”保留当时语境，后续用户明确授权以当前切片为准。

## 工程维护

[日常检查、hook 与 CI](engineering/checks.md)维护工程入口；[OMP 维护](engineering/omp-maintenance.md)区分开发 skills 与运行资源，说明回放、真实固定版本检查和升级复核；[Electron 安全](engineering/desktop-security.md)列现有边界与验证；[本地交付](engineering/local-delivery.md)区分已有版本、未实施的签名/更新和待权利人决定的许可证。后续功能按实际影响复核，不重复全套历史矩阵。

## 需要证据或重评方向时

[历史交接索引](prototype/handoff.md)区分机器实验、真实 GUI 与适用边界；[Runtime](validation/runtime-feasibility.md)、[Settings](validation/settings-feasibility.md)、[随包验证](validation/packaged-runtime-evidence.md)和[历史 GUI](archive/stage1-evidence.md)各自保留固定版本事实。[归档说明](archive/pre-reset/README.md)记录来源、哈希与被裁文件的取回方式；归档不作为当前构建或执行指令。

比较候选时查[库雷达](prototype/frontend-library-radar.md)、[技术审议](architecture/technology-selection-review.md)、[增量评估](../.scratch/product-requirements/technical-evaluation.md)或[Composer 研究](../.scratch/product-requirements/composer-research.md)相关部分，并回查决定状态。普通实现不因此重新开选型。

只有全局文档审计才按“原始证据 → 领域/所有权 → 行为合同 → 需求/候选 → 决定取代关系 → AI 入口/交接”逐层核对；过去审计范围见[2026-09-26 记录](../.scratch/documentation-audit/spec.md)。旧原型的 M1 与当前基础契约的 M1 含义不同，不能互换；历史临时路径与命令保留原貌，复用时核实当前版本。
