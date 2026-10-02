# 宿主与 OMP 接入

日期：2026-09-27。深度：M1 核心设计，接入待验证。依据 D-02/D-03/D-24/D-26；[进程 ADR](../../adr/0001-omp-session-client.md)、[基础契约 §1](../foundation-contracts.md#1-身份持久化与生命周期b1)。返回[模块地图](README.md)。

## 当前工程落点（领域目录治理，2026-09-29）

- M2 的 `src/app/host/index.ts` 按进程实例 scope 路由，一个 utility 监督多个独立 OMP；Main 按 Thread 持有 RuntimeService，切换 Renderer 视图不停止后台。单 scope 回收不关闭其他 scope。
- `src/app/host/index.ts` 只做 utility 入口；执行 Host 实现在 `src/modules/execution/host/`，连接监督在 `src/modules/execution/main/transport/host-connection.ts`。
- `src/platform/omp/protocol/` 持有原生帧合同和 decoder，`src/platform/omp/resources/` 持有 Runtime/官方 SDK 资源校验；`runtime/host.mjs` 只加载官方 SDK 并接入已确认的消费门控。
- 阅读事件在 `src/modules/conversation/host/projection.ts` 归一化，Host 不把未经归一的 OMP 帧交给 Renderer。关闭 scope 的实际释放顺序是 NativeSession → 交互 → 投影 → 阅读端口（`session-host.ts` 先关原生会话再清理交互，最后经 `app/host` 释放 conversation scope）；顺序变化须同步本页与领域测试。
- 2026-10-02 D-39：NativeSession 内部使用 Effect 4.0.0 Scope/Fiber 管 ready 与在途 RPC，超时/成功/失败/断链均释放等待关联；关闭先中断等待，再通过 finalizer 等待 EOF、真实 close 和身份核对后的组清理，3 秒期限后升级终止。外部仍为 Promise/NativeObservation，协议关联 Map、独立退出证据和 OMP 所有权不变。SessionHost 证据重送及 HostConnection 尚未迁移，验证见[Effect 规格](../../../.scratch/effect-native-lifecycle/spec.md)。


## 范围与拥有者

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

原生 session 放入 Main 指定目录；新启动与冷恢复分开，已有绑定缺执行全周期独占证据则只读。停止/退出的实际验收和限制以 [S3 交接](../../../.scratch/m1-s3-control-recovery/handoff.md) 为准。

## 运行时加固（2026-10-01）

NativeSession 启动受管独立进程组，薄 bootstrap 在导入 SDK 前等待 Main 的身份登记许可。Main 登记 scope/processInstanceId、资源入口及实际 PID、父进程、进程组、birth/executable；Host 与 Main 故障分别清理属于本次实例的组。仅凭断链不能宣布原生或工具已停止，终止结果与 prompt 结果分别报告；清理复核身份，不能仅凭旧 PID 杀进程。单 Bun 故障不结束其他 scope，停止和紧急清理不依赖 SQLite 可写。逃逸进程组的未知外部进程不在已证终止范围，不能声称工具沙箱或跨 CLI 单写。冷旧原生绑定继续只读，不 adopt 或自动重放 unknown。真实 Electron utility/Bun/工具故障证据由[04](../../../.scratch/runtime-hardening-omp1845/issues/04-process-supervision.md)维护。

Runtime 的正常退出入口即使已断开，也必须等待 HostConnection 的最终组清理；清理未证实则拒绝退出，重复调用不能跳过失败。最近七提交的跨层回归修复见[审查记录](../../../.scratch/review-seven-commits/spec.md)。

2026-10-02 暖会话修复：bootstrap 的所有者探测异步且不重叠；ps 失败保留 unknown，仅成功采样的 birth 变化、父 PID 变化或 liveness 的 ESRCH 才终止。NativeSession 报告真实 close 的 PID/code/signal；bootstrap 终止原因与 SDK 请求退出码为有限、token 关联的独立证据，缺失保持 null。Main 区分单 native 与 utility 退出，不凭 SIGKILL 猜 OOM 或 watchdog，见[记录](../../../.scratch/m2-first-release/warm-session-liveness.md)。
