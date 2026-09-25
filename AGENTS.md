## Decision continuity — mandatory

- 本仓库当前处于方案收敛阶段。用户 2026-09-25 明确要求前期方案清楚后再动手：本轮仅调查与文档，不启动产品实现、安装依赖或编写交互原型。后续按用户明确阶段授权推进，不将本文件当成永久禁止开发。
- 开始产品设计、技术选型或实现前，必须读取 `docs/decisions.md`、`.scratch/product-requirements/foundation-plan.md` 以及涉及的需求/ADR；在任务说明中识别受影响的决定 ID 和状态。
- 遵守已确认决定与沿用基线。`proposed`/提议不是用户批准；历史实现、上游默认值和助手新建议不能覆盖用户决定。不能因为换了 AI、删过代码或文档名称含 draft/prototype 就从零重选。
- 改变用户已定方向、重大范围或无法确定的概念冲突前，列出旧决定、证据、替代方案和影响，与用户对齐后再更新；其余独立调查可继续。常规可逆实现细节无需重复询问。
- 决定变更必须保留日期、依据和取代关系，同步登记与规格；禁止静默覆盖、删除理由或事后改规格迁就实现。新用户明确指令优先，但也要记录。
- 整理不等于删除。`docs/archive/pre-reset/` 保持原样；候选和历史实验要保留来源与适用范围。验证通过不等于产品批准，文档建议不等于实现已验收。

## Agent skills

### Feature architecture

功能规划、拆票、模块实现及架构评审使用仓库 skill [d-pi-headless-features](.agents/skills/d-pi-headless-features/SKILL.md)。遵守 D-28–D-30 与 [无头功能合同](docs/architecture/headless-features.md)：按功能先验证、再无头逻辑、最后正式 GUI；不引入 XState；业务生命周期独立于 React 挂载。纯文字或纯样式修正不额外触发整套架构流程。

### Issue tracker

Issues and specs are tracked as local Markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context layout: root `CONTEXT.md` and `docs/adr/`. See `docs/agents/domain.md`.

### Diagnostics from the first feature

- 遵守 D-21、D-22 与 `docs/architecture/diagnostics.md`：每层/每功能从开始就具备结构化日志、关联上下文、基础故障与耗时监控；不得作为末期补项。
- 保持轻量、异步、有界、日常无感；日志不能阻塞业务或无限增长，关键链路须验证性能开销和失败路径。默认不记录秘密或原始业务全文。
- 不把诊断要求扩为完整观测平台，不重建 OMP Runtime 日志；专用日志 UI 可后续开发，不能擅自变成首版前置条件。已落盘日志必须可独立读取、筛选与排查。

- 应用跨进程操作必须传播同一 traceId 并保留阶段/请求/实例身份；不能以“轻量”为由省略关联或只写分散文本。遵守类型化错误与处理归属，区分发现层、报告来源、根因及恢复责任；OMP 报错不自动判为 OMP bug，未证实归因保留 unknown。

### Platform decisions

- 工程工具：使用 Biome 负责应用自有代码的 lint 与格式化，不建立 ESLint + Prettier 工具链。仅在接入 `@shadcn/lint` 时引入 Oxlint，并限定为对应设计系统规则；使用 shadcn/ui 本身不要求 Oxlint。

- 优先 macOS 开发与验收，尚未承诺 Windows、Linux 的支持范围与交付时间。
- 后续需求讨论、技术选型和开发中，拟采用 macOS 独占功能或必需能力时，必须先向用户汇报独占原因、对其他平台的影响及可行替代方案，由用户决定是否接受。决策前暂停依赖该选择的部分，其他独立工作可继续。
- Electron 提供跨平台基础，不保证原生模块、系统 API、外部工具或平台行为自动兼容；按相关能力核实平台约束，不将未经验证的平台标为已支持。

### Current stage

Product requirements are being refined in `.scratch/product-requirements/spec.md`. Target essentially full coverage of OMP TUI content and interactions with refined GUI presentation. Develop and deliver incrementally, adding capabilities one by one; full coverage, an exhaustive inventory, and a complete component foundation are not prerequisites for a usable release. Run product tests and refine presentation within each stage, without silently dropping capabilities from the final target. Build reusable technical and domain-facing UI components around verified OMP contracts as concrete features require them, and track interface gaps separately from product scope.

Runtime feasibility validation is complete. Read `docs/prototype/handoff.md`, `docs/prototype/frontend-library-radar.md`, and `docs/prototype/v1-architecture-draft.md` before revisiting technical choices. These reconcile prior decisions and current requirements; do not reset established choices simply because implementation was removed. Preserve candidate rationale and verification evidence when organizing files. `docs/archive/pre-reset/` is immutable historical source and evidence, not current instructions or an active build. If old and new concepts conflict and the intended resolution is unclear, ask the user before choosing. Scripts under `.scratch/omp-runtime-feasibility/` are standalone experiments, not production infrastructure.


### Development readiness (2026-09-25)

- 七项答复已收敛为 D-23–D-27 与 `docs/architecture/foundation-contracts.md`。开发任务先读取该合同，按 G1 / M1 / M2 / M3 区分接口验证、内部闭环、首版验收和后续能力；不把“设计就绪”写成接口/性能已验收。本次文档任务不启动实现，后续明确开发指令可直接按此推进，不重开泛化选型问卷。
- 首版新增认证只做 OpenAI 账户登录（OMP openai-codex）和 DeepSeek API key，已有其他可用配置继续复用。权限信任不是工具沙箱；不知道的提交结果不能自动重发。数值预算为工程目标，不能冒充用户逐项指定或测量结果。

### GUI icons

遵守 D-31 与[图标方案](docs/architecture/icon-system.md)：Hugeicons 免费 Stroke Rounded 经自有 Icon Layer 接入，取代 Lucide；业务视图不直引供应商或私有 SVG。图标/React 类型不进入无头功能与 IPC 合同；外部 UI 源码接入时同步迁移图标。按 GUI 切片实现与视觉/裁剪验收，不提前铺全图库；纯图标/样式任务也需遵守此合同。
