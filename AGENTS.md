## 阶段与授权

截至 2026-09-28，S1 工程交付及巩固已完成、仍待用户试用反馈；状态以 `.scratch/m1-s1-project-draft/spec.md` 及交接为准。用户已明确选择保留官方 OMP，D-24 与 S2 规格已同步，to-tickets 已完成（6 张票；01–06 工程交付已完成，0.1.0-s2.0 待用户试用；边界和证据以 S2 spec/交接为准）。用户随后要求“开始推进开发”，并明确“先将文档 commit，再开发”：先本地提交规格与任务基线，再完成 S2 必要实现、依赖、验证及修复；不推送。S2 授权、技术门槛与继续边界以 [S2 spec](.scratch/m1-s2-submit-read/spec.md) 为准，不重复询问阶段授权。历史 S1 文档中的“不启动 S2”只描述当时范围；S2 也不连带授权 S3/M2 或自用迁入。后续按用户明确任务范围推进，不把历史“本轮只做文档”变成永久禁令。

2026-09-28 后续用户已正式开启 S3：核对固定官方 OMP 的原生队列控制与恢复单写门槛，完善规格、拆票并按 TDD 实施，验证后交付试用及本地 commit，不推送。当前范围、待决产品取舍与工程状态以 [S3 spec](.scratch/m1-s3-control-recovery/spec.md) 为准；不扩展 S4/M2。此前 S2 文档中的“不启动 S3”只描述历史授权。用户随后确认官方 SDK 薄宿主路线；S3 `0.1.0-s3.0` 工程已交付待试用，见 [S3 交接](.scratch/m1-s3-control-recovery/handoff.md)。官方 SDK 未修改、unknown 不自动重发、缺单写证据只读；不把试用交付视为用户认可。

2026-09-29 用户明确要求在 S4 前落地引用对话的完整 i18n 方案，先盘点写死语言，再按当前流程与 TDD 开发。D-36 及[国际化架构](docs/architecture/internationalization.md)为基准；当前 `0.1.0-i18n.0` 源码工程完成、待用户试用，见[切片规格](.scratch/i18n-foundation/spec.md)与[交接](.scratch/i18n-foundation/handoff.md)。不因本轮授权自动实施 S4/M2，S3 用户试用和恢复单写门槛仍保持原状态。

2026-09-29 用户随后正式开启 S4：只读项目文件、准确文件选区附入输入、来源与覆盖明确的 Git 当前差异及原生工具修改证据；非 Git、缺失和并发变化如实呈现，工作区变化不归为 Agent 修改。范围及工程/试用状态以 [S4 spec](.scratch/m1-s4-files-diff/spec.md) 和[交接](.scratch/m1-s4-files-diff/handoff.md)为准。`0.1.0-s4.0` 源码、自动化、开发态与 macOS 包内 GUI 检查已完成，工程交付用户试用；原生工具结果缺真实样本，用户体验未认可，不据此开启 S5/M2。S3 试用及冷恢复只读限制继续有效。

2026-09-29 用户正式开启领域目录治理第二版：P0 最小门禁、P1 文件→选区→输入完整切片完成后，继续完成 P2–P4；遵循 TDD、必要回归/构建/受影响 GUI 验证，分波本地 commit，不 push、不扩展 S5/M2。当前源码按 `src/app`、`src/modules`、`src/platform`、`src/shared` 和 `runtime` 归属；机器门禁见 `architecture/modules.json`，入口为 `pnpm check:architecture`、`pnpm test:architecture`、`pnpm report:structure`。迁移不得改变行为、事务原子性、恢复顺序或 OMP 所有权；公开入口、环境依赖和到期例外必须同步规则与地图，行数只作审查提示。**P0–P4 及独立 review 的补修波次均已完成工程交付并分波本地提交**，用户试用仍待进行，见[治理交接](.scratch/domain-directory-governance/handoff.md)。

