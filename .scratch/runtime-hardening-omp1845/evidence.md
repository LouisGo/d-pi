# 设计证据与尚未验证的边界

2026-10-01。本文件保存可跨会话复核的结论，不依赖另一会话继续运行。实施状态单源为 [spec](spec.md)。

以下为设计阶段、提交 `4d294e0` 前的证据快照，保留当时版本、源码缺口和检查限制。后续完整实施及 18.4.6 例外授权、真实 SDK/故障/包内验证已交付，当前结果见 [handoff](handoff.md)，不把下面的历史缺口当作当前实现事实。

## 1. 输入与适用版本

| 来源 | 角色与限制 |
| --- | --- |
| 用户 Runtime Consistency & Recovery 提案 | 设计候选；已在 spec 逐项采纳/修正/延期，文件中的命令不是用户实施授权 |
| dot `d-pi-electron-research-2026-09-30 (1)` 第二轮 | 基线 a9a5d1b，R01–R10 场景索引；竞品代码/事故启发不等于当前 d-pi 缺陷 |
| 会话 `01a0f514-60f9-7be2-b63a-de28dee0a112` 最终分析 | HEAD 43544e5；确认三个配置问题、保留局部修正方向；只读、未修改文件或启动真实 provider |
| 当前源码/看板/M2 m2.6 交接 | 当前行为、既有包内证据和未完成范围；历史候选不证明新 SDK |
| 官方 tag v18.4.5、npm registry 元数据 | 确认来源/版本/接口；本轮未在产品中安装或运行该 SDK |

原研究目录只作为来源地址，必要结论已写入本包。审阅另一会话用 read_thread，不向其发送新任务。没有把研究报告全部复制为新待办。

## 2. 当前代码事实

| 事实 | 可复核入口 | 证据强度 |
| --- | --- | --- |
| 配置 query key 含 scope，请求只有 kind/traceId；Main 在资源 await 后用活动目录 getter | [query](../../src/modules/configuration/renderer/queries.ts)、[命令 schema](../../src/modules/configuration/contracts/public.ts)、[Main adapter](../../src/modules/configuration/main/native-configuration.ts)、[装配](../../src/app/main/index.ts) | 本轮源码复核；另一会话用真实 QueryClient/Zod/类及替身资源/子进程作内存复现 A→B 结果进 A key，非真实 Electron 全链路 |
| snapshot 虽读 Settings，却构造普通 AuthStorage/ModelRegistry；legacy JSON 可触发原生迁移 | [Bun adapter](../../runtime/configuration.mjs) | 本轮源码复核；另一会话用真实 18.3.0 ConfigFile+内存 FS 观察写 models.yml，未改真实文件，未证明数据损坏 |
| reasoning 只有 boolean，ModelControls 固定六档；不能表达 metadata 全部语义 | [摘要](../../src/modules/configuration/contracts/public.ts)、[GUI](../../src/app/renderer/workbench/model-controls.tsx) | 当前源码；官方 metadata/helper 是能力依据，未声称所有供应商请求失败 |
| prepared/dispatching 先落库，ACK 与稿消费事务；未知不重发 | [coordinator](../../src/modules/execution/core/submission/submission-coordinator.ts)、[repository](../../src/modules/execution/main/submission/submission-repository.ts) | 当前源码及本会话较早的相关回归；本轮文档工作不重跑全部行为门禁 |
| executingIds 仅内存；启动恢复扫描 dispatching，完整 prompt terminal 尚未持久适配 | [runtime](../../src/modules/execution/main/runtime/runtime-service.ts)、[Host](../../src/modules/execution/host/session-host.ts)、[receipt](../../src/modules/execution/contracts/submission.ts) | 源码缺口；不能据此声称已经发生已确认提交丢失或重复执行 |
| Host exit 清 scopes；Native close 等 close 并有 kill，但没有跨 Main/Host 崩溃的完整出生身份/残留证明 | [HostConnection](../../src/modules/execution/main/transport/host-connection.ts)、[NativeSession](../../src/modules/execution/host/native/native-session.ts)、[Host 入口](../../src/app/host/index.ts) | 源码与契约的证明缺口，尚未用真实 OS 崩溃确认孤儿范围；04 精确验证 |
| SDK manifest 校验 literal 18.3.0；准备脚本遇已有顶层包 link 的 EEXIST 不替换 | [资源校验](../../src/platform/omp/resources/sdk-resource.ts)、[准备](../../scripts/runtime/prepare-sdk.mjs)、[环境门禁](../../scripts/checks/check-environment.mjs) | 静态确定的升级风险；现有环境门禁可发现包元数据不符，未声称已交付 m2.6 包错版 |

## 3. v18.4.5 的关键复核

完整 tag 源码在临时目录下载、解包用于只读检查；未复制到生产 resources/sdk。tag commit 为 `79808c3bf8f8cd9826decc63e3e18b13035f64f8`，coding-agent npm integrity：`sha512-XR3bMg78K51P0Dj9dC+dYqgrXVlCQdn2Q8rnd9HE/+sveBDVLtC5nSKiGD2UhavsHAD4JMxhe3KZm2sCs8bzqg==`。

