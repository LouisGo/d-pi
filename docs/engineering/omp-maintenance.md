# OMP 接入与资源维护

本页说明固定接入的维护方法。领域定义见 [GLOSSARY](../../GLOSSARY.md)，配置合同见 [ADR-0002](../adr/0002-share-native-omp-config.md) 与 [基础契约 §3](../architecture/foundation-contracts.md#3-配置与首版认证b3)。实施、构建和试用状态由 [总看板](../status.md) 路由到所属规格；这里不维护第二份进度。

## 开发约定与产品运行资源

| 内容 | 使用者与事实来源 | 维护边界 |
| --- | --- | --- |
| 仓库 `AGENTS.md`、`.agents/skills/` | 开发 d-pi 的 Agent；[项目路由](../../AGENTS.md)选择适用的源码、测试和合同约定 | 是开发方法，不是 App 的内置功能、原生插件清单或运行配置。修改不表示用户已认可产品行为。 |
| 随包 OMP SDK、Bun 与依赖闭包 | 原生 OMP 进程；[package.json](../../package.json)、锁文件与 [资源准备](../../scripts/runtime/prepare-sdk.mjs) | 固定版本、未修改的官方源码；App 只拥有 [薄宿主](../../runtime/host.mjs) 和 [消费门控](../../src/platform/omp/consumption-gate.ts)，不复制原生执行、队列或历史。 |
| OMP 原生配置、凭据、skills 与扩展 | OMP 按 profile、环境及实际工作目录发现；薄宿主先设置原生 profile 再导入 SDK | 默认复用已有原生配置。App 偏好和数据目录独立；`D_PI_DATA_DIR` 只隔离 App 数据，不隔离 OMP。 |
| App 原生会话目录与绑定 | Main 管持久关联和会话目录，SessionHost 管连接；[宿主合同](../architecture/modules/runtime-host.md) | 原生历史仍由 OMP 写入。窗口重连与冷恢复不同；缺执行全周期单写证据时冷恢复只读。 |

开发 skill 与 OMP skill 可以采用相同的 Markdown 格式，目录用途不产生运行时隔离。固定 OMP 18.4.6 的 `src/discovery/agents.ts` 会发现项目 `.agent/skills`、`.agents/skills`，`src/extensibility/skills.ts` 默认启用 project agents 来源；薄宿主没有禁用原生发现。因此把 d-pi 仓库本身作为受信任项目运行时，OMP 也可能发现这些开发文件。是否加载以原生配置和发现规则为准，不能宣称“仓库 skill 永不进入产品会话”，也不把开发 skill 安装当作产品扩展安装。

新目录默认仅浏览，不为探测配置或 skills 启动项目 OMP/扩展。允许项目执行之后才进入原生加载路径；这项信任和 App 文件读取授权分开，均不构成工具沙箱。原生配置/扩展损坏时保留原配置并如实报告，不删除配置、改用全局 OMP 或新建替代原生会话掩盖失败。

## 固定 SDK 的证据入口

当前固定基线为 OMP 18.4.6 / Bun 1.3.14，声明和安装结果以 `package.json`、锁文件及 `pnpm check:environment` 为准。以下层次各自证明不同问题，不互相替代：

2026-10-01 用户认可[专属规格](../../.scratch/runtime-hardening-omp1845/spec.md)与[升级顺序](../../.scratch/runtime-hardening-omp1845/upgrade.md)，核实官方 18.4.5/18.4.6 原包导入失败后，授权固定 **18.4.6** 并仅在随包 staging 把 SDK 的 `./ratchet/prelude` 改为 `./ratchet/prelude.ts`。已安装官方包保持原样；准备脚本核对原文件 SHA-256 后修正一次，manifest 记录原文件/补丁哈希及授权日期。任何其他原生源码变更仍需另行决定。

| 层次 | 入口 | 覆盖与限制 |
| --- | --- | --- |
| 协议与应用行为回归 | `pnpm test`；[Decoder](../../src/platform/omp/protocol/frame-decoder.test.ts)、[原生 payload](../../src/platform/omp/protocol/native-frame.test.ts)、[收据/Host 集成](../../tests/integration/runtime-host.integration.test.ts) | 帧大小、碎片、开放字段、身份、ACK 后失败、事务和 unknown 不自动重发；模拟原生进程的测试不证明官方 SDK 当前行为。 |
| 脱敏录制回放 | `pnpm test tests/integration/native-evidence-replay.integration.test.ts`；[样本说明](../../.scratch/rewrite-preparation/evidence/sdk-boundary.md) | 官方固定 SDK 发出的真实帧，provider 响应来自本地 fixture。生产 Decoder/投影按不同字节碎片回放；保留顺序和 request ID，断言语义，不机械比较完整 JSONL。 |
| 固定 SDK 实际行为 | `pnpm validate:sdk` 顺序运行 [队列控制](../../validation/s3/sdk-control.mjs)、[ACK 后失败](../../validation/s3/sdk-failure.mjs)、[原生结果](../../validation/s3/sdk-outcomes.mjs)与[关联/settled](../../validation/s3/sdk-prompt-correlation.mjs) | 本地 provider、隔离配置和临时项目。核实停止保留队列、较新停止压过 continue、同 session 显式继续只消费一次，以及同 ID 的 ACK 后失败；不证明真实供应商、个人扩展或冷恢复单写。 |
| 随包集成与必要 GUI | [重写交接](../../.scratch/rewrite-preparation/handoff.md#验证与证据)、`node validation/s3/package.mjs <应用路径> --rewrite` | 对应构建的进程、资源、桥接、工具、窗口重载和中断/冷恢复。历史结果不是任意后来构建的验收；资源、原生路径或可见行为变化时才复核受影响路径。 |

前两层纳入常规工程回归。实际 SDK 和包内检查有原生资源前置条件，按适配/资源变化或升级运行，不因普通文档修改重跑。`D_PI_NATIVE_SMOKE=1 pnpm test src/modules/execution/host/native/native-smoke.test.ts` 是保留的官方 **CLI artifact** 双轮冒烟，需要 `pnpm runtime:fetch`，不替代 SDK 路线检查。

如需录制新证据，给实际 SDK 检查设置 `D_PI_NATIVE_EVIDENCE=<新的输出路径>`，可用 `SDK_ROOT=<独立 sdk 资源目录>`；不覆盖已经引用的历史样本。记录 SDK/Bun、平台、资源来源、fixture/真实供应商的区别、覆盖和未覆盖项，不写个人凭据、业务全文或私有项目材料。

## 资源失败与兼容边界

`pnpm runtime:sdk` 核对已安装包与声明版本，从受管理 pnpm store 复制锁定依赖并生成 manifest；`pnpm check:environment` 核对声明、随包包元数据、lockHash、平台、必要文件和启动资源的 SHA-256。[启动校验](../../src/platform/omp/resources/sdk-resource.ts)拒绝固定版本/平台不符、缺失、不可执行或被改动的 launcher，返回 `resource-incompatible`，不执行未知资源、不搜索外部 CLI 回退。

manifest 校验 Bun、host.mjs、gate.js、configuration.mjs、configuration-readonly.mjs、model-selection.mjs 六个启动文件以及修正后的 sdk.ts；运行时同时核对 coding-agent/utils 的实际包名、版本和入口真实路径属于资源根。准备在独占 staging 中运行真实 SDK import，拒绝替换正在使用的资源，失败保留旧完整资源。依赖闭包由冻结安装与准备过程提供，不是全闭包签名或发布完整性保证。SDK 错误的具体原因不能从通用 `resource-incompatible` 推断，开发环境用环境检查定位并重新准备；随包缺损重新取得完整应用，不自行迁移未知外部配置。

[资源守卫](../../src/platform/omp/resources/sdk-resource-guard.ts)让 Main 首次校验之前与 prepare 共用同一实际资源根的 SQLite 文件独占锁；Main 持有到退出，prepare 在准备结束后释放。因此重新准备前需关闭已经读取过该 SDK 的 d-pi，空闲原生会话也不例外。私有锁位于固定 `/tmp/d-pi-sdk-resource-guards-<uid>`，目录权限 0700、文件权限 0600，与 `HOME`/`TMPDIR`、App 数据库和 OMP 配置无关，不写只读的应用资源根。锁文件保存非秘密 PID/出生身份供核对；实际所有权来自内核锁，SIGKILL 后自动释放，旧记录不授权结束或接管其他进程。两个固定官方包按各自 `exports` 的 `import` 映射校验 `src/sdk.ts`/`src/index.ts`，不以 CommonJS `require` 条件解析原生 ESM 入口。

每个资源根保留一个小型锁库，不在运行时 unlink，以免已打开的旧 inode 与新文件形成两把锁。移动资源目录及自动化临时根会增加此目录中的文件；必要时只在所有 d-pi、资源校验与 prepare 进程均已退出后离线清理整个私有目录。SDK 根本身不能是 symlink；其父路径会按真实路径归一化。

原生事件使用开放 envelope，未知事件和未消费字段不会被升级成可信 App 命令。App 消费的 payload 字段才做类型校验；非法分片、预算超限或截断导致协议断链，不能当成成功结束。资源校验、schema 成功、调用 ACK 均不证明业务接受或执行完成。

## SDK 升级入口

本轮已按授权升级到 18.4.6，实际证据见[本切片](../../.scratch/runtime-hardening-omp1845/spec.md)。后续升级在自己的规格中先写候选版本和兼容问题，并按以下顺序复核；不为升级引入通用 AgentRuntime、Run 或检查点系统：

1. 核对候选官方源码、exports、Bun 要求、原生 profile/配置发现、历史格式和消费前 hook。协调包声明、锁文件、CLI artifact manifest 与启动兼容校验，不能只改一个版本号或自动迁移外部 CLI。
2. 运行已有协议、收据、Host 和录制回放。旧录制只证明 App 能解析旧事件；另运行候选 SDK 的实际控制与 ACK 后失败检查，必要时新增带版本说明的录制。
3. 复核 prompt ACK/后续错误关联、停止/继续竞争、同 session 队列消费、工具 payload、扩展 UI 生命周期及 unknown 不重发。缺少执行全周期单写证明时继续保留冷恢复只读，不能由升级成功推断可恢复写入。
4. 在受支持的 macOS arm64 准备干净资源、构建并验证包内启动/通道；涉及输出或交互时才补必要 GUI。保留真实供应商、个人扩展及其他平台的证据缺口。
5. 核对实际随包依赖和原始许可证文件，记录替换版本、兼容结论、构建与证据入口。许可证、签名、更新和公开分发仍按 [交付边界](local-delivery.md) 单独决定。
