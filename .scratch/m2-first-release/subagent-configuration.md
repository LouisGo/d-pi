# 当前 Thread 后续子 Agent 默认配置

日期：2026-10-02。范围：M2 05b / D-27 的原生实例内配置适配、命令/结果合同、Main/Host/Renderer 接线及 GUI。工程已完成，验收仍 pending；分层证据及限制见下文，没有把自动化通过记为 M2 产品认可。

## 固定源码依据

- SDK 固定 `@oh-my-pi/pi-coding-agent@18.4.6`。`task/settings.ts` 的 `cfgTaskAgentModelOverrides.override(settings, record)` 与 `.clearOverride(settings)` 只改变该 Settings 的 runtime layer，不保存共享配置。18.4.6 的 API 已转为注册 Setting handle；历史 `Settings.override(path,value)` 表述不能作为现版本方法名。
- `task/structured-subagent.ts::resolveEffectiveSubagentPolicy` 在每个新 spawn 前 `reloadFromDisk()` 并读取上述 Setting；resolver/executor 优先级保留：显式请求模型 > Settings 中对应 Agent 覆盖 > Agent 定义/原生默认；显式 spawn effort > selector `:level` > Agent 档位默认。
- UI 的正确承诺是“当前 Thread 后续子 Agent 默认配置，显式模型/档位请求仍按原生规则”。不锁定已启动子 Agent，不改主模型，不复制 resolver，不写共享 task 设置后再改回。
- 思考档位由官方 `getSupportedEfforts`/`requireSupportedEffort`、`ThinkingLevel.Off` 与 `formatModelSelectorValue` 处理；default 不附 `:level`，沿原生后续解析。
- Agent 列表来自官方 `discoverAgents` 和实例 `getSessionAgents`；effectivePatterns 由官方 `resolveAgentModelSelection` 计算，不把这些 patterns 当作某次已启动 child 的执行证据。

## 接口和拥有者

`runtime/native-subagent-configuration.mjs` 的 `createSubagentConfiguration(session)` 由一个活的 `AgentSession` 拥有，提供 `snapshot()` 和 `apply(command)`；调用由 Host 原生控制序列串行化。设置只传 `{ kind: 'set', agent, provider, modelId, thinking }`；移除只传 `{ kind: 'clear', agent }`。结果包含 `{ agents: [{ name, description, override, effectivePatterns }] }`；override 只描述本适配实例显式设置，null 不代表共享原生配置不存在。

模型必须在实例 ModelRegistry 中存在且有配置认证；metadata 更新后核对真实 effort/off 能力。拒绝不清除先前已接受覆盖。清除一个 Agent 保留本实例其他 Agent 的覆盖；清除最后一个丢弃 runtime layer，后续回读当前原生默认。覆盖随实例结束释放，不额外保存为 App 数据或跨重启恢复事实。

App schema 在 `src/modules/configuration/contracts/subagent-configuration.ts`，thinking schema 复用拆分后的 `model-selection.ts`。共享接线新增 `d_pi_subagent_state` / `d_pi_subagent_config`，包装、SDK hash 和 App 目标/代次/trace 校验由主 Agent 完成。

## 验证

进入常规 Vitest 的 `src/modules/configuration/main/subagent-configuration.test.ts` 为 Bun 测试创建 allowlist 环境，使用固定包内 SDK，临时 suite 在 `resources/sdk/.subagent-test-*`，finally 清理。Node runner `runtime/native-subagent-suite.mjs` 负责隔离与清理，TS 包装只经 execFileSync 启动 runner，不跨 TS 导入未声明的 mjs。测试环境使用独立 HOME/OMP 根/cwd，不承接个人凭据，不访问计费供应商。真实生成只到 localhost fixture。

逐行为 TDD：

1. 首个测试先以无行为适配跑出政策仍为 `fixture/default`，预期为 `fixture/child:high` 的真实红灯；接入原生 Setting 后绿色。检查并行两实例隔离及主模型不变。
2. 清除行为测试先因旧实现把 clear 当 set 返回 `model-unavailable` 红灯；实现 clear 后恢复原生默认，同时保留另一 Agent 覆盖。
3. 同名发现/实例定义测试先观测重复条目红灯；投影按原生 `getAgent` first-match 合并后绿色，列表与真实 policy 一致。
4. 其余已有正确路径补回归，未伪称新红灯：非法/缺认证模型、无效 effort、requiresEffort 拒绝 off、显式 spawn 模型原生优先级、default/off 意图、外部原生 config.yml 更新后清除回读。

真实固定 SDK 集成：同 cwd、同 ModelRegistry/认证根下创建两个 loaded `AgentSession`（独立 Settings），并行 `runStructuredSubagent` 创建两个真实 child；两个不同 localhost fixture provider 的实际请求分别为 `fixture/alpha` + high 与 `fixture-other/beta` + low，所有生成请求保持所属配置；两个主模型仍 alpha，原生 models.yml 原文不变。与“App 中两个 Thread 接线正确”的证据分开，App 全链集成由主 Agent验证。

