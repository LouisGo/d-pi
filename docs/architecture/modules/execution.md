# 提交与执行交互

日期：2026-10-02。深度：M1 核心、OMP v18.4.6 原生结果加固与 M2 队列纯文本管理增量；完整附件编辑、真实账户及完整队列验收仍在 M2。依据 D-11/D-24；[基础契约 §2](../foundation-contracts.md#2-提交交接b2)为状态规则的唯一详细来源。返回[模块地图](README.md)，跨进程序列见[交接图](flows.md)。

## 当前工程落点（领域目录治理，2026-09-29）

- 合同在 `src/modules/execution/contracts/`，准入、提交 admission/coordinator 和原生命令策略在 `core/`；它们不拥有 Node/Electron 或 OMP 进程。
- `host/` 由 `SessionHost`、`PendingInteractions` 和 `NativeSession` 共同持有单个执行 Host scope；它通过 `SessionHostOptions` 把原生帧、端口附着和释放交给 `app/host` 组合的 `conversation/host`，不能从显示事件推断提交接受。
- D-39 在 NativeSession 内部采纳 Effect 4.0.0 管理等待和资源释放；供应商类型不进入公开 DTO 或 Renderer，超时/Scope 中断仍只表示运输结果未知，不表示 OMP 已取消或可自动重发。实施与验证见[Effect 规格](../../../.scratch/effect-native-lifecycle/spec.md)。
- `main/` 的 `RuntimeService` 是保留同一生命周期状态的执行协调器，复用 `RuntimeAdmission`、`SubmissionCoordinator`、`HostConnection` 和 `SubmissionRepository`；没有按行数复制状态或制造第二个队列。
- `renderer/` 只保存当前执行镜像和提交客户端；应用组合与 SQLite 初始化在 `src/app/main/wiring/`，恢复由 `SubmissionRepository.recoverInterruptedSubmissions()` 显式调用。
- 2026-10-08：`select-model` 复用 HostConnection 的有界 operation 等待，Main 回读关联 trace/generation 的原生终态后返回；`modelOperation` 区分 pending/acknowledged/failed/unknown，成功时才更新 App 的 selection/thinking 意图。Renderer 只能按同请求 trace 的 acknowledged 回读收起 panel，失效目标和未知运输不自动重发。准备阶段的 inspect 返回 starting 投影，不能在原生许可握手前写 get_state。
- OMP 队列、原生历史和执行事实仍由 OMP 所有；`unknown` 不自动重发，ACK 与草稿消费标记继续在同一 SQLite 事务中完成。
- `SubmissionRepository` 保存有精确 request/target 的有限 `promptResult`，区分 `native-prompt-result` 与内置本地命令的 `native-local-response`；调用 state 与 completed/aborted/failed/unknown outcome 分开。RuntimeView 暴露证据覆盖缺口，Renderer 收据合并不会用旧 unknown 或迟到 success 擦除已观测终态/错误。
- Host 的未确认 evidence 缓存上限 256，重复事实合并，Main 持久提交后发送 confirm-evidence；同活实例按退避重送事实，attach/replay-evidence 也仅重送证据。未确认事实阻止正常 idle 回收，不能凭 ACK 与原生闲置丢弃未保存终态。已确认身份最多保留 128 项/15 分钟，不含正文，用于重复终态和迟到错误关联。Host 退出清内存，缓存压力和无关联结果明确报告 gap，不承诺崩溃后的缓存恢复。


## 范围与拥有者

Main 的提交协调拥有 App 收据和草稿交接；Host 的执行协调负责命令接受判定与待答交互，复用宿主适配的唯一 RPC 关联表并定义其保留/释放条件。两者属于一个功能的不同运行部分，不各自建立权威提交状态。OMP 拥有真实接受、队列、工具和执行，Host 观察并转交证据。

普通发送在繁忙时走原生排队追加，干预、停止和回答是明确的独立意图。App 不在原生队列前再造一套自动消费的持久执行队列。

2026-09-27 用户新增明确的队列管理要求：可视化、直接编辑、删除及重排待处理内容。执行模块拥有这些操作的业务协调，阅读模块呈现真实队列投影，修改后的附件/引用仍须复用输入准备管线。行为及证据边界集中见[基础契约 §2](../foundation-contracts.md#2-提交交接b2)。用户已确认进入编辑暂缓该条消费、保存后按新内容继续、取消恢复原内容；当前执行不受影响，轮到该条时等待，不跳过后项。2026-10-02 的纯文本增量已按固定SDK核实接口与真实消费竞争；完整附件/custom编辑仍未交付。

## M2 队列文本管理（2026-10-02）

- `contracts/queue.ts` 提供 `QueueAction`、`QueueSnapshot`、`QueueChange` 与操作结果；Renderer经 `RuntimeModel.manageQueue`、Main `RuntimeService`、Host受限命令到 `runtime/native-queue.mjs`，同一trace及Thread/连接代次贯穿实际边界。OMP保留真实队列，App不建立自动消费队列。
- 原生对象UUID区分同文重复项；revision与仍待处理身份在操作执行方复核。`ControlState.queueState` 提供items、宿主editing稿、coverage/hiddenCount；prepareQueuedMessages保留SDK准备，并在其前后阻止编辑对象所在批次commit。stop gate独立，保存/取消只解除编辑原因。保留原生one-at-a-time/all策略；all批次包含编辑项时整批等待，界面明示此边界。
- 只允许无伴随项的单正文纯文本user编辑，附件/引用伴随项及custom条目不伪装为可编辑。删除和同种类排序携带隐藏companion group，不改变无关内部记录。单项文本编码预算256 KiB、快照整体512 KiB/128项；超预算显示截断及不可编辑，真实原生内容不截断。
- Main在save/delete/move写OMP前持久记录独立QueueChange（schema 7、before-v7备份），保留trace、真实target、原生entryId、操作及previousText，不覆写冻结提交或旧收据。previousText来自投影，previousTruncated明示它是否仅为片段；截断操作仍作用于完整原生group。ACK持久化失败、断链或重开时未决变更保留unknown，不自动重写。begin/update/cancel的编辑状态由当前Host实例持有，不建立第二份原生队列事实。
- Renderer编辑更新串行，update/save/cancel在同一编辑上下文采用最新确认revision；begin/delete/move保留用户看到的版本。旧Thread lane及旧连接结果不进入新目标。unknown先禁写，只有明确inspect取得真实Host新快照后Main置reconciled才允许新的显式操作；旧未知结果仍保留，不按文本或队列长度倒推成功。

本增量工程完成与验证见[05a](../../../.scratch/m2-first-release/issues/05a-native-queue-management.md)、[队列证据](../../../.scratch/m2-first-release/queue-management.md)。Host实例与未保存稿不随视图卸载结束；真正退出或Host故障后的执行恢复继续遵守D-24只读边界。无头/React/SQLite与固定SDK localhost通过，不替代真实macOS关窗、视觉、候选试用或完整M2认可。

## 交接

| 提供方 | 输入 | 本模块输出 / 消费方 |
| --- | --- | --- |
| [Thread](threads.md)、[配置](configuration.md) | 稳定身份、目录、配置和目标实例上下文 | 准入失败原因或提交操作 / UI |
| [输入](input-context.md) | 与 revision 对应的冻结内容包、模式、准备结果 | submissionId、收据状态 / 输入与 UI |
| [存储](app-storage.md) | 条件更新与事务的持久结果 | 已落盘 dispatching 后的派发请求 / 宿主 |
| [宿主](runtime-host.md) | 原生请求关联、回执、事件、断链/进程退出 | 调用 ACK、独立的业务接受证据、明确拒绝或 unknown；必要更新回 Main 持久化 |
| 原生待答请求、队列/执行状态 | Host 按实际原生证据维护 | 可用交互及执行观察 / [阅读](conversation.md) |
| 用户停止/回答/干预 | 验证目标 Thread、实例及请求仍有效 | 真实结果或结果未知 / UI；写操作不靠查询重试自动重发 |

停止、回答等会话控制可以经 Renderer → Host 受限通道；带新内容的普通/排队/干预提交必须先经过 Main 收据流程。每种原生命令的接受、终结和释放关联时点分别验证。

## 状态与关键规则

正常交接为 preparing → prepared → dispatching → acknowledged；准备中取消为 cancelled，明确接受前拒绝为 rejected，派发后缺可靠结果为 unknown。持久化失败作为具体阶段失败呈现，不把它包装成 OMP 拒绝。

- prepared 和 dispatching 均落盘后才能写 OMP。固定版本、具体命令的关联 ACK 与消费标记持久化后才清理对应草稿，冻结原文保留；首次 success 不自动推进 accepted 或完成（2026-09-28 D-24 修订）。
- 已持久 ACK 不因后来失败被撤销；业务接受与执行失败另有证据才标注，不能倒写为从未发送。后续失败保留原提交内容，不覆盖用户新草稿。
- 相同 submissionId 的重复点击/IPC 返回已知状态，不重复派发。用户主动重新发送 unknown 内容须使用新 submissionId 并关联原提交，提示可能重复。
- schema 6 保留已持久结果；重启把 dispatching、ACK 后仍 unobserved 的结果保守解释为 unknown，保留 ACK 时间/消费标记与原文。prepared 可由用户继续。ACK 丢失不能凭相同文本或相近时间认定接受，unknown 不自动重试。
- prompt_result 可先于 ACK 入库，不消费草稿；完整 target 和合法派发状态必须匹配。ACK、prompt 结束与 session settled 分开，ACK 后 unobserved 或 completed 且 sessionSettled=false 不放行回收/退出，generic idle/agent_end 不给未知提交猜成功。Host 保留关联直到终态持久确认，迟到确认主动重采 idle；其间进程退出的缺失终态按 unknown 保留。原生 get_state.queuedMessages/queue_update 提供基础观察，queueState补充当前真实待处理身份与编辑状态；完整附件编辑与组合验收仍留在 M2 05。
- 停止回执只证明中断请求已返回；排队输入、待答交互和后台活动另按证据显示。用户确认停止须同时暂缓当前 Thread 后续队列，保留内容，待明确继续后恢复；不清队列、不回滚文件。实际消费阻断与恢复属于执行侧，原生 abort 本身不证明这些效果。

## 生命周期与第一批验收

Main 收据和冻结内容跨窗口/重启保留。Host 的请求映射随原生实例变化结束；未决提交由 Main 恢复，旧代次回执不改新状态。待答请求失效或原生已退出时，界面提示失效，不把旧回答投给新请求。

先验证普通提交、排队、干预、停止和回答的原生证据；复用[历史实验](../../archive/stage1-evidence.md)，补齐相同请求 ID 的迟到错误及组合场景。S3 同时观察同一会话从当前工作进入后续队列时，干预/停止实际作用于什么，按原生证据设计反馈，并验证用户已确认的“中断当前执行、暂缓后续队列、明确继续”能否通过原生或薄适配实现；不预设产品 Run 或精确目标绑定能力。无头测试覆盖：写前存储失败、写后断链、ACK 写收据失败、重复 IPC、旧代次响应、提交中改稿与重启恢复。

真实 GUI 验收：发送后有明确状态和可恢复内容，回答能推进对应交互，停止后的队列/后台状态不误报，刷新不重复提交。具体跨模块反例与通过标准见 [M1 场景](../../../.scratch/development-foundation/spec.md#跨模块验收场景)。


2026-10-01 的实现与验证见 [03 证据](../../../.scratch/runtime-hardening-omp1845/evidence/native-outcomes.md)：真实固定 SDK/localhost RPC 录制、真实原生关联类的受控旧 run 样本与 App Decoder→NativeSession→SessionHost→RuntimeService→SQLite 回放分开记录。未调用个人账户或计费供应商，不把该证据当完整 M2/用户认可。

2026-10-01 内部整理：core 按 runtime / submission，Main 按 runtime / transport / submission，Host 按 native / interactions，Renderer 按 runtime / submission 分组；SessionHost 与 RuntimeService 继续单独拥有各自共同因果状态。环境公开入口与既有事务、ACK、恢复合同不变。

2026-10-02：04a/05c增量将 input 准备的不可变内容持久化在冻结提交，并经同一 submissionFrame 派发实际文字/图片；模型及真实传输 vision-guard 不支持图片时拒绝，准备后重新核实目录授权、Thread和目标身份。显式重发沿用原冻结内容，不重新读取磁盘；unknown仍不自动重发。原生队列支持单文字加图片/纯图片的保留、显式逐图移除和文本编辑，custom/伴随组保留只读及原顺序；Main变更记录包含原图片身份，旧submission原件不覆写。

## M2 子 Agent 观察边界（2026-10-06）

SDK Host 启动后由只读观察适配建立原生订阅与活动快照；同活 Host 继续观察并向 conversation 转交真实帧。子 Agent 状态、可得结果与已有后续创建配置、主提交收据各自独立，观察及阅读重连不启动、停止、恢复或结算执行。适配仅保存有界原生读取关联，真实身份/状态来自 OMP；同 nativeId 的后续 parentToolCallId/sessionFile 运行不能接收旧结果。固定 SDK localhost 的真实 task/yield 样本验证原生状态、活动 registry 移除与终态 transcript 保留，不替代真实供应商或用户试用。