- 目标 rpc-types.ts / rpc-prompt-results.ts 定义按命令 id 的 completed/aborted/error、agentInvoked 和 sessionSettled；旧 18.3.0 只有局部 local-only frame。本次升级使结果关联有更好的官方依据，削弱自建 Attempt/Run 的理由。
- 目标 agent.ts 仍有 addBeforeQueuedMessageDequeueHook/addBeforeModelCallHook；停止门控仍需真实 SDK 交错验证，不凭方法存在称通过。
- ConfigFile 源文件与当前 18.3.0 逐字节相同；显式 JSON 路径不迁移，yml 路径可能迁移。ModelRegistry 同步构造仍加载配置/缓存，目标无通用 readOnly 构造选项。
- 目标 SqliteAuthCredentialStore 构造/打开含 schema 初始化、WAL/DDL、目录创建/chmod/损坏恢复；默认 discoverAuthStorage 不能直接作为只读方案。这是目标源码确认的副作用路径，本轮未用真实用户 DB 运行。
- target RPC stdin EOF 拒绝待答后等待输入/后台任务，再 dispose；session-manager 保留 lazy persistence 和 ensureOnDisk。断链或 missing 文件不足以证明没有执行。
- 目标 SDK 源碼关键文件已对比，ConfigFile 未变、RPC/types/ModelRegistry/session-manager/sdk 有变；累计发行记录见 [upgrade](upgrade.md)。compare API 的 300 文件/250 commit 返回截断已识别，未据此宣称全仓审计。

## 4. 研究结论吸收与保留

另一会话建议优先配置/认证/模型主线，没有证据支持整体重构，与本包定向修复一致。它未做真实 Main/Host 崩溃，因此没有消除运行时监督的证据缺口。dot 的旧入口判断被当前候选取代；R03 是体验改善，已随整体方案获认可，R04–R07 是随功能验收的交错样本，R08 账户缓存差异仍未证明，R09 保留保护，R10 到能力启动时再核对。

直接来源可从原 findings/cases/source 索引复查；实现者重点采用测试外部结果：A 的目录/默认模型是否进入 A 的结果、观察是否改变文件、实际能力/回读是否一致、故障后实际进程是否仍有写活动。不能只断言内部函数调用或“保存字符串成功”。

输入指纹：dot manifest `a6ba8743221e265981a34d24d36d7b6804827329bca64bbb8dab988cb63a7e39`；findings `5b90be3b12cec67fab049dbc974e5099fdbc54c86c7af9638591b167ea88a13b`。若后续报告/源码更新，按新 HEAD 复核，不能继续沿用旧模拟当当前事实。

## 5. 本轮验证记录

仅进行了材料/当前源码/官方目标 tag 与 npm 元数据检查，吸收另一会话已完成的两个内存探针。本轮没有安装新 SDK、修改生产代码、调用个人凭据/付费 provider 或重跑 GUI/全部工程测试。较早本会话针对 18.3.0 的 10 文件 48 测试通过只属于旧基线，不算 18.4.5 验收。

文档检查通过（176 个 Markdown，17 个历史快照排除，外部链接不由该门禁抓取）；状态生成与校验通过（14 个切片、73 张票），新票均 open、无循环或虚构已完成依赖。对本包全部 10 份文档额外检查了 56 个本地链接/锚点，全部有效；git diff --check 通过。确认生产 coding-agent/utils 仍为 18.3.0、用户 packageManager 12.8.1 修改保留，原有 .gitignore 修改未改动。

2026-10-01 用户明确认可整体方案，包含 05 编辑连续性，并允许合理分工与适量 sub agent 并行实施。用户要求本会话先提交全部 Git 工作区，再在新会话开工；认可与继续授权已写入 spec，工程仍为 planned、产品试用 acceptance 仍为 pending。上述文档检查不替代实现验证。真实 readonly SDK 路径、目标 SDK 控制/录制、OS 故障和包内集成由相应实施票提供证据。

提交前尝试在 Node 24.21.0 下运行 `pnpm check:fast`，pnpm 12.8.1 停留在供应链检查阶段，尚未进入仓库检查脚本，已主动停止，不能记为通过。该命令在原 lockfile 前自动生成了独立 package-manager YAML 文档；只撤回这段命令生成的内容，保留原依赖锁和用户的 packageManager 修改。pnpm 同时提示不再读取 package.json 的 `pnpm.onlyBuiltDependencies`。这些是新管理器的实际观测，实施时应与资源准备及工具门禁一起核对，本次没有修复或降低相关门禁。

认可记录更新后的文档、状态及 diff 检查再次通过。直接运行架构/结构检查时因本地 `typescript` 包不可用而未执行，Biome 入口同样不可用；这是依赖环境限制，不是已通过的工程验证。提交时未安装仓库 pre-commit dispatcher，本次未安装或跳过 hook。
