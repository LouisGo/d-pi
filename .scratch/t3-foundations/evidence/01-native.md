# 01 Native Scope 与确定性回放工程证据

日期：2026-10-07。固定实施基点 `851d3e59aa4782266a50a7e55bb63048ec5459dc`，工作树 `/Users/louistation/.codex/worktrees/t3-native/d-pi`，分支 `codex/t3-native`。本文件是工程证据，不修改 spec/票状态，不表示用户认可、供应商验收或发布。

## 独立结论与采用的源码

以 T3 `10f39eb9ac80c9a4b7f5097575dd2addc3b6f631` 的 `apps/server/src/orchestration-v2/Adapters/PiRpc.ts:35–54,279–303,329–427,444–472` 核实错误类型、及时登记 finalizer、owner scope 与请求失败释放关联；以 `testkit/ProviderReplayGate.testkit.ts:29–117`、`CodexAdapterV2.testkit.ts:255–276` 核实 reached/release/releaseAll。固定 Pi testkit 自身没有 Gate 接线，未把材料描述当作已存在的实现。ProviderSessionManager 的 detach-close 等候预算不能替代 d-pi 的真实 close/groupStopped 证据。

安装的 Effect 为锁定 4.0.0；`src/internal/effect.ts:1114` 核实 tryPromise 的 AbortSignal，`5624–5635` 核实 forkIn/完成即撤销 Scope finalizer，`3947–4011` 核实 Scope.close 语义，`6316–6325` 核实 live sleep 没有 unref。实现采用 namespace imports，仅在允许的 execution Host 中使用已有 Scope/Fiber/tryPromise/callback API；保留局部 Node timer callback 的 unref，不新增全局 Service/Layer/Clock、unstable API 或权限例外。

研究没有证明原实现泄漏，因而不宣称修复已证泄漏或 CPU/延迟提升。本切片的正向收益是故障原因到达可信 Main、局部等待取消真实释放关联槽、Host 截止任务有唯一 Scope，以及可确定推进的跨层回归。

## 最终行为与边界

- 内部 `NativeRequestFailure extends Error` 具有有限 summary，至少区分 spawn/protocol/write/timeout/interrupted/unavailable；安全 operation 目录、UUID requestId 和 timeoutMs，预算细分 request-limit/input-budget。disconnect 在 Scope.close 前保存原运输原因，纯 interrupt 不覆盖 protocol/write/spawn。原始 Error/Cause、JSON/Zod 原值、stderr、stack 不进入 Host/Main DTO。
- `contracts/native-failure.ts` 使用 strict Zod union，Main `runtime-service.ts` 只映射既有 causeCode 的八个固定目录。控制操作的 caller trace 与真实 connectionGeneration/processInstanceId 延续既有上下文；不把 native RPC requestId 冒充 App trace。未知本地编码异常不被归类为原生写入故障；FrameDecoder 同步 consumer 的应用缺陷以有限 unknown 中断、没有 nativeFailure/causeCode，不能冒充原生协议损坏。合法 response.success=false 保持既有业务结果解释。
- 单 Host `HostScope` 管刷新/子 Agent native read、控制请求、默认回答、ACK/correlation deadline 与 evidence retry。close 幂等、拒绝新任务，完成的 scoped fiber 自动撤销 finalizer并释放 handle 引用；关闭只取消本 owner。AbortSignal 桥实际 interrupt 本次 Native request、清 pending，不发送原生 abort/stop。
- 保留 refreshFlight singleFlight、每次 await 后 observationVersion、lastDispatchId/afterSubmissionId、closing/disconnected 检查；保留 callback deadline 的 ref/unref 策略。原 PendingInteractions/NativeSubagentObservation 保留其状态规则与 dispose，文件 stat 等没有取消入口的 I/O 只隔离迟到结果，不宣称物理取消。
- 断链停止自动 evidence deadline，同时保留有界 cache 给明确 replay-evidence/confirm；重播仅 send facts。Native Scope 的 stopChild、3 秒升级、真实 child close、身份核对组清理及 groupStopped 规则未改。任务 Scope 完成不删除 SQLite 收据、不撤销 ACK、不把执行 unknown 改为完成或可写。

