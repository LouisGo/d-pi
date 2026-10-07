# 本地交付与公开分发边界

本页说明现有工程入口和未完成的分发事项，便于在进入公开试用前接手。是否实施和发布仍由所属规格及用户授权确定；`pnpm package:mac` 成功不构成公开发布、产品认可或其他平台支持。

## 选择运行与交付方式

2026-10-07 用户确认：日常开发和本机反馈默认使用 Dev；创建功能、PR、worktree、提交或工作收尾都不自动打包，也不自动重跑真实供应商、完整 E2E 或 Computer use。此调整取代将历史候选交接步骤套用到每轮开发的做法，必要的验证仍按[风险与证据缺口](../architecture/headless-features.md#日常改动的验证选择2026-10-07)选择。

| 当前目的 | 入口 | 交付与验证 |
| --- | --- | --- |
| 开发、修改 GUI、当前源码的本机试用 | `pnpm dev`；需要 Main/preload 自动监听时 `pnpm dev:watch` | 交付源码目录、commit/WIP 状态、启动命令和操作步骤；Renderer HMR，Main/preload 重启语义见 README |
| 确认生产编译、资源引用或优化差异，但无需独立 App | `pnpm build`；需要运行构建结果时 `pnpm preview` | 构建 `out/`，preview 使用开发数据；仍依赖 checkout 和 SDK，不声称包内行为已验证 |
| 需要脱离 checkout 运行的固定候选，或验证只有打包才有的差异 | `pnpm package:mac` | 例如 `app.isPackaged`、asar/extraResources、随包 SDK、安装/签名/分发路径；说明具体用途后生成固定包，验证受影响部分 |

里程碑只有确需独立、可复现的候选交付或组合验收时才打包；里程碑编号本身不构成理由。真实 Electron/SDK 检查可以直接使用开发资源，GUI 验收不等于包内验收。可运行体验应及时交付 Dev 试用，不为等固定包延迟反馈。历史 spec/交接中的包身份和测试矩阵保留为当时证据，不作为新一轮工作的默认步骤；当前用户明确要求和确有打包差异的验收继续适用。

Dev / preview 使用按 checkout 路径区分的持久 App 数据，沿用共享 OMP 原生配置；具体覆盖方式与边界见 [README](../../README.md#配置与数据边界)。版本号沿用 `package.json`，不因新功能、PR 或 worktree 自动递增。Dev 是持续变化的源码，不承诺 dirty=false 或固定产物哈希；冻结候选才核对包内身份，源码交付后的提交也不冒称包已更新。

## 本地产物保留与清理

固定包产生后记录保留用途：当前正在试用的候选、尚需复现问题或必要对照基线。替代候选可用后清理无用途旧包、ZIP 和重复验证副本，不为每个 PR/worktree 留一份永久包。清理前核对当前交接和运行进程，保留正在运行的 App；有明确原始 ZIP 时通常无需再保留多份解包副本。

清理范围是 `dist/` 中确认的生成产物，不连带删除 App 数据、原生配置/会话、源码、依赖或仍供 Dev 使用的 SDK。记录实际删除和保留路径及原因；历史证据不改写，在新记录注明旧路径已退役。磁盘统计需区分逻辑大小与 APFS 克隆/共享块，不能用目录大小之和声称实际回收空间，也不称为运行内存。

## 当前具备什么

| 事项 | 现状与事实入口 |
| --- | --- |
| 包版本 | 以 [package.json](../../package.json) 为单源，当前 `private=true`。切片编号、Git SHA、build ID 与包版本分别记录；本地切片提交不自动递增发行版本。 |
| 构建身份 | [构建配置](../../electron.vite.config.ts)注入 version、commit、dirty 和随机 build ID；无 Git 导出保留 unknown/dirty。对应构建和试用状态见 [总看板](../status.md) 路由到的交接。 |
| 本地打包 | `pnpm package:mac` 安装固定 Electron、准备固定 SDK、构建，再用 [electron-builder](../../electron-builder.yml)生成 macOS 目录包。当前经过验证的是 macOS arm64；Windows/Linux 与其他架构未承诺支持。 |
| 第三方声明 | [THIRD_PARTY_NOTICES](../../THIRD_PARTY_NOTICES.md)随 App 打包，保留改编 UI 来源与依赖许可；SDK 闭包的原始许可证文件随 `sdk/node_modules` 保留，Bun 原始说明随 `sdk/BUN-LICENSE.md` 保留。[OMP 资源维护](omp-maintenance.md)说明准备过程。 |
| 本地试用记录 | 规格维护工程、试用、用户认可状态；交接记录特定源码/构建 ID/哈希与实际路径。已有未签名包只代表其记录场景，不代表后来构建自动通过。 |

[现有 notices helper](../../validation/s1/licenses.mjs)从锁定生产依赖图提取许可证文件，并保留文件前部的改编声明；它不遍历随包 SDK 闭包，也不替代最终产物核对。依赖变化后可执行 `node validation/s1/licenses.mjs` 刷新 UI 依赖声明，再检查生成差异、保留的 SDK/Bun 说明和实际包内许可证。原始第三方证据不改写成项目自己的许可。

2026-09-30 的 [SDK 文件盘点](../../.scratch/infrastructure-closure/evidence/sdk-license-inventory.json)检查当前准备资源的 176 个包单元：152 个有根级 LICENSE/COPYING/NOTICE，另 24 个在包目录内也没有名称包含 license/copying/notice 的文件，涉及 libvips、puppeteer、onnxruntime、sherpa 等。这是指定资源的文件存在证据，不能由包元数据的 license 字段推断声明已经齐全，也不推断这些包不存在上游许可。公开分发前需根据实际产物补齐来源与义务核对；本轮不从网络拼贴替代原始声明，也不为此升级或裁剪 SDK。

## 未实施与待决定

D-40集成终端尚未包含在当前构建/包中。其node-pty ABI、TerminalHost入口、native/helper真实资源路径与将来的签名盘点见[终端契约 §8](../architecture/terminal.md#8-macos-原生构建诊断与实现约束)，验收见[终端验证](../validation/terminal.md)；不将现有OMP SDK包验证当成PTY包证据。

| 事项 | 状态 | 下一步所需条件 |
| --- | --- | --- |
| 项目自身许可证 | 待权利人决定；根目录没有项目 LICENSE，package 没有 license 声明 | 权利人确认许可与分发范围后再落地。第三方 notices 或 `private=true` 均不构成项目许可选择。 |
| 公开试用版本序列 | 待产品决定；目前保留阶段版本 | 根据真实已分发版本确定基础版本和递增预发布序列。`0.1.0-s4.0` 比同基础版本的 `alpha.N` 优先级高，不能直接重命名后声称升级；既有要求见 [重写规格](../../.scratch/rewrite-preparation/spec.md#八-执行顺序与完成标准)。 |
| 签名与公证 | 未实施；打包配置 `mac.identity=null` | 有公开分发授权后，确认签名身份、证书/密钥托管、entitlements、公证与实际安装体验。现有本地未签名包不能写为已签名或已公证。 |
| 自动更新 | 未实施；无 updater、更新 feed 或更新通道配置 | 在产品决定更新方式、渠道、版本/降级与失败策略后实现；当前只记录取得新完整应用的手动交付方式。 |
| 公开分发入口、贡献入口与安全报障 | 待公开分发范围决定；没有正式发布流程或入口 | 按确认的接收范围配置发布位置、反馈方式及维护责任，不在本轮代替用户公开发布。 |
| 最终第三方分发核对 | 尚未作为发行验收完成 | 核对实际随包闭包、许可证/声明、Bun 原始说明及产物差异；现有 notices 生成通过不等于完整发行验收。 |

这些事项不阻塞未公开的本地工程收口，也不自动阻塞独立 S5 工程规划；将来公开分发前必须处理依赖该决定的工作。SDK 升级、认证、诊断包 UI、执行指标、完整 Run Changes 和 M2 功能各有自己的规格，不能借分发准备提前开发。

## 交付时核对

Dev 交付记录实际源码目录、commit/WIP 状态、启动命令、数据目录及操作步骤；不要求 App 路径、包哈希或生产 build ID。固定包交付才记录包内 commit、dirty、build ID、App 路径/哈希和平台。两者均记录相关检查及审阅证据，分别写明工程通过、已交付待试用和用户认可。实际 CI、真实供应商、系统输入法、签名/公证及用户试用没有证据时保留未验证状态；不为填满记录而重复验证。

当前 [S3 退出队列放弃出口](../../.scratch/m1-s3-control-recovery/issues/09-quit-discard-decision.md)仍待决：停止保留并暂停队列，没有“放弃剩余输入后正常退出”动作。基建收口不修改退出/清队列策略，也不由本页解除恢复单写门槛或授权 S5/M2。
