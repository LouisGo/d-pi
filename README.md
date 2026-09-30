# d-pi

以 Electron GUI 复用 OMP Runtime，改善需求输入、执行观察和结果阅读。应用携带固定、未修改的官方 OMP SDK，由 App 薄宿主接入；用户无需另行安装 OMP CLI。

当前工作见[重写规格](.scratch/rewrite-preparation/spec.md)。阶段授权、工程验证与用户试用分别由各切片维护，入口见[工作记录导航](docs/README.md#工作记录)；本页提供工程入口，不另维护进度或宣称体验已认可。

## 环境准备与启动

本轮开发环境目标为 **Node 24.21.0 / pnpm 10.5.2**。`package.json` 的 Node 最低声明不代表所有满足版本均已验证。开发 Node、Electron 内嵌 Node、OMP 宿主 Bun 各自独立；固定依赖与资源版本由锁文件和资源 manifest 核对。

```sh
pnpm install --frozen-lockfile
pnpm runtime:sdk
pnpm check
pnpm build
pnpm dev
```

| 命令 | 前置与结果 |
| --- | --- |
| `pnpm install --frozen-lockfile` | 安装锁定依赖；需要包仓库可访问或完整可用的离线缓存，不承诺无网络首次安装 |
| `pnpm runtime:sdk` | 使用已安装的锁定依赖准备 `resources/sdk`：官方 SDK 依赖图、Bun、App 薄宿主、消费门控和 manifest；不使用全局 OMP |
| `pnpm check` | 类型、代码/设计/i18n、架构边界及自动测试；检查通过不等于 GUI 或用户试用通过 |
| `pnpm build` | 构建 Electron Main/preload/Renderer 到 `out/`；不单独准备 SDK 或生成 `.app` |
| `pnpm dev` | 启动开发态应用；需先准备匹配本机平台/架构的 SDK 资源 |
| `pnpm package:mac` | 先准备 SDK、构建，再生成未签名的本地 macOS 应用目录；产物在 `dist/`，实际构建标识以交接为准 |

当前已验证交付平台为 macOS arm64，未承诺 Windows/Linux、其他架构、签名或公证。`resources/sdk`、`out` 与 `dist` 都是可重建产物，不把作者机器的资源目录当干净环境前置。独立环境验证与实际证据由重写任务记录维护。

`pnpm runtime:fetch` 另行下载并校验固定官方 **CLI artifact**，用于保留的对应验证路径；当前 artifact manifest 只包含 `darwin-arm64`。该命令不准备 SDK 资源，不是当前应用启动的必需步骤。

## 配置与数据边界

项目默认仅浏览；用户明确允许执行并启动后，才加载 OMP 原生项目配置/扩展。App 偏好与 SQLite/日志和 OMP 原生配置、会话记录各有所有者，详见[配置 ADR](docs/adr/0002-share-native-omp-config.md)。

`D_PI_DATA_DIR=/绝对路径` 只隔离 App 数据，**不会隔离 OMP 配置与会话**。测试与干净启动需要同时隔离原生配置、会话目录和项目上下文，使用受控环境。`ELECTRON_RUN_AS_NODE` 会改变 Electron 启动语义；启动失败时先核对环境与资源，不删除数据库解决迁移或恢复问题。

unknown 提交不自动重发；恢复缺执行全周期单写证据时继续只读。内容阅读与可执行状态分开，具体恢复门槛和已覆盖路径见[S3 规格](.scratch/m1-s3-control-recovery/spec.md)及相关交接。

## 文档入口

- [文档导航](docs/README.md)：按任务选择现行合同、工作记录与证据。
- [决定登记](docs/decisions.md)、[产品需求](docs/product/requirements.md)、[首版方案](docs/product/first-release.md)：用户范围、技术方向及取代关系。
- [架构总览](docs/architecture/overview.md)、[模块地图](docs/architecture/modules/README.md)与[交接图](docs/architecture/modules/flows.md)：所有权、生命周期与工程落点。
- [基础契约](docs/architecture/foundation-contracts.md)、[无头功能合同](docs/architecture/headless-features.md)、[诊断合同](docs/architecture/diagnostics.md)：行为与验证边界。
- [历史证据索引](docs/prototype/handoff.md)与[归档说明](docs/archive/pre-reset/README.md)：固定版本的研究与机器/GUI 证据，不能作为当前应用验收。