## TDD 与回放

真实行为缺口的红灯及绿色命令：

| 目标 | 修改前/实现前的观测 | 实现后的验证 |
| --- | --- | --- |
| 协议故障保留原因 | `pnpm test --run src/modules/execution/host/native/native-session.test.ts -t 'reports confirmed process close once'`：2 failed；只有 Native connection interrupted，缺 failure | NativeSession 最终 14 tests passed，包括 2 种协议破坏、重复 close 与真实进程 close |
| 局部取消释放槽且不发 abort | `-t 'cancels only the local wait'`：旧方法不接 signal，目标测试 5000ms timeout | 64 槽里取消 1 个后 inspect 可立即请求，其余 63 真实响应完成；原生写序列没有 abort/重发 |
| 断链停止自动 evidence retry | `-t 'ends automatic evidence waiting'`：fake clock 推进后仍自动发出 1 个 submission fact | Host 最终 28 tests passed；自动发出 0 条、显式 replay 保留原 fact，native write 为 0 |
| 非法控制 data 安全归因 | `-t 'malformed control\|input-budget'`：缺 protocol 与 caller 操作 context | Host 与 Main 回放实际运行 decoder/data schema，caller trace 对应 runtime:stop unknown / native-protocol；秘密注入值不进入诊断 |
| 冻结提交预算原因 | 同一命令：write 中断退化为 operation unknown，缺 input-budget | 保留 Native write 的 input-budget summary 与原 submission unknown，不重发 |
| 编码缺陷不冒充运输原因 | `-t 'releases the request budget'`：循环对象的本地编码异常被 NativeRequestFailure(write) 覆盖 | 先安全编码，未知编码异常仍普通 Error；输入预算/64 请求预算/30000ms timeout/迟到响应仍通过 |
| 应用观察者缺陷不冒充协议故障 | `-t 'application observation defect'`：合法帧的应用 observer 异常导致 NativeRequestFailure(protocol) | Native 真实 Node 与 Main/SQLite 回放保留 unknown，没有 nativeFailure/causeCode；不传播异常全文或重发 |

新回放 `tests/integration/native-scope-replay.integration.test.ts` 共 6 个测试，全部通过。合成样本仅替换 child_process.spawn、stdio、进程身份与组终止接缝；实际 FrameDecoder/NativeFrame、NativeSession、SessionHost、ConversationProjection、RuntimeService、SubmissionCoordinator、SubmissionRepository、DraftRepository 和 AppStorage 的 SQLite 均运行。每 owner 有同一实际入站/出站/Gate/exit cursor，禁止未知 outbound；Gate label 唯一、reached/release 分离、完整消费断言与失败 cleanup releaseAll；同 batch 一次 write，不插 await。没有 sleep 制造回放时序。

1. ACK 后 protocol loss：真实 ACK 事务后 state=acknowledged/outcome=unobserved；损坏字节经 decoder 后 outcome=unknown，较新 draft 保留，已到 assistant 内容可读，prompt 只写 1 次。物理 child-close 是后续独立 Gate；退出后执行结果仍 unknown，hasActiveWork 仍 true，未借清任务取消安全边界。
2. tool 开始后 Stop：分别执行 Stop reply 在尾事件前/后两种顺序。Stop acknowledged 与 prompt_result aborted 独立；tool/message 尾内容实际进入 projection；prompt/stop 各写 1 次，真实 scope-closed 到达后有终态的工作可回收。
3. A/B 独立 owner：A 断链取消 held get_state，B 的 held get_state 保持；A 的旧字节故意使用 B 的请求 UUID，不能完成 B 的等待或污染 B projection。合法但旧 generation 的 operation-result 被 Main 拒绝；合法 ACK DTO 携带 A 的完整 target/B 的 receipt identity，实际 coordinator 返回 stale-event，B SQLite/draft 不变；释放 B 的 Gate 后当前查询、ACK 正常完成。
4. 非法控制响应：真实 native response 携带非法 data 经 Host schema，Main 记录原 caller trace 和固定 native-protocol，不含注入值。
5. 本地 projection 缺陷：合法 native frame 触发 application consumer 异常，实际 Native/Host/Main 将其保留 unknown，不产生 native-protocol 等已知 causeCode；未 ACK 的 SQLite receipt 与 draft 保留，prompt 写 1 次。

