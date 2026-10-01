# OMP v18.4.5 固定升级方案

2026-10-01 实施变更：用户要求核实原包失败后允许改用 **OMP v18.4.6**，并明确授权仅在随包 staging 将 `sdk.ts` 的 `./ratchet/prelude` 修正为 `./ratchet/prelude.ts`。18.4.5/18.4.6 新下载官方 tarball 均通过 npm integrity，SDK import 失败与网络无关；其余设计、所有权和范围不变。原目标18.4.5与原样包要求在此例外范围内被取代，包源与补丁哈希纳入 manifest。
2026-10-01。这是 [spec](spec.md)中的实施设计；原设计基线为 18.3.0；本次实施固定为 18.4.6，以下 18.4.5 官方调研保留来源，目标和原样包要求以本页首段的用户授权取代。

## 1. 来源、固定版本和变化范围

- 官方 [v18.4.5 release](https://github.com/can1357/oh-my-pi/releases/tag/v18.4.5)，发布于 2026-09-30 19:08:59 UTC，tag 源码 `79808c3bf8f8cd9826decc63e3e18b13035f64f8`。
- 官方 npm [coding-agent 18.4.5](https://registry.npmjs.org/@oh-my-pi/pi-coding-agent/18.4.5)与 [utils 18.4.5](https://registry.npmjs.org/@oh-my-pi/pi-utils/18.4.5)均可取。coding-agent 的 Bun engine 为 `>=1.3.14`，OMP 家族直接依赖声明为 18.4.5；锁定实际完整闭包。
- 基线源码为 v18.3.0 / `62bc57be1b03ef0802a33cf7f5f530e534527531`。GitHub compare 报 1517 个 commits，返回列表有分页/文件数截断，不能把一次 API 响应当完整差异。本轮使用目标 tag 完整源码，重点核对真实接入面，不宣称审完全部上游变更。
- SDK wildcard exports 保留，当前 sdk/settings/model-registry/rpc-mode 深入口有目标源码；消费前 dequeue/modelCall hooks 仍存在。源码存在不等于包内 import/执行已通过，01 用官方 npm/Bun 进行实际验证。

## 2. 与 d-pi 相关的累计变化

| 原生变化 | 接入策略与验收 |
| --- | --- |
| 18.3.1 起增加完整 prompt_result、结构化错误与 session_settled；18.3.0 只有局部 local-only prompt_result | 03 用真实命令 id 关联，保持 ACK/结束/闲置独立；不再根据 agent_end 给所有提交猜结果。[类型](https://github.com/can1357/oh-my-pi/blob/v18.4.5/packages/coding-agent/src/modes/rpc/rpc-types.ts)、[结果关联实现](https://github.com/can1357/oh-my-pi/blob/v18.4.5/packages/coding-agent/src/modes/rpc/rpc-prompt-results.ts) |
| 18.4.4 queuedMessages / queue_update / remove_queued_message | 复用原生快照；当前门控和 M2 队列票校验消费/取消竞争，不自建调度。[累计 changelog](https://github.com/can1357/oh-my-pi/blob/v18.4.5/packages/coding-agent/CHANGELOG.md) |
| 18.4.5 可选 messageUpdates=delta | 01 保持默认 full，不自动开启 delta；当前投影需要 accumulated message/partial，未来若改须另测。[RPC 模式](https://github.com/can1357/oh-my-pi/blob/v18.4.5/packages/coding-agent/src/modes/rpc/rpc-mode.ts) |
| 18.4.4 finalized assistant hook 可改最终文本 | 回放与真实 SDK 检查 message_end 最终文本和重读来源，不把最后一个 token 当正文终值。 |
| 18.4.5 账户目录、effort 路由/default 和认证 fallback 变化 | 02 使用 metadata/helper，实际回读；不随升级新增 Factory/Cursor 等 GUI 认证入口。已有可用配置继续复用。[能力 helper](https://github.com/can1357/oh-my-pi/blob/v18.4.5/packages/catalog/src/model-thinking.ts) |
| 18.4.1 中途文本流失败后原生继续、规则执行前检查等修正 | 保留 OMP 内部恢复与工具所有权；测试 App 无重复 prompt，不把原生内部 continuation 算 App 重发。 |
| 18.4.5 stdin EOF 先拒 pending UI，再 drain 已接受工作，最后 dispose | 不把 EOF 当立即停止；04 实测故障清理和后台进程。[RPC EOF 源码](https://github.com/can1357/oh-my-pi/blob/v18.4.5/packages/coding-agent/src/modes/rpc/rpc-mode.ts) |
| ConfigFile JSON→YAML 迁移未改；原生 store 初始化仍可写 | 版本升级不会自动解决只读缺陷，02 修查询整条链。[ConfigFile](https://github.com/can1357/oh-my-pi/blob/v18.4.5/packages/coding-agent/src/config/config-file.ts)、[credential store](https://github.com/can1357/oh-my-pi/blob/v18.4.5/packages/ai/src/auth/sqlite-credential-store.ts) |
| session-manager 持久化/旧消息兼容有变更；新会话仍有 lazy gate | 用旧/新、append 中、半条尾、missing 的 native history fixtures；无文件不证明未执行。[session-manager](https://github.com/can1357/oh-my-pi/blob/v18.4.5/packages/coding-agent/src/session/session-manager.ts) |

## 3. 版本与资源必须一起改

01 同批协调：

- `package.json` 的 coding-agent 与 pi-utils 精确到 18.4.6，`pnpm-lock.yaml` 从官方 npm 生成并保留 integrity；用户原有 packageManager 变更不顺手回退或提交。
- `scripts/prepare-sdk.mjs` 准备新的完整闭包，不能因旧 @oh-my-pi 包 symlink 已存在就保留旧链接。当前 `EEXIST` 分支是升级风险，环境门禁可以发现不符，但准备命令本身必须可修复。
- 先写同资源根的 staging 目录，完成复制、版本/文件校验和 manifest 后切换；必须在无受管 OMP 使用该资源时替换，不能原地删除运行中加载的闭包。失败保留旧完整资源，避免半份新旧图混用。
- `src/platform/omp/resources/sdk-resource.ts`、环境门禁、资源测试和必要 fixture 版本同批更新；运行时校验实际 coding-agent/utils 包元数据、入口解析属于资源根、平台与 launcher hash。manifest 的新版本号不能代替实际包身份。
- manifest 继续包含 Bun、host.mjs、gate.js、configuration.mjs、lockHash 和 SDK 版本；准备脚本对两次连续运行和旧资源升级都得到同一目标包解析。当前不新建全闭包签名系统。
- 审核 SDK 18.4.6 新闭包中的 native addon/平台资源与许可证，重新准备 macOS arm64 资源。不替换用户机器上的 OMP CLI、profile 或原生配置。
- 现有 CLI artifact 是另一条保留的 smoke/历史证据路径。只在继续执行它时下载官方 18.4.6 artifact、核 SHA256SUMS 并标注版本；不能让 18.3.0 CLI smoke 冒充 SDK 18.4.6 验证，也不把 CLI 安装变成产品前置。

## 4. 顺序、验证和停止条件

1. 固定官方包/源码和现有证据基线，在隔离资源根建立 18.4.6 SDK 闭包；先失败测试保护旧链接和版本错配，再修准备逻辑。
2. 跑 App Decoder/Host/收据/投影/历史相关既有回归，保留旧版本样本；目标版本新增脱敏录制，真实 SDK 使用本地 provider、临时 HOME/profile/项目/数据库，禁止继承个人认证。仅设置 D_PI_DATA_DIR 不足以隔离原生环境。
3. 跑现有 `pnpm validate:sdk` 的目标版本路径，核实 stop/continue/queued work 与 ACK 后失败仍成立；原测试只等待旧式 response error 时，依据新版 terminal 语义修断言，不通过删除失败断言使门禁变绿。
4. 检查短/长帧、prompt result、queue_update、交互 cancel、最终正文和未知字段；真实结果进入 [design](design.md)的 Main 持久链，资源升级本身不开放冷写恢复。
5. 集成后统一运行必要 `pnpm check`、`pnpm build`，再用干净源码/资源准备 macOS arm64 候选，执行现有包内双 Thread/重连/冷只读路径和受影响 GUI。

遇到公开 API/hook 消失、只能改 OMP 内部才能保证停止、Bun 1.3.14 不兼容或 native addon 无法打包时，保留具体源码/错误与最小失败样本，暂停对应替换，不能自动换全局 CLI、fork SDK 或重写 Agent。独立身份修复/文档/其他票继续。

Node 使用仓库 24.21.0，工具门禁按现态检查。当前 packageManager 修改与既有固定工具约定不一致，不纳入本方案擅自改版本；实施者记录实际使用的管理器，保持有意的用户修改，不能跳过 check:tools 或把其它检查冒称整条 pnpm check 通过。

## 5. 回退与历史证据

保留 18.3.0 干净构建和本地隔离资源/数据快照用于对照；切换前停止受管进程。源码/资源回退不等于可以把已被新版 OMP 写过的原生数据交给旧版执行。只读查询不写原生数据，真实新版执行可能改变它的内部 schema；测试用独立原生根，个人配置不做自动降级/回拷。

若 03 增加 App migration，升级前创建可恢复备份，旧 App 遇新 schema 拒绝不兼容写入；不能删库“恢复成功”。回退记录必须列明代码、资源、App DB 和原生数据分别可否恢复及证据。只有通过的固定样本才称兼容，不承诺所有旧 CLI 扩展。

历史规格/录制中的 18.3.0 继续保留原版本说明；更新现行维护合同和本次交接到实际 18.4.6。D-02/D-03 的所有权与原生配置复用不变，用户指定升级目标不等于用户认可全部新行为。

## 6. 实施身份（2026-10-01）

实际 coding-agent/utils 均固定 18.4.6，Bun 1.3.14；同系列直接依赖来自冻结锁文件，完整 graph 准备为 112 个依赖单元。官方 tag 为 `8b25ad4a05625dde65df41d057756b4815f4837c`；新下载两版 tarball 的 npm integrity、tarball SHA-256、SDK 原文件/补丁哈希与唯一授权见 [package audit](evidence/sdk-package-audit.json)。18.4.6/18.4.6 都因 prelude 同名文本资源导入失败，网络不影响已验证本地字节；用户明确允许单处导入修正后，目标 import、SDK 全控制/失败/结果/关联验证通过。随包 manifest 包含六个启动文件与修正 sdk.ts，官方安装源不改。Node 24.21.0/pnpm 12.8.1 按用户现有声明使用；pnpm 12 多文档锁和 allowBuilds 迁移保留严格构建准入，只允许已审阅的固定 Bun/Electron/esbuild 脚本。资源准备旧 link/空目录/重复/复制失败/原文件变更/活跃使用者回归均通过。
