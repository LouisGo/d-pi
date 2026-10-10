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

## 包内容与体积门禁

2026-10-08 用户授权收敛打包体积，取代上一节历史盘点当时“不裁剪 SDK”的实施限制。当前 [准备规则](../../scripts/runtime/sdk-packaging.mjs)按已安装、锁定的运行依赖/peer/可用 optional 构建闭包，按包元数据 os/cpu 排除外平台 optional 包；ONNX native 只留目标平台架构。分发 source map、非源码目录的类型声明和固定 SDK 不执行的 CLI bundle 不入包。源码、浏览器工具的声明文本资产、模板、原始许可证、native、Bun 与 optional 推理/WASM 能力仍保留；不 strip 原生库或改 OMP 源码。

ONNX 1.30.0 的 macOS 两份 dylib 经 SHA-256 相同才合为包内相对链接，保留 dyld 的 `.1.dylib` 路径。Transformers 4.3.0 的 Node bundle 实际引用未声明的 `onnxruntime-common`，准备规则只补其已安装的锁定解析链接，不复制整个 hoisted store；真实 optional import 在隔离 Node 子进程校验，无模型下载。这些规则限当前已核实的版本；依赖升级应重新核实布局、资源与许可。

SDK 最大 650 MiB，完整 `.app` 最大 1000 MiB，均为普通文件逻辑字节之和；不跟随链接重复累计，不等同压缩下载量、APFS 物理占用或运行内存。[包后检查](../../scripts/packaging/after-pack.mjs)位于签名和分发文件创建之前，校验 SDK 平台/启动哈希、内部链接、必要应用入口、ASAR 不重复包含 `node_modules` 和实际体积；失败时打包命令非零退出。输出目录的 `package-size.json` 记录分项，SDK manifest 另记裁剪原因和字节。门禁不替代 native/GUI 或公开分发验收；本轮前后实测与限制见[体积规格](../../.scratch/package-size/spec.md)。

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

普通 Dev 交付在所属 spec 或票简记 commit/WIP、实际变化、验证和剩余问题；目录、启动方式、数据边界与操作步骤只补与既有入口不同或本次试用需要的部分，不另建 handoff，不要求包哈希或生产 build ID。固定包或明确独立交接才单独记录包内 commit、dirty、build ID、App 路径/哈希和平台。工程通过、已交付待试用和用户认可分别表达；当前范围相关的未验证项如实注明，不机械罗列无关发行事项或为填满记录重复验证。

2026-10-10 用户确认 [S3 退出策略](../../.scratch/m1-s3-control-recovery/issues/09-quit-discard-decision.md)：尊重退出意图，保存/清理有界，失败提示后继续退出；保留队列与未决收据，不新增放弃输入或自动重发。工程与试用证据见 [M2 当前追加授权记录](../../.scratch/m2-first-release/spec.md#2026-10-10-侧栏交互打磨与有界退出当前追加授权)，恢复单写门槛继续适用。
