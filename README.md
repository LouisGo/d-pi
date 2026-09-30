# d-pi

以 Electron GUI 复用 OMP Runtime，改善需求输入、执行观察和结果阅读。应用携带固定、未修改的官方 OMP SDK，由 App 薄宿主接入；用户无需另行安装 OMP CLI。

当前工作、各阶段和真实待决见固定[项目总看板](docs/status.md)，所属规格是状态源。阶段授权、工程验证与用户试用分别由各切片维护，入口见[工作记录导航](docs/README.md#工作记录)；本页提供工程入口，不另维护进度或宣称体验已认可。

## 环境准备与启动

本轮开发环境目标为 **Node 24.21.0 / pnpm 10.5.2**，分别以 `.node-version` 与 `packageManager` 为单一入口。`package.json` 的 Node 最低声明不代表所有满足版本均已验证。开发 Node、Electron 内嵌 Node、OMP 宿主 Bun 各自独立；固定依赖与资源版本由锁文件和资源 manifest 核对。

```sh
pnpm install --frozen-lockfile
pnpm hooks:install
pnpm exec install-electron
pnpm runtime:sdk
pnpm check:environment
pnpm check
pnpm build
pnpm dev
```

| 命令 | 前置与结果 |
| --- | --- |
| `pnpm install --frozen-lockfile` | 安装锁定依赖；需要包仓库可访问或完整可用的离线缓存，不承诺无网络首次安装 |
| `pnpm exec install-electron` | 串行准备已安装版本的 Electron 分发，避免首次测试多个进程同时自动下载；已有完整分发时直接返回 |
| `pnpm runtime:sdk` | 使用已安装的锁定依赖准备 `resources/sdk`：官方 SDK 依赖图、Bun、App 薄宿主、消费门控和 manifest；不使用全局 OMP |
| `pnpm check:environment` | 检查开发工具、已安装依赖、Electron 实际内嵌 Node、Bun 与 SDK manifest/资源哈希；缺失和异常启动变量明确失败 |
| `pnpm check` | 快速工具环境、类型、代码/设计/i18n、文档引用、架构及报告新鲜度、门禁负例与隔离自动测试；检查通过不等于 GUI 或用户试用通过 |
| `pnpm check:fast` | 快速工具/依赖、Biome、文档/任务、模块边界及报告新鲜度；显式安装的提交 hook 调用，不启动原生进程或打包 |
| `pnpm build` | 构建 Electron Main/preload/Renderer 到 `out/`；不单独准备 SDK 或生成 `.app` |
| `pnpm dev` | 启动开发态应用；需先准备匹配本机平台/架构的 SDK 资源 |
| `pnpm package:mac` | 先准备 SDK、构建，再生成未签名的本地 macOS 应用目录；产物在 `dist/`，实际构建标识以交接为准 |

当前已验证交付平台为 macOS arm64，未承诺 Windows/Linux、其他架构、签名或公证。`resources/sdk`、`out` 与 `dist` 都是可重建产物，不把作者机器的资源目录当干净环境前置。独立环境验证与实际证据由重写任务记录维护。

`pnpm runtime:fetch` 另行下载并校验固定官方 **CLI artifact**，用于保留的对应验证路径；当前 artifact manifest 只包含 `darwin-arm64`。该命令不准备 SDK 资源，不是当前应用启动的必需步骤。

`pnpm report:structure` 分开展示允许依赖与实际源码导入；审查相关源代码/规则变更后运行 `pnpm report:structure:write` 更新入库快照，`pnpm check:structure` 会拒绝陈旧报告。测试入口会创建受控临时环境，不继承个人凭据、App 数据、OMP 配置/会话或 Git 全局配置。CI 可复用上面的冻结安装、资源准备、环境检查、`check` 和 `build`，已接入 [macOS arm64 CI](.github/workflows/check.yml)；配置不表示远端已执行。

## 本地提交与 CI

`pnpm hooks:install` 显式安装可卸载的 hook，保留原 hook 并按序转发，不覆盖用户全局配置；`pnpm hooks:uninstall` 恢复安装前设置。hook 只对显式安装的 checkout 调用 `check:fast`，其它 linked worktrees 沿用原 hooks。当前启用/验证状态见[收口规格](.scratch/infrastructure-closure/spec.md)，实现与失败分类见[工程入口](docs/engineering/checks.md)。

修改模块/源码后运行 `pnpm report:structure:write`；修改状态源后运行 `pnpm report:status:write`，审查生成 diff 后提交。报告是来源的投影，不通过手工改报告绕过检查。CI 复用 frozen install、SDK/环境准备、`validate:sdk`、`check` 和 `build`；CLI opt-in smoke 默认明确跳过，仅声明已验证的 macOS arm64 路线。

## 配置与数据边界

项目默认仅浏览；用户明确允许执行并启动后，才加载 OMP 原生项目配置/扩展。App 偏好与 SQLite/日志和 OMP 原生配置、会话记录各有所有者，详见[配置 ADR](docs/adr/0002-share-native-omp-config.md)。

`D_PI_DATA_DIR=/绝对路径` 只隔离 App 数据，**不会隔离 OMP 配置与会话**。测试与干净启动需要同时隔离原生配置、会话目录和项目上下文，使用受控环境。`ELECTRON_RUN_AS_NODE` 会改变 Electron 启动语义；启动失败时先核对环境与资源，不删除数据库解决迁移或恢复问题。

unknown 提交不自动重发；恢复缺执行全周期单写证据时继续只读。内容阅读与可执行状态分开，具体恢复门槛和已覆盖路径见[S3 规格](.scratch/m1-s3-control-recovery/spec.md)及相关交接。

## 文档入口

- [文档导航](docs/README.md)：按任务选择现行合同、工作记录与证据。
- [决定登记](docs/decisions.md)、[产品需求](docs/product/requirements.md)、[首版方案](docs/product/first-release.md)：用户范围、技术方向及取代关系。
- [架构总览](docs/architecture/overview.md)、[模块地图](docs/architecture/modules/README.md)与[交接图](docs/architecture/modules/flows.md)：所有权、生命周期与工程落点。
- [基础契约](docs/architecture/foundation-contracts.md)、[无头功能合同](docs/architecture/headless-features.md)、[诊断合同](docs/architecture/diagnostics.md)：行为与验证边界。
- [维护边界](docs/engineering/omp-maintenance.md)、[Electron 安全](docs/engineering/desktop-security.md)、[本地交付与公开分发待决](docs/engineering/local-delivery.md)：固定 SDK、开发 skills、原生资源和发布准备。
- [历史证据索引](docs/prototype/handoff.md)与[归档说明](docs/archive/pre-reset/README.md)：固定版本的研究与机器/GUI 证据，不能作为当前应用验收。