当时运行：`pnpm exec vitest run src/modules/configuration/main/subagent-configuration.test.ts`（其中 9 项固定 SDK 行为测试）；定向 Biome 通过。后续 Main/Host 目标身份、IPC/schema、Renderer 操作及 packaged SDK 的工程证据已补齐，见下文；真实个人账户跨供应商、原生视觉和用户试用仍未验收。

补充事实：`Settings.loadReadOnly` 的 `reloadFromDisk` 是 no-op，因为不启用 persist；用于读取摘要的只读实例不能冒称活实例热重读。本适配生产输入为 createAgentSession 返回的活 Session，外部更新回读测试使用 SDK `Settings.loadIsolated`，临时覆盖持续由原生 runtime layer 保留。

## 随包资源接入

`scripts/runtime/prepare-sdk.mjs` 复制并计算 `native-queue.mjs` / `native-subagent-configuration.mjs` 的 SHA-256；`sdk-resource.ts` 的 manifest 要求两个必需 hash，使用既有生命周期 guard 后逐文件检查。就近资源测试先证明修改新 queue adapter 时旧资源校验仍放行（真实红灯），新增 manifest 字段后两个 adapter 篡改均拒绝，恢复原文均重新放行。

定向资源测试、Biome 与 `pnpm check:architecture` 通过。`pnpm typecheck:core` 在并行接线期间发现另一 owner 的 `queue.ts` 使用无全局 TextEncoder，已通知主 Agent，未替他修改合同。最终全仓检查与 SDK 准备结果由主 Agent统一记录。

2026-10-02 集成后：`pnpm runtime:sdk` 成功准备固定 SDK 18.4.6 / 112 dependency units，新 adapter 已复制/hash。真实包内 host 的隔离 smoke 自动覆盖 startup ready、同 id/command 的 state、跨 fixture provider set、clear 回读和缺模型的 success:false / model-unavailable；9 项固定 SDK 测试及两个定向 Vitest file 通过，typecheck:core 通过。完整 tsc 曾只剩另一 owner 的 GUI test Promise.withResolvers / ES2023，主 Agent继续统一修复检查。

## Host / Main / SQLite 协议集成

新增 `tests/integration/native-queue-configuration.integration.test.ts` 的 23 项集成测试使用真实 SessionHost、HostConnection、RuntimeService 与临时 SQLite；仅 NativeSession、utility 运输和资源定位为受控外部替身，不重跑上述真实 SDK 生成样本。覆盖：

- begin-edit 接纳后不伪造持久 destructive journal；delete 在原生派发前落盘 dispatching 并保留原文，queueState/subagents 在对应 ACK 前发布；主模型保持原值。
- 原生明确失败保留原因码；success 缺合法 data 不得 ACK；请求 reject、实际 HostConnection 超时以及断链为 unknown，均只派发一次。
- 同 trace 的错代、错 operation 或缺 status 响应不能唤醒 waiter；格式错误、缺身份与过期命令在原生写边界前拒绝。
- unknown 后的 inspect 等待新鲜原生 control，发布新 snapshot 后再回 inspect ACK；只设置已核对标记，原 durable receipt 保持 unknown，不自动重发。读取失败不设置该标记。
- 子 Agent 配置 unknown 后，只有 control 回读成功而 subagent 回读失败不能声称配置已核对。

验证命令：`pnpm exec vitest run tests/integration/native-queue-configuration.integration.test.ts`、定向 Biome 和 `pnpm exec tsc --noEmit` 均通过。正常 begin-edit 错误地 finish 不存在 journal、waiter 只按 trace 唤醒的源码缺口已向主 Agent报告，由主 Agent修复公共代码；上述测试落地时修复已并行生效，因此记录为集成回归，不伪称新红灯。GUI 的实际操作/视觉及用户认可继续由主交接单独说明。

## GUI 工程接入与收口

`src/app/renderer/workbench/subagent-controls.tsx` 消费真实 RuntimeModel 的展示状态和 `configurationSnapshotQuery`，按同一 Thread 身份读取可用模型与原生档位；ThreadWorkbench 以 threadId 挂载 key 隔离未提交选择。沿用现有 Operate 折叠区和组件，不新增页面、共享配置副本或查询写副作用。

- 主执行 busy 不阻止后续 spawn 默认配置；ready、已信任与有效 connection 必须成立，pending 禁重复。set/clear 只影响当前实例指定 Agent，成功后显示原生回读，failed/unknown 保留选择并显示未确认。
- 原生 effectivePatterns 与本实例 override 分开显示；override 为 null 时沿共享原生默认，effectivePatterns 不冒称已启动 Agent 的实际执行。原生描述保持原文，显式 spawn 的模型/档位仍按官方优先级。
- default、off、原生 effort 按所选模型 metadata 派生；requiresEffort 不给 off，能力变更后要求有效选择；空目录仍能清除已有覆盖。刷新同时 inspect 与重读同 Thread 模型目录，不写配置、不重发未确认命令。