回放开发期间的 harness 不完整（最初缺 subscription 初始读）、把 unknown receipt 错预期为退出后可回收、以及错误的测试收集回调曾产生测试失败；这些已纠正，不作为产品缺陷红灯。新增正确行为的 Scope/DTO/隔离补测不伪造原基线红灯。

## 检查结果

- 环境：frozen install、Electron installation 与 `pnpm runtime:sdk` 完成，SDK 18.4.6 / 112 dependency units；不修改 lockfile。
- 受影响范围：`pnpm test --run src/modules/execution src/modules/conversation/host tests/integration/runtime-host.integration.test.ts tests/integration/runtime-causality.integration.test.ts tests/integration/native-scope-replay.integration.test.ts`，190 passed / 1 skipped；包括原同 decoder batch 因果与 SQLite 写失败后 facts 重播。
- 最终全仓 `pnpm test --run`：145 test files passed / 1 skipped，857 tests passed / 2 skipped（当时 NativeSession 为 12 tests）；随后新增真实 spawn failure/pre-start unavailable 与应用 observer 缺陷检查，以及对应 Main 回放，NativeSession 14 tests 全绿。2 个 skip 为默认关闭的 fixed CLI native smoke 与现有平台特定项。
- 最后 observer 调整后，NativeSession/Host/HostScope/三类回放/既有 runtime-causality 的 5 files / 73 tests 通过（NativeSession 14、Host 28、Scope 3、回放 6、causality 22）。
- `pnpm typecheck` 全进程通过；集成回放默认不在 root tsconfig include 中，另用继承相同严格选项的临时 config 显式 typecheck，通过。
- `pnpm lint`：544 files 全绿。`pnpm check:architecture`：388 source files 全绿；`pnpm test:architecture`：35 passed。该测试主动制造 SIGTRAP/缺 oxlint 的负例输出是预期测试内容，测试整体通过。
- `pnpm check:documentation`：291 Markdown files 全绿；`git diff --check` 通过。父 Agent 统一生成 structure/status，因此本 worker 未写聚合报告，也不声称 `pnpm check` 已整体执行。
- `pnpm build`：Main/Host/preload/Renderer 全部完成。Rollup 对既有 Zod PURE 注释与大 Renderer chunks 的警告仍在，不因此修改无关代码。
- 全仓测试中已有固定 SDK/隔离 localhost 的 configuration/subagent 验证通过；NativeSession 的受控真实 Node 进程、继承工具 heartbeat/组清理、EOF、startup timeout 与 close 等测试保留并通过。

## 未覆盖与集成注意

未运行真实远端模型供应商、真实账户登录、macOS Electron GUI 关窗/退出、发布包验收或冷恢复单写验收；合成 replay fake PID/kill 不提供 OS/process-group 证明。真实 Node 进程和固定 SDK localhost 测试只能支持各自层级。

Main producer/diagnostic writer/reader 的八个 causeCode 白名单由主 Agent 合并负责；本切片没有改共享 schema/writer 或 application.ts、Renderer/input。commit 中包含本证据文件，可用 `git show <implementation SHA>:.scratch/t3-foundations/evidence/01-native.md` 取回。完成后主 Agent 统一评审、集成并更新任务状态。
