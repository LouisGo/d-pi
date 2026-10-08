# d-pi

以 Electron GUI 复用 OMP Runtime，改善需求输入、执行观察和结果阅读。应用携带固定、未修改的官方 OMP SDK，由 App 薄宿主接入；用户无需另行安装 OMP CLI。

当前工作、各阶段和真实待决见固定[项目总看板](docs/status.md)，所属规格是状态源。阶段授权、工程验证与用户试用分别由各切片维护，入口见[工作记录导航](docs/README.md#工作记录)；本页提供工程入口，不另维护进度或宣称体验已认可。

## 环境准备与启动

本轮开发环境目标为 **Node 24.21.0 / pnpm 12.8.1**，分别以 `.node-version` 与 `packageManager` 为单一入口。`package.json` 的 Node 最低声明不代表所有满足版本均已验证。开发 Node、Electron 内嵌 Node、OMP 宿主 Bun 各自独立；固定依赖与资源版本由锁文件和资源 manifest 核对。

首次 clone 或新 worktree 先准备依赖和资源；已有环境只在依赖、SDK/宿主或平台变化时更新对应资源：

```sh
pnpm install --frozen-lockfile
pnpm exec install-electron
pnpm runtime:sdk
pnpm check:environment
```

日常开发与本机试用默认直接启动 Dev，无需先跑完整检查、`build` 或打包：

```sh
pnpm dev
```

Renderer 使用 HMR。Main/preload 修改默认重启 Dev；需要自动监听时用 `pnpm dev:watch`，Main 重建会重启应用，preload 重建会重载页面，运行中的执行应先结束。`pnpm preview` 构建并运行 `out/`，用于检查构建差异，不生成 `.app`。同一 checkout 的 Dev 与 preview 共用开发数据，切换前先退出当前实例。验证按[工程入口](docs/engineering/checks.md)选择；何时需要固定包以[本地交付](docs/engineering/local-delivery.md#选择运行与交付方式)为准。创建 PR/worktree 或完成一轮工作本身不触发打包。

| 命令 | 前置与结果 |
| --- | --- |
| `pnpm install --frozen-lockfile` | 安装锁定依赖；需要包仓库可访问或完整可用的离线缓存，不承诺无网络首次安装 |
| `pnpm exec install-electron` | 串行准备已安装版本的 Electron 分发，避免首次测试多个进程同时自动下载；已有完整分发时直接返回 |
| `pnpm runtime:sdk` | 使用已安装的锁定依赖准备目标平台 SDK 运行闭包、Bun、App 薄宿主、消费门控和 manifest；裁剪分发冗余并检查 650 MiB 资源预算，不使用全局 OMP |
| `pnpm check:environment` | 检查开发工具、已安装依赖、Electron 实际内嵌 Node、Bun 与 SDK manifest/资源哈希；缺失和异常启动变量明确失败 |
| `pnpm check` | 快速工具环境、类型、代码/设计/i18n、文档引用、架构及报告新鲜度、门禁负例与隔离自动测试；检查通过不等于 GUI 或用户试用通过 |
| `pnpm check:fast` | 快速工具/依赖、Biome、文档/任务、模块边界及报告新鲜度；显式安装的提交 hook 调用，不启动原生进程或打包 |
| `pnpm build` | 构建 Electron Main/preload/Renderer 到 `out/`；不单独准备 SDK 或生成 `.app` |
| `pnpm dev` | 启动带 Renderer HMR 的开发态应用；需已有匹配本机平台/架构的 SDK；终端显示源码和独立开发数据目录 |
| `pnpm dev:watch` | 在 Dev 基础上监听 Main/preload；会重启应用/重载页面 |
| `pnpm preview` | 构建并运行未打包的应用，使用该 checkout 的开发数据；不准备 SDK 或生成 `.app` |
| `pnpm package:mac` | 先准备 SDK、构建，再生成未签名的本地 macOS 应用目录；包后检查平台、资源哈希、依赖链接与 1000 MiB 预算，输出 `package-size.json`；实际构建标识以交接为准 |

当前已验证交付平台为 macOS arm64，未承诺 Windows/Linux、其他架构、签名或公证。`resources/sdk`、`out` 与 `dist` 都是可重建产物，不把作者机器的资源目录当干净环境前置。独立环境验证与实际证据由重写任务记录维护。

`pnpm dev` 提供「开发 → 切换开发者工具」（macOS：`⌥⌘I`），并在页面加载前通过 `electron-devtools-installer` 加载官方 React Developer Tools 扩展。首次启动需要从 Chrome Web Store 下载，后续复用 App 数据目录中的扩展缓存；打开 DevTools 后可使用 Components / Profiler。如果首次安装后 Components 提示尚未检测到 React，按 `⌘R` 刷新一次，让扩展完成注入。下载失败会在启动终端提示，应用继续启动，可在网络恢复后重启。开发菜单和扩展加载仅用于开发构建。

`pnpm runtime:fetch` 另行下载并校验固定官方 **CLI artifact**，用于保留的对应验证路径；当前 artifact manifest 只包含 `darwin-arm64`。该命令不准备 SDK 资源，不是当前应用启动的必需步骤。

`pnpm report:structure` 分开展示允许依赖与实际源码导入；审查相关源代码/规则变更后运行 `pnpm report:structure:write` 更新入库快照，`pnpm check:structure` 会拒绝陈旧报告。测试入口会创建受控临时环境，不继承个人凭据、App 数据、OMP 配置/会话或 Git 全局配置。CI 可复用上面的冻结安装、资源准备、环境检查、`check` 和 `build`，已接入 [macOS arm64 CI](.github/workflows/check.yml)；配置不表示远端已执行。

## 本地提交与 CI

`pnpm hooks:install` 显式安装可卸载的 hook，保留原 hook 并按序转发，不覆盖用户全局配置；`pnpm hooks:uninstall` 恢复安装前设置。hook 只对显式安装的 checkout 调用 `check:fast`，其它 linked worktrees 沿用原 hooks。当前启用/验证状态见[收口规格](.scratch/infrastructure-closure/spec.md)，实现与失败分类见[工程入口](docs/engineering/checks.md)。

修改模块/源码后运行 `pnpm report:structure:write`；修改状态源后运行 `pnpm report:status:write`，审查生成 diff 后提交。报告是来源的投影，不通过手工改报告绕过检查。CI 复用 frozen install、SDK/环境准备、`validate:sdk`、`check` 和 `build`；CLI opt-in smoke 默认明确跳过，仅声明已验证的 macOS arm64 路线。

## 配置与数据边界

项目默认仅浏览；用户明确允许执行并启动后，才加载 OMP 原生项目配置/扩展。App 偏好与 SQLite/日志和 OMP 原生配置、会话记录各有所有者，详见[配置 ADR](docs/adr/0002-share-native-omp-config.md)。

`pnpm dev` / `dev:watch` / `preview` 默认把 App 数据放在 `~/.d-pi/dev/<checkout名>-<路径哈希>/`，同一路径持续复用，不同 worktree 分开；保留旧候选数据，不自动迁移。终端输出实际源码路径和数据路径，Dev 的版本/build ID 是启动快照，HMR 后不能当作固定源码身份。

`D_PI_DATA_DIR=/绝对路径 pnpm dev` 可显式覆盖开发数据目录。App 数据隔离**不等于完整 OMP 配置与会话隔离**：原生配置及环境变量继续沿用现有解析策略，不复制认证，不改 profile；保存共享原生设置仍影响使用同一配置的 CLI。测试与干净启动需要同时隔离原生配置、会话目录和项目上下文，使用受控环境。`ELECTRON_RUN_AS_NODE` 会改变 Electron 启动语义；启动失败时先核对环境与资源，不删除数据库解决迁移或恢复问题。

unknown 提交不自动重发；恢复缺执行全周期单写证据时继续只读。内容阅读与可执行状态分开，具体恢复门槛和已覆盖路径见[S3 规格](.scratch/m1-s3-control-recovery/spec.md)及相关交接。

## 文档入口

- [文档导航](docs/README.md)：按任务选择现行合同、工作记录与证据。
- [决定登记](docs/decisions.md)、[产品需求](docs/product/requirements.md)、[首版方案](docs/product/first-release.md)：用户范围、技术方向及取代关系。
- [架构总览](docs/architecture/overview.md)、[模块地图](docs/architecture/modules/README.md)与[交接图](docs/architecture/modules/flows.md)：所有权、生命周期与工程落点。
- [基础契约](docs/architecture/foundation-contracts.md)、[无头功能合同](docs/architecture/headless-features.md)、[诊断合同](docs/architecture/diagnostics.md)：行为与验证边界。
- [维护边界](docs/engineering/omp-maintenance.md)、[Electron 安全](docs/engineering/desktop-security.md)、[本地交付与公开分发待决](docs/engineering/local-delivery.md)：固定 SDK、开发 skills、原生资源和发布准备。
- [历史证据索引](docs/prototype/handoff.md)与[归档说明](docs/archive/pre-reset/README.md)：固定版本的研究与机器/GUI 证据，不能作为当前应用验收。
