# S3 控制、交互与恢复

2026-09-28。当前授权：用户基于 S2 边界巩固正式开启 S3，要求核对决定、S2 交接与固定官方源码，完善规格、拆票、按 TDD 实现并验证，交付试用后本地 commit，不推送。不扩展 S4/M2。官方 OMP 保持未修改，unknown 不自动重发，禁止强占恢复。

## 推进与交接

- 起点：`215419a`，干净工作区，S2 领域/生命周期巩固已完成，见 [基线](../s2-boundary-hardening/spec.md)、[S2 交接](../m1-s2-submit-read/handoff.md)。旧 S2 包不是当前源码产物。
- 受影响决定：D-02/D-03 原生所有权及随包、D-11 队列/干预/停止、D-21/D-22 诊断、D-24 恢复/收据、D-25 信任、D-28–D-35 功能生命周期与已定技术栈；均继续有效。
- Q1 已确认（2026-09-28）：用户明确“使用官方 SDK 薄宿主路线，开始推进 S3”。采用固定、未修改的官方 SDK，由 App 薄宿主接入原生消费前钩子；不暂缓 D-11 停止/队列范围。接入与打包的常规工程选择自主推进，无需重复路线授权。
- T4：固定文件实现未找到执行全周期锁。按照已有规则，占用不能证明时只读；App 自建锁不冒充外部 CLI 遵循的锁，不用进程扫描、PID 或瞬时文件锁空闲作为独占证明。
- 工程状态：官方 SDK 薄宿主、原生控制、交互、保守恢复准入与正式 GUI 已实现并验证；01–05 工程票完成，版本 `0.1.0-s3.0`。证据与试用步骤见 [交接](handoff.md) 和 [验收记录](evidence.md)。
- 评审后源码修复：三项缺陷已关闭，101 测试及真实 GUI 回归通过；S4 工程进入检查通过，见 [修复交接](review-fixes.md)。旧候选包未更新。
- 用户试用：已交付待试用，尚无用户体验认可。无待答的重要产品问题；恢复单写证据仍缺失，执行恢复禁止。S4/M2 未授权。

## 用户操作与目标

1. 忙碌普通发送进入 OMP 原生 follow-up 队列；干预单独选择原生 steer，不把两者混同。冻结内容与调用收据沿用 D-24，接收成功不等于执行完成。完整逐项编辑/删除/重排仍属 M2。
2. 停止先建立消费阻止原因，再中断当前原生执行；保留原生待处理项，明确继续才解除用户停止原因。原生消费前必须受门控；不将 App 本地自动续发伪装成原生队列，不清空/取出再发送模拟暂停。编辑阻止原因与用户停止独立。
3. 原生 confirm/select/input/editor 交互按请求展示、回答或取消；只操作当前实例及尚未结束的请求。响应写出不是业务完成确认；断链不自动重答。未知/不支持交互保留可见状态，不静默默认同意。窗口重新订阅可取得当前待答快照。
4. 关窗/刷新继续后台工作，重开只订阅；真正退出区分等待、停止后退出、取消。停止回执不替代残留工作消失证据。原生后台任务也需核对，不单凭 streaming=false 退出。
5. 故障后保留草稿、冻结原文及原生历史；恢复前检查稳定 Thread/原生 ID、配置与目录身份、原拥有者释放及持续单写依据。缺失任一项保持只读并明确原因，禁止强占、禁止偷偷新建会话代替恢复。unknown 不自动重发；显式再次发送必须新提交身份并告知可能重复。

## 固定源码证据与门槛

OMP v18.3.0，commit `62bc57be1b03ef0802a33cf7f5f530e534527531`。源码与本应用集成验收分别记录。

