## 阶段与授权

本仓库仍处于方案收敛与开发准备阶段；截至 2026-09-26，Runtime 可行性已有限定范围证据，当前产品尚未开始实现。2026-09-25 的文档任务不授权产品实现、依赖安装或交互原型；后续用户明确要求开发时，按该任务范围推进，不把历史“本轮只做文档”变成永久禁令，也不重复索要已包含的阶段授权。

## 决定连续性

- 产品设计、技术选型或实现前，读取 [决定登记](docs/decisions.md)、[基础方案](.scratch/product-requirements/foundation-plan.md)及相关需求/ADR；识别受影响决定的 ID 与状态。其他任务只读相关材料，已读且未变化的内容不重复加载。
- 已确认决定与沿用基线继续有效。提议、上游默认值、历史实现、模型偏好及验证通过都不能替代用户决定；设计确定也不等于接口或性能已验收。文档的职责与入口见 [文档导航](docs/README.md)。
- 改变用户已定方向、重大范围或无法确定的概念冲突前，列出旧决定、证据、替代方案和影响，与用户对齐；仅暂停依赖该决定的部分。常规可逆细节自行处理。
- 决定变更保留日期、依据与取代关系，同步登记和规格；新用户明确指令优先，但仍须记录。不得事后改规格迁就实现。
- `docs/archive/pre-reset/` 保持原样；整理不等于删除。候选与实验保留来源、版本和适用范围，历史证据不能冒充当前产品验收。

## 按任务读取

| 任务 | 相关入口 |
| --- | --- |
| 功能规划、拆票、模块实现或架构评审 | 使用 [d-pi-headless-features](.agents/skills/d-pi-headless-features/SKILL.md)，按需读取 [无头功能合同](docs/architecture/headless-features.md)与 [基础契约](docs/architecture/foundation-contracts.md)相关节；普通文档审计、skill 审计、纯文字或纯样式任务不触发该 skill |
| 应用 TypeScript 实现、重构、类型/数据边界设计或相关代码评审 | 使用 [d-pi-typescript](.agents/skills/d-pi-typescript/SKILL.md)，按需读取 [TypeScript 合同](docs/architecture/typescript.md)；文档审计和纯样式任务不触发 |
| 本地需求与任务记录 | [issue 约定](docs/agents/issue-tracker.md)，文件放在 `.scratch/<feature>/` |
| 领域术语或架构决定 | [领域文档约定](docs/agents/domain.md)、根 `CONTEXT.md` 与相关 `docs/adr/` |
| 跨进程操作、错误或性能 | [诊断合同](docs/architecture/diagnostics.md)；D-21/D-22 从每个功能开始落实，不作为末期补项 |
| GUI 图标或外部 UI 源码接入 | [图标合同](docs/architecture/icon-system.md)；纯图标/样式任务也适用 |
| 重新评估已有技术方向或复用旧实现 | [交接](docs/prototype/handoff.md)、[架构](docs/prototype/v1-architecture-draft.md)、[库雷达](docs/prototype/frontend-library-radar.md)的相关部分；保留理由与证据，不从零重选 |

## 不得丢失的项目边界

- OMP TUI 基本全覆盖是最终目标，逐功能交付；全集清单与完整组件基础都不是可用版本的前置。G1 是对应功能验证门槛，M1 是内部闭环，M2 才是首版验收，M3 为后续能力；以基础契约为准。
- D-28–D-30：每个功能先验证、再无头逻辑、最后正式 GUI；业务生命周期独立于 React，不引入 XState。真实 GUI 验收不能由无头测试代替。
- D-21/D-22：结构化日志、跨进程同一 `traceId` 与阶段/请求/实例身份、类型化错误及明确恢复归属；未证实根因保留 `unknown`。日志轻量、异步、有界，默认不记秘密或业务全文；不重建 OMP 日志，不把专用日志 UI 设为首版前置。
- D-23–D-25：首版新增认证仅 OpenAI 账户（OMP `openai-codex`）及 DeepSeek API key，已有其他可用配置仍复用；提交结果未知不能自动重发；项目执行信任与 App 文件访问分开，不能冒称工具沙箱。
- D-17：应用自有代码使用 Biome；只在接入 `@shadcn/lint` 时引入限定范围的 Oxlint，不建立 ESLint + Prettier 工具链。
- D-05：macOS 优先，Windows/Linux 的支持范围与时间未承诺。拟采用 macOS 独占的功能或必需能力时，先报告原因、其他平台影响及替代方案，由用户决定；Electron 跨平台不代表所有依赖已兼容。
- D-31：Hugeicons 免费 Stroke Rounded 经自有 Icon Layer 接入；业务视图不直引供应商或私有 SVG，图标/React 类型不进入无头功能或 IPC 合同。按 GUI 切片接入与验收，不预铺全图库。
- D-32–D-35：Base UI 为默认基础交互，Composer 采用最小 Tiptap，App 结构化存储采用 SQLite；ts-pattern 为应用业务分支默认范式，Zod v4 标准版负责数据边界。旧否定/待定结论已取代；Drizzle、Effect 等其他候选不连带批准。具体所有权与验收仍遵守相关合同。
- `.scratch/omp-runtime-feasibility/` 是独立实验，不是生产基础设施。数值预算是工程目标，不能冒称用户逐项指定或实测达标。
