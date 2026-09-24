# 当前交接：先确认 Runtime 能力，再产品化

更新：2026-09-24。仓库已有阶段 1 正式 GUI，不再处于“只有接入原型”的状态。

先读 [Runtime 可行性结论](runtime-feasibility.md)、[本轮规格](../../.scratch/omp-runtime-feasibility/spec.md)和根目录 `CONTEXT.md`。本轮 9 项轻量检查通过，证据及复现脚本均已入库；不要重复测试已确认的基础通路。

用户目标：复用 OMP 核心能力，通过 Electron 做更友好的 GUI。最终应用携带 OMP，用户无需另装 CLI。先确认多会话、子 Agent、记忆、设置的接入可行性，再投入 UI/组件/状态管理。当前固定验证 OMP 18.3.0。

配置决策已收束：按 OpenCode 的策略默认共享 OMP 原生配置，桌面偏好单独保存，详见 [ADR-0002](../adr/0002-share-native-omp-config.md)。测试仍用隔离目录；不再追问是否默认隔离。

已确认：独立会话并行、子 Agent 事件和历史、创建时不同思考档位、原生 local 记忆跨同项目会话注入、主会话设置、供应商并发限额、图片传输与宿主工具。独立 thread 消息路由由宿主适配实测通过。

后续澄清：用户要配置子 Agent 类型的模型/思考默认值，暂不要求运行实例的复杂控制。[Settings 补测](settings-feasibility.md)6 项通过：原生配置写入可影响同一主会话下一次 spawn；原生 JSON 提供配置值/类型/说明，GUI 补展示元数据。指定实例控制不再是当前门槛。

本阶段已收束：[最小随包 `.app` 验证](packaged-runtime-evidence.md)通过，Electron 44.4.5 携带 OMP 18.3.0，经 LaunchServices 启动并完成 Renderer/Host/OMP 往返、模型回合与正常退出。正式 GUI/ASAR/签名发行/干净机器仍未验收。核心 9 项与设置 6 项也已复跑通过。

接下来由用户发起需求讨论和技术选型；不要提前写 UI、多会话产品结构或前端基建。

[旧阶段证据](stage1-evidence.md)保留真实 GUI 历史验收；[V1 计划](v1-architecture-draft.md)是后续参考，不要求现在一次兑现。
