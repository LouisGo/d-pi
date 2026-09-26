# OMP Desktop

以 Electron GUI 复用 OMP Runtime，改善需求输入、执行观察和结果阅读。应用将内置 OMP，用户无需另行安装 CLI。

**当前状态（2026-09-26）：Runtime 可行性已有限定范围证据，需求和基础方案已收敛到分阶段验证与交付，当前产品尚未开始实现。** 旧应用已完整归档，后续逐项复用；删除实现不代表取消既有技术决定。设计就绪不等于接口、性能或首版已验收。

从 [文档导航](docs/README.md) 按任务找到依据；全局审计可按其中的底层到顶层顺序阅读。设计与开发以 [决定登记](docs/decisions.md)、[基础方案](.scratch/product-requirements/foundation-plan.md)和相关 [基础契约](docs/architecture/foundation-contracts.md)为准。具体任务按用户授权推进，不重复开启已收敛的选型。

## 设计与历史入口

- [当前交接与证据索引](docs/prototype/handoff.md)
- [整理后的架构与交付](docs/prototype/v1-architecture-draft.md)
- [既有前端库雷达](docs/prototype/frontend-library-radar.md)：保留候选、理由、参考和采用条件。
- [技术选型与采纳记录](docs/architecture/technology-selection-review.md)：D-32–D-35 已确认 Base UI、最小 Tiptap、SQLite、应用级 ts-pattern 与 Zod v4，其他工具仍按候选状态。
- [TypeScript 范式](docs/architecture/typescript.md)：严格类型、schema 推导、穷尽业务分支与边界验收；对应 [项目 skill](.agents/skills/d-pi-typescript/SKILL.md)按任务调用。
- [当前需求](.scratch/product-requirements/spec.md)与[增量选型评估](.scratch/product-requirements/technical-evaluation.md)：本轮确认与待验证项。
- [清理前完整归档](docs/archive/pre-reset/README.md)：原型、机器结果、源码、测试及构建文件，附固定提交与哈希清单。

功能开发遵守 [验证 → 无头功能 → 正式 GUI](docs/architecture/headless-features.md)（D-28–D-30）；组件化包括非 UI 逻辑，应用生命周期独立于 React，不引入 XState。对应 [仓库 skill](.agents/skills/d-pi-headless-features/SKILL.md)随本仓库维护。

## 已确认的基础

- OMP 拥有执行、工具、原生会话和记忆；Electron Main 管桌面生命周期，utility SessionHost 连接 OMP，Renderer 管交互展示。见 [架构决策](docs/adr/0001-omp-session-client.md)及 [领域术语](CONTEXT.md)。
- 应用携带固定兼容版本的 Runtime，默认共享 OMP 原生配置；桌面偏好单独保存。见 [配置决策](docs/adr/0002-share-native-omp-config.md)。
- OMP 18.3.0 的多会话、子 Agent 观察与模型/思考默认值、local 记忆、原生设置和最小随包运行已获限定范围的实测支持。结论为有条件可行，不等于完整 TUI 对等或产品验收完成。

应用每层从开发开始具备[轻量结构化日志与基础监控](docs/architecture/diagnostics.md)：日常无感、排查可追溯，专用日志界面后续可做（D-21）。

## 验证资料

首阶段方向是主对话闭环、只读代码与 Diff，编辑功能后续加入；OMP TUI 全集是最终目标，不要求一次交付。

- [能力矩阵与边界](docs/validation/runtime-feasibility.md)
- [子 Agent 默认配置与 Settings](docs/validation/settings-feasibility.md)
- [Electron 随包运行证据](docs/validation/packaged-runtime-evidence.md)
- [独立探针、范围及机器结果](.scratch/omp-runtime-feasibility/spec.md)：仅依赖 Node 内置模块；具体外部实验资源及复现命令见上述记录。
- [历史 GUI 实测](docs/archive/stage1-evidence.md)：仅作历史证据，不构成后续需求。

清理与此次纠正的范围见[工作区清理记录](.scratch/workspace-reset/spec.md)。历史证据不是新实现验收，但也不应当作从未完成而重复调查。