14 项真实 RuntimeModel 挂载测试覆盖：busy 可操作、状态/信任/连接门槛、Agent 消失不串草稿、原生能力变化、双 Thread 同 QueryClient 隔离、set/clear 和 default/off/effort、空模型目录、pending 重复点击仅一次、未知结果不自动重发、只读刷新、unknown 未核对时禁止新写操作。缺行为逐项先红后绿；既有正确行为补回归，没有伪造红灯。Biome 和设计检测通过，ES2023 本地 Deferred 替代 Promise.withResolvers。

2026-10-02 收口复核：隔离入口 `node scripts/testing/test.mjs vitest` 下 GUI 13、Host/Main 16、队列仓储 8、6→7 存储 2 与重开恢复 1，共 40 项通过。固定 SDK wrapper 当时因用 cwd 定位 `runtime/native-subagent-suite.mjs` 在隔离 work 下找不到脚本而失败，未到原生行为；已通知主 Agent 修复入口。直接运行 `node runtime/native-subagent-suite.mjs` 使用其自身 allowlist 隔离环境，9 项固定 SDK 行为及 prepared Host smoke 全部通过。最终统一入口/全仓检查由主 Agent记录，不把脚本定位失败解释为原生功能失败或隐去。

[05b 工程票](issues/05b-thread-subagent-configuration.md)收口；候选包身份、实际 GUI 视觉、真实账户跨供应商与用户认可未由上述自动化证明，验收仍 pending。

收口补充：unknown 且尚未 reconciled 时，apply/clear 及配置选择禁用，保留刷新核对出口；原生配置核对成功后允许新的明确操作，显示“已核对”并保留之前 unknown 事实。真实 React 回归先分别证明未核对按钮仍开放、核对后仍显示旧警告的两个行为红灯，再最小实现修复；14 项通过，完整 tsc 通过。核对不会确认之前操作或自动重发。

常规入口复核：配置 Agent 随后修复 wrapper/suite 的资源定位，统一基于 `import.meta.url` 定位 runner、源码和 SDK；重新运行 `node scripts/testing/test.mjs vitest src/modules/configuration/main/subagent-configuration.test.ts` 通过，入口内部执行上述 9 项真实固定 SDK 样本。此前定位故障已解决，不保留为当前 blocker。文档引用门禁和组件定向 Biome 通过；实际视觉/用户验收边界不变。

## Main 控制边界与容量收口

在真实 Main / Host / SQLite 边界追加逐行为红绿证据：

- unknown 未核对时，两个操作类别原先允许新的 trace 写入；测试先观测 resolve 而不是拒绝，再在 Main 阻止新写，fresh inspect 后允许明确新命令，仍保留旧 unknown 收据。
- 原生生成已 idle 但队列/配置控制仍 pending 时，`hasActiveWork` 原先为 false；测试先红，再把两类 pending 控制纳入生命周期占用，ACK 后才能 idle close。
- 同 field 两个不同 trace 并发 execute，目录身份的 async 检查原先使二者越过预检查并派发两次；两个类别分别先红，再在 await 前后重验 pending/unknown、phase、连接与代次，后者被拒绝。
- 一个新队列 trace pending 时重复旧已 ACK trace，原先把当前 pending 投影冲成旧 ACK；测试先红，幂等分支仍核对旧命令身份，但当前投影属于其它 trace 时只返回当前 view，不能解锁第三个写操作。同 trace 仍返回原有状态，不重发。
- 子 Agent 回读失败但 control 成功时，inspect 原先错误地标记已核对；测试先红，由主 Agent修复 Host 新鲜状态判断后通过。

`app-runtime-service.integration.test.ts` 另补容量行为：无 App receipt、legacy 镜像 16 项、queueState 可见 16 项 + hiddenCount 4；旧 admission 返回 prepared 的真实红灯后，Main 优先按 queueState 总数计 cap，缺该快照时 fallback legacy。现在新 prepare 返回 queue-full，不产生收据，不派发原生。

最终定向常规隔离 runner：`pnpm test --run tests/integration/app-runtime-service.integration.test.ts tests/integration/native-queue-configuration.integration.test.ts src/modules/configuration/main/subagent-configuration.test.ts`，3 files / 49 tests 通过（25 + 23 + 1，wrapper 内为上述 9 项 SDK 样本）。`pnpm exec tsc --noEmit` 与相关 5 文件 Biome 均通过。完整检查与候选构建由主 Agent统一收口，以上没有证明视觉或用户验收。