- [RPC](https://github.com/can1357/oh-my-pi/blob/62bc57be1b03ef0802a33cf7f5f530e534527531/packages/coding-agent/src/modes/rpc/rpc-mode.ts)：steer/follow_up await 对应入队方法；abort await session.abort。set_*_mode 是消费模式，无暂停/继续/逐项管理接口。UI response 是可越过串行队列的旁路帧。
- [Agent](https://github.com/can1357/oh-my-pi/blob/62bc57be1b03ef0802a33cf7f5f530e534527531/packages/agent/src/agent.ts#L855)：addBeforeQueuedMessageDequeueHook 在 claim 之前 await，abort 后不消费；这是 SDK 可达能力，不能直接推导为 RPC 扩展能力。
- [AgentSession](https://github.com/can1357/oh-my-pi/blob/62bc57be1b03ef0802a33cf7f5f530e534527531/packages/coding-agent/src/session/agent-session.ts#L8347)：abort 的 finally 调用 drainStrandedQueuedMessages；不能只发送 abort 就保证暂停。公开 readonly agent 为 SDK 接入点。
- [扩展合同](https://github.com/can1357/oh-my-pi/blob/62bc57be1b03ef0802a33cf7f5f530e534527531/packages/coding-agent/src/extensibility/extensions/types.ts)：公开 Context 为只读 sessionManager、isIdle/abort/hasPendingMessages，无 Agent 或消费前钩子。before_agent_start 已在实际 dequeue 后，不能代替消费前控制。
- [SessionStorage](https://github.com/can1357/oh-my-pi/blob/62bc57be1b03ef0802a33cf7f5f530e534527531/packages/coding-agent/src/session/session-storage.ts#L412)：publish lock 在每次写入/替换时取得并释放。SessionManager 的 peek 注释提到 single-writer，但 open → setSessionFile → appendWriter 的文件实现不能证明执行全周期独占。
- 本地源码 SHA-256 与 [S2 evidence](../m1-s2-submit-read/evidence.md) 的 agent/agent-session/rpc-mode/session-storage 四项一致；session-manager 从上述固定 commit 新取。官方二进制与资源清单保持不变。

T3（SDK 路线已获准）：最小关键验证仅回答“门控可达、停止竞争不再消费、继续复用原生条目、随包运行可行”；答案足够后直接实施。T4 无可证实的全周期单写协议时不运行写恢复实验来假定安全，不强行消除限制。

## 所有权与验收

Main 拥有信任、持久收据、恢复准入和 Host 监督；Host 拥有每实例控制请求、交互、原生适配和阅读投影；OMP 拥有执行与真实队列。React 仅订阅并发意图。身份至少含 Thread、实例/连接代次；跨层 traceId 沿用既有诊断合同，不记录回答正文。

按行为逐个红→绿；优先 Vitest 业务/协议与真实 SQLite，真实官方 Runtime 使用隔离项目/配置/本地模型 fixture。覆盖停止与消费竞争、重复回答/原生取消/过时代次、故障 unknown、不自动重放与恢复拒绝；GUI 跨层检查受影响操作、焦点、主题/密度。只复测受影响路径，不机械重跑 S1/S2 全矩阵；真实供应商/原生 IME/用户认可分别记录。

## 任务

| 票 | 交付 | 依赖 |
| --- | --- | --- |
| 01 | 原生队列门控与控制接入 | Q1 |
| 02 | 当前原生交互回答闭环 | 无 |
| 03 | 恢复准入与只读解释 | 无；写恢复另须 T4 |
| 04 | 停止/继续/退出及未知提交 GUI | 01 |
| 05 | S3 集成、试用交接及本地提交 | 01–04 |

## 2026-09-28 准备批检查与继续入口

- 已建立 5 张任务票；Q1 尚待答复，未改变官方 Runtime 接入或削减已定 D-11 范围。队列/停止/交互/退出完整实现尚未完成，不交付 S3 试用包。
- 恢复说明改为准确的单写证据限制，移除“后续阶段提供”的无条件暗示。真实 RuntimeService + 临时 SQLite 回归验证重新 inspect/allow/start 不 fork、不更换已有绑定、不覆盖草稿；既有拒绝行为属于补测，不冒称新恢复能力。该测试先因解释文案缺口失败，修改后通过，不将文案红灯描述为完整恢复 TDD。
- `pnpm check` 通过：类型、Biome、设计 lint 与边界、77 项测试通过，1 项可选官方原生 smoke 跳过。`pnpm build` 通过，有现存依赖注释和大 chunk 提示。本批没有重新运行真实 OMP/GUI/打包；不以 S2 证据冒充本次 S3 验收。
- 独立交互协议已核对：confirm/select/input/editor 的回复分别使用 confirmed/value/cancelled；extension_ui_response 越过 RPC 串行队列，但没有逐回答 ACK。requestRpcDialog 的原生超时会删除请求而不发 cancel，App 必须按收到请求的 timeout 及时停用回答，不能等一个永远不来的 cancel；原生显式取消使用 targetId。不得把写出回复标成业务完成。此证据尚未成为产品实现，02 保持 open。
- 下一步优先接收 Q1 的路线答复；官方 SDK 可达性不等于已通过随包与竞争验收。获得选择后落实 01，并继续 02–05。恢复的只读下限已明确，写恢复没有单写证据仍禁止。

## 2026-09-28 SDK 路线实施

用户已确认 Q1，开始 01。关键未知仅为固定 SDK 的消费前门控竞争与随包运行；先核对发布包和官方源码，再用最小原生样本证明，不重做已有 RPC 可行性。官方源码不修改。此前准备批的待答记录保留历史含义。

## 2026-09-28 工程交付

Q1 已按用户选择落实。官方 SDK 18.3.0 + Bun 1.3.14 作为随包资源；原生源码未改，App 仅提供启动、原生钩子门控、受限控制帧和状态观察。公开 `runModeExitTeardown` 用于重新唤醒原生调度，不取出/重新加入队列。配置沿用官方 profile 引导，session 明确写入 App 管理的实例目录。

停止为幂等操作，较新停止覆盖尚未执行的继续。队列预览最多 64 条、每条 2048 字符，真实条目不截断；交互最多 32 项，无法显示/不支持请求明确阻塞并提示。原生 timeout 本地到期停用回答，断链/回答写出失败保留 unknown；回答没有业务完成 ACK。

退出同时核对原生队列、后台运行、pending async wake、admitted submission 和待交互；最后的 idle RPC 可能早于 admitted 清零，须等后续控制快照收束，未得回执的提交不能因一次 idle 被清除。普通草稿编辑不暂停当前执行；完整队列逐项编辑及其编辑门闩使用属于 M2，本次只提供独立原因的门控能力，不扩展 GUI 范围。

正式交付、验证分层、试用状态与技术限制见 [handoff](handoff.md)。准备批的待答与未实施条目为历史记录，由本节和顶部状态取代，不抹去当时证据。

## 2026-09-28 独立评审修复

用户要求修复三项评审发现，确认可进入 S4 后本地提交；不推送。本轮只修复 S3，不实施 S4。当前补充状态以 [修复与进入检查](review-fixes.md) 为准，任务见 [06](issues/06-review-fixes.md)；此前候选包与证据保留原历史含义。用户试用仍未认可。
