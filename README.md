# OMP Desktop

以 Electron GUI 复用 OMP Runtime，改善需求输入、执行观察和结果阅读。应用将内置 OMP，用户无需另行安装 CLI。

**当前状态：可行性验证完成，等待下一阶段需求讨论与技术选型。** 早期应用、UI、前端依赖和构建配置已移除；当前仓库没有可运行的产品应用，也未确定前端框架、组件库或状态管理方案。

## 已确认的基础

- OMP 拥有执行、工具、原生会话和记忆；Electron Main 管桌面生命周期，utility SessionHost 连接 OMP，Renderer 管交互展示。见 [架构决策](docs/adr/0001-omp-session-client.md)及 [领域术语](CONTEXT.md)。
- 应用携带固定兼容版本的 Runtime，默认共享 OMP 原生配置；桌面偏好单独保存。见 [配置决策](docs/adr/0002-share-native-omp-config.md)。
- OMP 18.3.0 的多会话、子 Agent 观察与模型/思考默认值、local 记忆、原生设置和最小随包运行已获限定范围的实测支持。结论为有条件可行，不等于完整 TUI 对等或产品验收完成。

## 验证资料

- [能力矩阵与边界](docs/validation/runtime-feasibility.md)
- [子 Agent 默认配置与 Settings](docs/validation/settings-feasibility.md)
- [Electron 随包运行证据](docs/validation/packaged-runtime-evidence.md)
- [独立探针、范围及机器结果](.scratch/omp-runtime-feasibility/spec.md)：仅依赖 Node 内置模块；具体外部实验资源及复现命令见上述记录。
- [历史 GUI 实测](docs/archive/stage1-evidence.md)：仅作历史证据，不构成后续需求。

下一步先明确产品需求、交互范围与技术选型，再建立正式应用。旧代码和早期方案可从 Git 提交 `6fab3ef` 查阅；本次清理范围见 [工作区清理记录](.scratch/workspace-reset/spec.md)。