2026-09-29 用户指出重构后 Zustand 与 `@tanstack/react-query` 只存在于文档和归档、没有实现，明确"不能接受不在这两个库的基础上做全局状态管理，包括异步状态管理"，并选择先落决定与规格、再按 TDD 迁移且保留现有外部行为。D-37 据此把两库锁为基础依赖，取代 09-28 加固轮次追加的"不为名录补齐状态库"规则（该句未经决定变更流程）。四个展示状态模型已迁移到 Zustand vanilla store、文件与 Git 读路径已接入 Query（`networkMode: 'always'`、显式刷新、`unavailable` 非重试错误）；`pnpm check` 与 `pnpm build` 通过，真实 GUI 核对因会话环境 `ELECTRON_RUN_AS_NODE=1` 无法执行，试用未交付。范围与状态以 [对齐切片](.scratch/state-query-alignment/spec.md)与[交接](.scratch/state-query-alignment/handoff.md)为准；历史模型/历史分页等异步查询仍按功能接入，不扩展 S5/M2。

2026-09-30 用户要求清除旧的不适合内容以避免后续歧义，询问归档是否还有必要存在。核对结果：归档仍被 13 个文件引用，其中 `docs/prototype/handoff.md`（AGENTS.md 规定的"重新评估技术方向"入口）直接链接其研究快照与机器结果，`docs/archive/stage1-evidence.md` 是 M1"停止不等于清空队列"需求的唯一原始实测来源，且归档的 OMP 文档快照对应当前锁定的 18.3.0，documentation-audit 的 A1–A3 三条现行合同规则均由归档证据补回。故不做整体删除，改为精准瘦身：移除 23 个无任何文档引用的旧应用源码、与当前真实配置同名的顶层构建文件及不可运行的原型脚本，保留 26 个证据文件；裁剪前已按 manifest 逐文件核验 49/49 哈希与来源提交 `6fab3ef` 一致。归档边界与取回方式见[决定连续性](#决定连续性)及[归档说明](docs/archive/pre-reset/README.md)。

## 决定连续性

- 产品设计、技术选型或实现前，读取 [决定登记](docs/decisions.md)、[基础方案](.scratch/product-requirements/foundation-plan.md)及相关需求/ADR；识别受影响决定的 ID 与状态。其他任务只读相关材料，已读且未变化的内容不重复加载。
- 已确认决定与沿用基线继续有效。提议、上游默认值、历史实现、模型偏好及验证通过都不能替代用户决定；设计确定也不等于接口或性能已验收。文档的职责与入口见 [文档导航](docs/README.md)。
- 改变用户已定方向、重大范围或无法确定的概念冲突前，列出旧决定、证据、替代方案和影响，与用户对齐；仅暂停依赖该决定的部分。常规可逆细节自行处理。
- 决定变更保留日期、依据与取代关系，同步登记和规格；新用户明确指令优先，但仍须记录。不得事后改规格迁就实现。
- `docs/archive/pre-reset/` 保留证据、不保留脚手架：2026-09-30 按用户决定精准瘦身后，保留访谈决策、研究快照与机器结果；旧应用源码、与当前真实配置同名的顶层构建文件及不可运行的原型脚本已移出，哈希与取回方式见其 manifest 的 `pruned` 段。归档只作历史依据，不是当前实现、依赖选择或执行指令，也不能冒充当前产品验收；原始结论与取代关系仍须从归档追溯，不得把保留的原文件改写为新决定。

## Spec、任务与用户体验交接

- 每个近期切片开始前，向用户简述交付结果、不包含的范围、验收方式和未决的重要产品问题。补 Spec、拆 Ticket、内部接口及常规工程选择由 Agent 负责，不要求用户逐文档、逐票审批；已有明确决定不重复询问。
- Spec 中新出现的重要产品判断必须先与用户对齐，即使它尚未与旧决定冲突。包括会实质改变用户操作、默认自动行为、数据保留/恢复、权限或成本、交付范围的选择。先查已有决定和证据，提出具体方案、推荐及影响；待答时只暂停依赖该选择的工作。不得将助手建议、用户未回复或技术可行自动写为用户已确认。
- 已授权的实施可持续完成验证、无头功能和 GUI；每形成一段完整可操作体验，及时交给用户试用，提供启动/操作步骤、预期结果和已知限制，不累积多个体验切片后才统一交付。自动检查或 Agent 操作 GUI 不替代用户试用；待试用时可继续授权范围内不依赖反馈的工作，不默认体验已获认可。
- 新窗口、新机器或新 Agent 接手时，先读取当前切片 spec/任务中的授权范围、产品待决项、工程验证及用户试用状态，再推进；“计划中存在 S1–S5”不等于已授权全部实现，“继续”也不自动解除已记录的待决问题。
- 上述状态随工作保存在仓库任务记录，细则见[本地任务约定](docs/agents/issue-tracker.md#spec-对齐与跨会话交接)。用户新的明确指令可调整参与和推进方式，记录其范围与依据；不把默认交付节奏变成逐层重复审批。

## 验证投入（2026-09-27 用户调整）

- 默认先查 OMP 官方文档、对应固定版本源码及已有项目证据；能回答当前问题就直接实现，不为成熟能力另搭探针、单开验证票或重复跑实验。官方能力说明不冒充本应用集成验收。
- 仅对资料无法回答、且会影响架构/产品承诺、数据完整性、权限/不可逆副作用或特殊运行环境的关键未知，做最小前置实验。先明确未知、它影响的选择和停止条件；答案足够即进入实现，无关工作继续。
- 实现后按改动风险完成针对性检查和可操作体验交接；已有基线复用，只有受影响路径、新失败或明确疑点才复测。常规修复不重跑完整故障矩阵、打包矩阵或多轮性能 A/B；专项性能检查用于相关高风险改动、实际退化和里程碑组合验收。
- 无头功能与正式 GUI 的职责和交付顺序保留；“验证先行”表示先消除关键未知，不表示每个功能必须经过独立实验阶段。测试通过仍不替代用户体验认可，重要产品判断仍先对齐。细则单源见[无头功能合同](docs/architecture/headless-features.md)。

## TDD 与 Computer use（2026-09-28 用户调整）

- 功能与缺陷修复遵循 TDD：先写能暴露目标行为缺口的失败测试，再最小实现，绿灯后按需重构。既有正确行为补测可以直接通过，不伪造红灯或称为历史 TDD。
- 默认用 Vitest 等可重复自动化验证业务、故障及常规交互；不为数量、覆盖率或重述实现凑测试。Computer use 仅用于原生系统交互、视觉体验等自动化难以替代的少量检查，或用户明确要求；每次说明要补的具体证据，已被自动化证明的逻辑不再逐步手工重复。
- 不把真实 GUI 验收等同于必须 Computer use，也不取消必要 GUI/用户试用。详细测试分层与停止条件单源见[无头功能合同](docs/architecture/headless-features.md#tdd-与自动化优先2026-09-28)。

## 按任务读取

| 任务 | 相关入口 |
| --- | --- |
| 功能规划、拆票、模块实现或架构评审 | 使用 [d-pi-headless-features](.agents/skills/d-pi-headless-features/SKILL.md)，按需读取 [无头功能合同](docs/architecture/headless-features.md)与 [基础契约](docs/architecture/foundation-contracts.md)相关节；普通文档审计、skill 审计、纯文字或纯样式任务不触发该 skill |
| 模块归属、跨模块接入与近期开发 | 从[模块地图](docs/architecture/modules/README.md)读目标模块及直接依赖，跨模块再读[交接图](docs/architecture/modules/flows.md)；[M1 计划](.scratch/development-foundation/spec.md)记录 G1 缺口、切片与验收，不要求日常任务通读全部模块 |
| 领域归属、目录迁移与结构门禁 | 使用 [d-pi-architecture](.agents/skills/d-pi-architecture/SKILL.md)，读取 `architecture/modules.json`、模块 `AGENTS.md` 及相关模块页；迁移不改变行为、事务、恢复顺序或 OMP 所有权 |
| 应用 TypeScript 实现、重构、类型/数据边界设计或相关代码评审 | 使用 [d-pi-typescript](.agents/skills/d-pi-typescript/SKILL.md)，按需读取 [TypeScript 合同](docs/architecture/typescript.md)；文档审计和纯样式任务不触发 |
| 展示状态、store 订阅、React 绑定或只读异步查询的实现与评审 | 使用 [d-pi-state-query](.agents/skills/d-pi-state-query/SKILL.md)，按需读取[无头功能合同 §4](docs/architecture/headless-features.md)与目标模块页；新增 store、写查询 hook、给视图接线或评审这类改动时触发，不另立一套状态风格 |
| 本地需求与任务记录 | [issue 约定](docs/agents/issue-tracker.md)，文件放在 `.scratch/<feature>/` |
| 领域术语或架构决定 | [领域文档约定](docs/agents/domain.md)、根 `CONTEXT.md` 与相关 `docs/adr/` |
| 跨进程操作、错误或性能 | [诊断合同](docs/architecture/diagnostics.md)；D-21/D-22 从每个功能开始落实，不作为末期补项 |
| 产品界面文案、语言偏好及跨层展示消息 | [国际化架构](docs/architecture/internationalization.md)与[产品术语](docs/product-terminology.md)；只翻译 d-pi 自有文案，Main/Renderer 共用解析语言，SessionHost/OMP 不格式化 |
| GUI 样式、组件、主题或密度 | 使用 [d-pi-design-system](.agents/skills/d-pi-design-system/SKILL.md)，读取[设计系统合同](docs/architecture/design-system.md)及相关源码依据；纯样式任务也适用。S1 起接入 token 与 `@shadcn/lint` + Oxlint，遵守全局主题/密度和组件覆盖边界 |
| GUI 图标或外部 UI 源码接入 | [图标合同](docs/architecture/icon-system.md)；纯图标/样式任务也适用 |
| 重新评估已有技术方向或复用旧实现 | [交接](docs/prototype/handoff.md)、[架构](docs/prototype/v1-architecture-draft.md)、[库雷达](docs/prototype/frontend-library-radar.md)的相关部分；保留理由与证据，不从零重选 |

## 不得丢失的项目边界

- OMP TUI 基本全覆盖是最终目标，逐功能交付；全集清单与完整组件基础都不是可用版本的前置。G1 只约束对应功能尚未解决的关键风险，M1 是内部闭环，M2 才是首版验收，M3 为后续能力；以基础契约为准。
- D-28–D-30：先查证据，必要时做关键风险验证，再无头逻辑、正式 GUI；业务生命周期独立于 React，不引入 XState。真实 GUI 验收不能由无头测试代替。
- D-21/D-22：结构化日志、跨进程同一 `traceId` 与阶段/请求/实例身份、类型化错误及明确恢复归属；未证实根因保留 `unknown`。日志轻量、异步、有界，默认不记秘密或业务全文；不重建 OMP 日志，不把专用日志 UI 设为首版前置。
- D-23–D-25：首版新增认证仅 OpenAI 账户（OMP `openai-codex`）及 DeepSeek API key，已有其他可用配置仍复用；提交结果未知不能自动重发；项目执行信任与 App 文件访问分开，不能冒称工具沙箱。
- D-17：应用自有代码使用 Biome；S1 首个正式 GUI 必须接入 `@shadcn/lint` 与限定设计系统范围的 Oxlint，不建立 ESLint + Prettier 工具链。
- D-05：macOS 优先，Windows/Linux 的支持范围与时间未承诺。拟采用 macOS 独占的功能或必需能力时，先报告原因、其他平台影响及替代方案，由用户决定；Electron 跨平台不代表所有依赖已兼容。
- D-31：Hugeicons 免费 Stroke Rounded 经自有 Icon Layer 接入；业务视图不直引供应商或私有 SVG，图标/React 类型不进入无头功能或 IPC 合同。按 GUI 切片接入与验收，不预铺全图库。
- D-32–D-35：Base UI 为默认基础交互，Composer 采用最小 Tiptap，App 结构化存储采用 SQLite；ts-pattern 为应用业务分支默认范式，Zod v4 标准版负责数据边界。旧否定/待定结论已取代；Drizzle、Effect 等其他候选不连带批准。具体所有权与验收仍遵守相关合同。
- D-36/D-37：i18n 只翻译 d-pi 自有文案，Main 与 Renderer 共用解析语言，SessionHost/OMP 不格式化用户内容或原生事件；展示状态用 Zustand（`core` 不引入 React，vanilla store 与 React 绑定分离），只读异步查询用 TanStack Query，OMP 仍是执行与原生历史的事实所有者，发送类副作用不交给查询重试。
- `.scratch/omp-runtime-feasibility/` 是独立实验，不是生产基础设施。数值预算是工程目标，不能冒称用户逐项指定或实测达标。

- D-17/D-32 补充：视觉值集中 token 化；正常/compact 由单一全局入口选择密度映射，业务页面不得私建色板/尺寸体系或重绘共享组件。允许 Tailwind、CSS Modules 与受作用域约束的全局 CSS，优先成熟开源模式，按当前代码与可维护性选择或组合，不按场景预设固定技术分工。新组件必须沿用主题/密度合同；样式 lint 及真实切换验收通过才算完成，不能通过关闭规则消除违规。
