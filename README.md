# d-pi

以 Electron GUI 复用 OMP Runtime，改善需求输入、执行观察和结果阅读。应用将内置 OMP，用户无需另行安装 CLI。

**当前状态（2026-09-30）：`0.1.0-s4.0`，S1–S4 四段工程均已交付待用户试用。** i18n 基础 `0.1.0-i18n.0` 源码完成待试用；领域目录治理 P0–P4 与 D-37 状态/查询库迁移已完成。真实供应商配置与用户体验均未获认可，工程交付不等于试用通过。状态单源是各切片的 `spec.md`/`handoff.md`，最近的是 [S4 交接](.scratch/m1-s4-files-diff/handoff.md)、[i18n 交接](.scratch/i18n-foundation/handoff.md)与[状态/查询对齐交接](.scratch/state-query-alignment/handoff.md)；本文件不重复维护阶段状态。

从 [文档导航](docs/README.md) 按任务找到依据；全局审计可按其中的底层到顶层顺序阅读。设计与开发以 [决定登记](docs/decisions.md)、[基础方案](.scratch/product-requirements/foundation-plan.md)和相关 [基础契约](docs/architecture/foundation-contracts.md)为准。具体任务按用户授权推进，不重复开启已收敛的选型。

## 运行与检查

```sh
pnpm install --frozen-lockfile
pnpm runtime:fetch
pnpm dev
pnpm check
pnpm package:mac
```

项目默认仅浏览；明确允许执行并启动后才加载原生项目配置/扩展。`pnpm runtime:fetch` 下载固定版本并校验 SHA-256，不使用全局 OMP。打包产物落在 `dist/<名称>/mac-arm64/d-pi.app`；`dist/` 不纳入版本控制，各机器按需自行构建，具体构建标识见对应切片交接。当前源码用 `pnpm dev` 启动。

通过 `D_PI_DATA_DIR=/绝对路径` 隔离 App 的 SQLite/日志；这**不会隔离原生 OMP 配置**。正常退出后执行恢复、排队/干预/停止和完整待交互回答已由 S3 交付待试用；冷恢复缺全周期单写证明时保持只读，不会自动新建原生会话替代已有 Thread。不要删除数据库来解决启动或迁移失败。

启动命令、试用步骤、构建标识和明确限制见 [S4 交接](.scratch/m1-s4-files-diff/handoff.md)；[S3](.scratch/m1-s3-control-recovery/handoff.md)、[i18n](.scratch/i18n-foundation/handoff.md)与[状态/查询对齐](.scratch/state-query-alignment/handoff.md)各有独立交接。包限本机 macOS arm64，未签名/公证；[S1](.scratch/m1-s1-project-draft/handoff.md)、[S2](.scratch/m1-s2-submit-read/handoff.md)交接保留为历史证据。

## 设计与历史入口

- [模块地图与职责](docs/architecture/modules/README.md)：12 个模块的所有权、依赖和验收入口；[关键交接图](docs/architecture/modules/flows.md)串起提交与恢复。
- [M1 开发准备与切片计划](.scratch/development-foundation/spec.md)：G1 缺口、近期交付、跨模块场景和首版需求覆盖。
- [当前交接与证据索引](docs/prototype/handoff.md)
- [整理后的架构与交付](docs/prototype/v1-architecture-draft.md)
- [既有前端库雷达](docs/prototype/frontend-library-radar.md)：保留候选、理由、参考和采用条件。
- [技术选型与采纳记录](docs/architecture/technology-selection-review.md)：D-32–D-35 已确认 Base UI、最小 Tiptap、SQLite、应用级 ts-pattern 与 Zod v4，其他工具仍按候选状态。
- [TypeScript 范式](docs/architecture/typescript.md)：严格类型、schema 推导、穷尽业务分支与边界验收；对应 [项目 skill](.agents/skills/d-pi-typescript/SKILL.md)按任务调用。
- [当前需求](.scratch/product-requirements/spec.md)与[增量选型评估](.scratch/product-requirements/technical-evaluation.md)：本轮确认与待验证项。
- [清理前归档证据](docs/archive/pre-reset/README.md)：M1 研究快照、访谈决策、规格、原型机器结果与旧文档原稿，附固定提交与哈希清单；旧源码、同名构建文件与不可运行的原型脚本已于 2026-09-30 裁剪，见其 `pruned` 段。

功能开发遵守 [证据优先 → 无头功能 → 正式 GUI](docs/architecture/headless-features.md)（D-28–D-30）：常规能力查官方文档/固定版本源码后实现，仅关键未知前置最小实验，不逐切片重跑全套；组件化包括非 UI 逻辑，应用生命周期独立于 React，不引入 XState。对应 [仓库 skill](.agents/skills/d-pi-headless-features/SKILL.md)随本仓库维护。

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
