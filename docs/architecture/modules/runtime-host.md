# 宿主与 OMP 接入

日期：2026-10-02。深度：现有执行宿主、原生连接生命周期与 M2 队列纯文本管理接入；分层工程证据见下文，冷执行恢复与完整 M2 验收仍遵守各自规格。依据 D-02/D-03/D-24/D-26；[进程 ADR](../../adr/0001-omp-session-client.md)、[基础契约 §1](../foundation-contracts.md#1-身份持久化与生命周期b1)。返回[模块地图](README.md)。

## 当前工程落点（领域目录治理，2026-09-29）

- M2 的 `src/app/host/index.ts` 按进程实例 scope 路由，一个 utility 监督多个独立 OMP；Main 按 Thread 持有 RuntimeService，切换 Renderer 视图不停止后台。单 scope 回收不关闭其他 scope。
- `src/app/host/index.ts` 只做 utility 入口；执行 Host 实现在 `src/modules/execution/host/`，连接监督在 `src/modules/execution/main/transport/host-connection.ts`。
- `src/platform/omp/protocol/` 持有原生帧合同和 decoder，`src/platform/omp/resources/` 持有 Runtime/官方 SDK 资源校验；`runtime/host.mjs` 加载官方 SDK，组合停止门控、原生队列文本管理和当前Thread的后续子Agent配置薄接入，官方执行循环与RPC driver不改写。
- 阅读事件在 `src/modules/conversation/host/projection.ts` 归一化，Host 不把未经归一的 OMP 帧交给 Renderer。关闭 scope 的实际释放顺序是 NativeSession → 交互 → 投影 → 阅读端口（`session-host.ts` 先关原生会话再清理交互，最后经 `app/host` 释放 conversation scope）；顺序变化须同步本页与领域测试。
- 2026-10-02 D-39：NativeSession 内部使用 Effect 4.0.0 Scope/Fiber 管 ready 与在途 RPC，超时/成功/失败/断链均释放等待关联；关闭先中断等待，再通过 finalizer 等待 EOF、真实 close 和身份核对后的组清理，3 秒期限后升级终止。外部仍为 Promise/NativeObservation，协议关联 Map、独立退出证据和 OMP 所有权不变。当时 SessionHost 证据重送及 HostConnection 尚未迁移，验证见[Effect 规格](../../../.scratch/effect-native-lifecycle/spec.md)；当前 Host task Scope 合同见下文。


## 范围与拥有者

本页 Host 指承载 OMP 连接的 SessionHost。D-40 用户集成终端由独立[TerminalHost](terminal.md)管理，不能复用本页 OMP scope、原生请求关联或输出读取器。终端故障不重启本页资源；组合退出由 Main 汇总两侧真实状态，详见[终端契约](../terminal.md)。

Main 拥有窗口、Host 监督及受限通道建立；一个 utility SessionHost 监督多个独立 OMP，每个活跃顶层会话对应一个 OMP。子 Agent 的创建和执行仍由 OMP 管。普通连续对话复用进程，关闭/刷新窗口不结束它。

本模块解码 stdio、区分协议帧与错误、维护唯一的原生请求关联表并报告进程/连接事件。stdout 只有一个协议读取入口；诊断只取脱敏元信息。[执行模块](execution.md)解释接受与交互，并提供关联保留/释放的业务条件，不另建竞争请求表；[阅读模块](conversation.md)维护投影，不让每个页面重复解析协议。

## 交接

| 输入 / 提供方 | 本模块负责 | 输出 / 消费方 |
| --- | --- | --- |
| 执行上下文与准入结果 / [Thread](threads.md)、[配置](configuration.md) | 在启动处复核目录、信任、占用和配置上下文；从包内资源启动固定兼容 OMP | 实例/连接身份、启动结果 / Thread 与执行 |
| 已持久化到 dispatching 的提交 / 执行 | 核对实例和原生命令、限制编码输入、写入一次；保持有界请求关联 | 原生回执、接受证据或关联失败 / 执行 |
| 停止、回答等受限操作 / 执行 | 转换为目标版本命令，不注入上游不支持的 App 字段 | 实际命令结果 / 执行 |
| stdout / OMP | 处理 UTF-8 跨块、JSONL 与声明的大帧规则，校验使用的字段 | 有原生来源的事件 / 执行、阅读 |
| 退出、故障与连接变化 / Main 或进程 | 分清单 OMP 与整个 Host 的故障范围 | 中断及新代次 / Thread、执行、阅读 |

新状态由 Host 通过既有受限 MessagePort 送 Renderer；Main 不逐条转发流。Main 与 Host 的提交/持久化协作是另一条受限通道，详见[时序](flows.md)。

## 生命周期与失败

2026-10-07 T3 基础切片的新增合同：NativeSession 可辨认的原生边界失败以普通 Error rejection 附带有限 NativeFailureSummary，区分 spawn/protocol/write/timeout/local interruption/unavailable 及输入/请求预算；本地编码或应用观察者缺陷保持 unknown 归因。可信 Host/Main 仅映射固定 code/causeCode，不传播原始 Cause、stderr 或异常全文。每个 Host 的后台等待与 deadline 绑定局部 Scope，scheduled handle 完成即释放；断链结束自动重播但保留待持久确认的 evidence，重播不写 prompt。刷新继续 singleFlight，并在每次 await 后复核 observationVersion/dispatch 身份。取消局部等待不发送 abort，所有业务 unknown/ACK、物理 close/groupStopped 门槛保持不变。

2026-10-09：Main HostConnection 的启动、操作与关闭等待也绑定每代连接的 Effect Scope；关联表和关闭监听通过 `ensuring` 在所有退出路径释放，不能把 `Effect.callback` 仅用于中断的 cleanup 当作通用 finally。启动终结后拒绝迟到 ready 绑定及登记许可；操作超时仍返回 unknown 且不重发。真实进程组清理及 lease 释放完成后结算关闭监听，再关闭该代 Scope，旧代收尾不结束新代等待。HostScope deadline 向已运行任务传 AbortSignal，任务需协作停止；保留 Node ref/unref，不将 Fiber 中断解释为抢占任意 Promise 或原生执行已停止。

确定性回放仅替换 process/stdio 接缝，实际 FrameDecoder、NativeSession、SessionHost、ConversationProjection 及 Main/SQLite 收据事务继续运行；Gate 在入站标记前等待明确释放，同批帧不插入额外 await。测试样本不证明供应商、OS 停止或 GUI；真实进程检查独立保留。目标与证据见 [01](../../../.scratch/t3-foundations/issues/01-native-scope-replay.md)。

- Main 创建 Host，Host 为已准入的 Thread 创建/恢复 OMP。历史浏览走只读路径，不为浏览启动 Agent 或加载项目可执行扩展。
- 每次实例/连接变化更新身份，旧代次响应不进入当前状态。单 OMP 崩溃只中断该 Thread；Host 崩溃影响其全部连接，先处理可证实属于本次实例的残留再允许恢复。
- 请求关联何时释放按具体命令证据确定；首次 success 后可能仍有同 ID 异步失败。未知副作用不自动重发，交给执行模块保留状态。
- 没有执行、排队、待答交互、后台任务且已持久化，才可回收 OMP。真正退出按等待/停止后退出/取消处理；abort 回执不替代结束证据。

## 第一批交付与验证

先建立包内 OMP → Host → Renderer 的一条真实链路及实例诊断，再接一个 Thread。测试不依赖生产 React 页面来启动或监督进程。

复用[Runtime 证据](../../validation/runtime-feasibility.md)、[随包证据](../../validation/packaged-runtime-evidence.md)与[历史停止实验](../../archive/stage1-evidence.md)，核实版本和适用条件。补验证拆帧/迟到响应、OMP 与 Host 分别崩溃、窗口重连、停止后队列和单写恢复；具体门槛见 [G1 清单](../../../.scratch/development-foundation/spec.md#按需补齐的关键-g1-证据)。

通过标准：故障范围正确、旧连接不能污染新连接、关闭窗口仍消费输出；开发态和包内资源路径均有证据。原生接受关联或单写条件无法证明时，只限制相应发送/恢复能力，不伪造 ready。

## S3 当前实现（2026-09-28）

当前固定官方 SDK 18.4.6 在随包 Bun 1.3.14 中运行；`runtime/host.mjs` 是 App 自有薄适配。2026-10-01 用户授权仅在资源 staging 修正 sdk.ts 的 prelude 导入歧义，原文件和补丁哈希入 manifest，其余官方代码与所有权不变。正式 Host 使用该入口，原生 RPC driver 继续拥有标准命令和扩展 UI；仅增加消费前钩子、控制帧与有界状态观察。资源准备由 `scripts/runtime/prepare-sdk.mjs` 复制锁定依赖，打包显式保留 node_modules。控制和回答沿 Main 信任检查、Host 当前代次及 traceId 返回运输结果，正文不记诊断日志。

2026-10-02 M2文本队列增量：App控制帧 `d_pi_queue` 经NativeSession既有唯一请求表关联，`d_pi_state` / `d_pi_control_state` 的queueState包含真实待处理UUID/revision、编辑稿与覆盖范围。Host在当前Thread/连接上校验并解析结果，再向Main报告operation-result，不把本地投影变动冒充原生确认。薄 `NativeQueueManager` 直接观察/修改官方队列对象；编辑等待包装SDK的queued preparation，保留原准备和原生批次策略；不在全局model-call gate加入编辑理由，因此当前执行继续。组件卸载不释放管理器或未保存稿；消费暂缓与停止各自解除。

资源manifest复制并校验队列及子Agent适配模块；队列快照预算512 KiB/128项，受限表示通过truncated/hiddenCount/coverage明示，不截断真实原生队列。固定SDK/Bun/localhost的8次真实模型调用已验证逐项及all合并批次的等待、保存/取消、独立停止/继续和隐藏companions，详见[队列记录](../../../.scratch/m2-first-release/queue-management.md)。完整附件编辑、真实macOS关窗/视觉和冷执行恢复仍不由该证据覆盖。

原生 session 放入 Main 指定目录；新启动与冷恢复分开，已有App私有绑定经生命周期lease和旧原生进程清理核实后恢复同文件/ID，具体合同见基础契约2026-10-08修订。停止/退出的实际验收和限制以 [S3 交接](../../../.scratch/m1-s3-control-recovery/handoff.md) 为准。

## 运行时加固（2026-10-01）

NativeSession 启动受管独立进程组，薄 bootstrap 在导入 SDK 前等待 Main 的身份登记许可。Main 登记 scope/processInstanceId、资源入口及实际 PID、父进程、进程组、birth/executable；Host 与 Main 故障分别清理属于本次实例的组。仅凭断链不能宣布原生或工具已停止，终止结果与 prompt 结果分别报告；清理复核身份，不能仅凭旧 PID 杀进程。单 Bun 故障不结束其他 scope，停止和紧急清理不依赖 SQLite 可写。逃逸进程组的未知外部进程不在已证终止范围，不能声称工具沙箱或跨 CLI 单写。冷旧App私有绑定按2026-10-08合同恢复同文件/ID，不adopt旧stdio或自动重放unknown。真实 Electron utility/Bun/工具故障证据由[04](../../../.scratch/runtime-hardening-omp1845/issues/04-process-supervision.md)维护。

Runtime 的正常退出入口即使已断开，也必须等待 HostConnection 的最终组清理；清理未证实则拒绝退出，重复调用不能跳过失败。最近七提交的跨层回归修复见[审查记录](../../../.scratch/review-seven-commits/spec.md)。

2026-10-02 暖会话修复：bootstrap 的所有者探测异步且不重叠；ps 失败保留 unknown，仅成功采样的 birth 变化、父 PID 变化或 liveness 的 ESRCH 才终止。NativeSession 报告真实 close 的 PID/code/signal；bootstrap 终止原因与 SDK 请求退出码为有限、token 关联的独立证据，缺失保持 null。Main 区分单 native 与 utility 退出，不凭 SIGKILL 猜 OOM 或 watchdog，见[记录](../../../.scratch/m2-first-release/warm-session-liveness.md)。

## 子 Agent 只读观察接入（2026-10-06）

固定 OMP 18.4.6 原生 RPC `set_subagent_subscription(level=events)` 在 `get_subagents` 之前建立订阅；原生 lifecycle/progress/event 帧仍由 conversation 投影。`execution/host/native/subagent-observation.ts` 只协调初始读取和终态 transcript 读取，不另建调度或任务完成事实。原生 registry 的终态会从活动列表移除，但保留最多 256 个 transcript 引用；终态读取仅向 OMP 传原生 subagentId，结果路径必须匹配已观察拥有者。

官方 transcript RPC 读取到 EOF，适配先 stat 原生提供的文件：超过 1 MiB 或不可读时不发读请求，保留已观察片段并明确原因；正常结果仍受原生传输上限和阅读投影预算约束。最多并发 2 个读取、128 个待处理读取，超限/失败不宣称没有结果。未知/释放/拥有者变化后的回包不进入新投影；原生断链后未终态任务保持 unknown，已观察终态与结果继续可读。

## 2026-10-08 图片资源水合

Main 传入规范化的 App 私有 content 目录及共享图片预算，Renderer 不提供任意本地路径。宿主仅按摘要读取 objects 下普通文件，拒绝软链、非普通文件、长度/MIME/摘要不符或超预算；有界读取后再校验文件状态。资源引用在最后 OMP JSONL 边界转为原生 ImageContent 的 Base64，不写回 App 收据或放宽 App 管道 1MiB 门槛。旧内嵌图片兼容。

普通命令按 forwarding 链串行，暂停控制立即更新 epoch；异步水合前后都核对准入。未转发的暂停/资源缺失/损坏/编码预算失败返回类型化 inputRejected，SessionHost 发布 proven rejected，取消等待并保留草稿；不能当作 ACK、自动重发或以 unknown 掩盖。关闭等待已有 forwarding 结算。新 helper 与 worker 同固定 SDK 资源拷贝/hash 校验，但不修改官方 SDK。
