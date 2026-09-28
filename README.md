# d-pi

以 Electron GUI 复用 OMP Runtime，改善需求输入、执行观察和结果阅读。应用将内置 OMP，用户无需另行安装 CLI。

**当前状态（2026-09-28）：M1 S2 文字发送与阅读主流程已交付待试用。** `0.1.0-s2.0` 使用未修改的官方 OMP v18.3.0，支持同一存活会话两轮发送、持久提交原文、流式阅读、只读历史和关窗重连。S2 基线的真实 macOS 包定向检查已通过；独立 review 的 3 项修复已进入源码，当前 72 项自动化测试通过，不等于用户体验或真实供应商配置已验收。S1 旧包保留。

从 [文档导航](docs/README.md) 按任务找到依据；全局审计可按其中的底层到顶层顺序阅读。设计与开发以 [决定登记](docs/decisions.md)、[基础方案](.scratch/product-requirements/foundation-plan.md)和相关 [基础契约](docs/architecture/foundation-contracts.md)为准。具体任务按用户授权推进，不重复开启已收敛的选型。

## 运行与检查

```sh
pnpm install --frozen-lockfile
pnpm runtime:fetch
pnpm dev
pnpm check
pnpm package:mac
```

项目默认仅浏览；明确允许执行并启动后才加载原生项目配置/扩展。`pnpm runtime:fetch` 下载固定版本并校验 SHA-256，不使用全局 OMP。常规打包产物在 `dist/mac-arm64/d-pi.app`；历史试用包在 `dist/s2-candidate/mac-arm64/d-pi.app`，尚不包含独立 review 修复；当前源码用 `pnpm dev` 启动，详见交接。

通过 `D_PI_DATA_DIR=/绝对路径` 隔离 App 的 SQLite/日志；这**不会隔离原生 OMP 配置**。正常退出后执行恢复、排队/干预/停止和完整待交互回答属于 S3，当前不会自动新建原生会话替代已有 Thread。不要删除数据库来解决启动或迁移失败。

启动命令、试用步骤、构建标识和明确限制见 [S2 交接](.scratch/m1-s2-submit-read/handoff.md)。包限本机 macOS arm64，未签名/公证，旧 [S1 交接](.scratch/m1-s1-project-draft/handoff.md)保留为历史证据。

## 设计与历史入口

- [模块地图与职责](docs/architecture/modules/README.md)：12 个模块的所有权、依赖和验收入口；[关键交接图](docs/architecture/modules/flows.md)串起提交与恢复。
- [M1 开发准备与切片计划](.scratch/development-foundation/spec.md)：G1 缺口、近期交付、跨模块场景和首版需求覆盖。
- [当前交接与证据索引](docs/prototype/handoff.md)
- [整理后的架构与交付](docs/prototype/v1-architecture-draft.md)
- [既有前端库雷达](docs/prototype/frontend-library-radar.md)：保留候选、理由、参考和采用条件。
- [技术选型与采纳记录](docs/architecture/technology-selection-review.md)：D-32–D-35 已确认 Base UI、最小 Tiptap、SQLite、应用级 ts-pattern 与 Zod v4，其他工具仍按候选状态。
- [TypeScript 范式](docs/architecture/typescript.md)：严格类型、schema 推导、穷尽业务分支与边界验收；对应 [项目 skill](.agents/skills/d-pi-typescript/SKILL.md)按任务调用。
- [当前需求](.scratch/product-requirements/spec.md)与[增量选型评估](.scratch/product-requirements/technical-evaluation.md)：本轮确认与待验证项。
- [清理前完整归档](docs/archive/pre-reset/README.md)：原型、机器结果、源码、测试及构建文件，附固定提交与哈希清单。

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
