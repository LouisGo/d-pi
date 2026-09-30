# 诊断阅读与证据缺口（2026-09-30）

这是当前代码与已有样本的阅读说明，不是新增任务状态、用户认可或完整诊断验收。完整设计合同与可执行 JSONL trace 筛选命令见[诊断合同 §7.1](../../../docs/architecture/diagnostics.md#71-现有-jsonl-的-trace-筛选)。本轮没有新增导出 UI、日志查询服务或 OMP 日志镜像。

## 当前实际链路

- [Renderer 桌面模型](../../../src/app/renderer/model.ts)生成 trace，经[preload](../../../src/app/preload/index.ts)的 envelope 进入 [Main](../../../src/app/main/index.ts)。preload 的 `initiated`、`confirmed`、`acknowledgement-failed` 与 Main 的 `received`、`completed`/`failed`复用同一 trace/request/connection；preload 观察由 Main Writer 落盘，`observedAt: "preload"`不等于独立 Renderer 日志。
- [文件](../../../src/modules/files/renderer/queries.ts)/[Git](../../../src/modules/changes/renderer/queries.ts)查询生成请求 trace，前端失败对象保留该 trace 与 `attribution: "unknown"`。[Main 只读入口](../../../src/app/main/ipc/project-reads.ts)在 I/O 前记录 received，之后记录 completed/failed 与耗时；Main 生成 requestId、以 Writer 实例作为 connectionId。当前 history 读取没有同样的 trace 接线。
- [提交协调器](../../../src/modules/execution/core/submission-coordinator.ts)的日志来自持久化收据，保留 submission/request/Thread/连接代次/目标实例 UUID。[SessionHost](../../../src/modules/execution/host/session-host.ts)保留冻结提交的 trace，并按 prompt ID 与目标关联 ACK/error；ACK 事件本身不带 trace，Main 用被验证的 requestId 与 target 找到收据 trace，不能只靠响应自报 trace 接受它。
- [运行控制入口](../../../src/app/main/ipc/execution.ts)记录 Main 接收与派发结果；Host 的 `operation-result`保留命令 trace/generation，[RuntimeService](../../../src/modules/execution/main/runtime-service.ts)校验当前 generation 后记录终态。这个返回记录的 requestId 当前取 traceId，不能与入口新生成的 Main requestId 强行视为同一个 span。
- RuntimeService 在 Host interrupted/failed 时记录 `runtime:host + disconnected/failed`，在 utility Host exit 时记录 `runtime:host + exited`；这是 Main 对 Host 的监督观察，Host 没有独立 Writer。生命周期 trace/request 使用 RuntimeView.traceId，按 generation/connectionId 关联该实例，未必与某个提交 trace 相同。已知安全 code 只保留 spawn/protocol/exit/write/state-unavailable/active-work/runtime-unavailable，其他原因记 unknown。

Main Writer [实际 schema](../../../src/platform/main/diagnostics/diagnostics.ts)使用 `time`、`operation`、`stage`、`process: "main"`、`build`，不使用设计中的 timestamp/eventName/phase/level。span/parentSpan、eventId/seq、完整 appSession/采样/因果 links、Renderer/Host 独立采集身份仍未实现。目标实例 UUID 由 Main 生成并经 ready 校验，不是 OS pid；未有 Host 独立日志时不填写一个虚构的 Host process 来源。

## 最后确认阶段

已有 [clean-restore-trace.jsonl](clean-restore-trace.jsonl)的真实开发态 restore trace 为 `9c99945e-f527-4eda-a8f5-84a5dd479556`，request 为 `06f2dce9-3512-4273-950d-c181ffcbaa25`；四条记录依次是 preload initiated、Main received、Main completed、preload confirmed。最后确认位置是 preload 已校验桌面回复；这不证明 OMP 已启动。样本 build 的 commit 是 unknown、dirty 为 true，不能作为发布构建身份。

复用合同中的筛选命令时可设置：

```sh
export DP_LOG_DIR="$PWD/.scratch/rewrite-preparation/evidence"
export DP_TRACE='9c99945e-f527-4eda-a8f5-84a5dd479556'
# 执行诊断合同 §7.1 的 node 命令，预期 matches: 4、invalidLines: 0。
```

提交链中的最后确认要按不同事实阅读：

- prepared：原文和目标身份已持久化；dispatching：派发门已持久化，尚不证明原生接受。
- acknowledged：关联 prompt 的调用确认已持久化；每条协调器日志同时带 receiptState/outcome，ACK 后 outcome failed/unknown 都合法。rejected 原因只属于该 attempt；旧的无原因 rejected 行继续合法。
- disconnected：传输不可继续；[NativeSession](../../../src/modules/execution/host/native-session.ts)的 exited 是原生子进程 close 的独立确认，即使先断连，后续 close 仍发出 exited。Main `runtime:host + exited`是 utility Host 退出观察，不能扩大为官方 Native 执行全生命周期单写证据。不能把断连当作进程死亡，也不能据此释放执行所有权或重发 unknown。

RuntimeService.onExit 逐真实 in-flight 收据记录 `submit + stage: unknown + code: host-exited`，保留该收据原 trace/request/target，并带更新后的 receiptState/outcome。例如接受后 Host 退出可读到 `receiptState: acknowledged + outcome: unknown`；stage unknown 不表示 ACK 被撤销，已有 failed 也不被覆盖。要找实例的 `runtime:host`监督观察，按同一 connectionId 扩大筛选，再核对 build/Writer/Thread，不将不同生命周期 trace 改造成提交 trace。

这次补齐了 Main 已观察的断连/utility 退出和执行结果变化；Host 原生观察仍无独立通用诊断 Writer，不能宣称完整 trace。日志可能轮转或丢弃，最后一行不自动等于当前业务事实。诊断不是恢复事实来源；缺全周期单写证据时冷恢复继续只读。

## 证据层次与未覆盖项

[SDK 边界证据](sdk-boundary.md)来自固定官方 OMP 18.3.0 的真实 SDK 事件，本地 provider fixture 合成模型响应；[原始帧](sdk-control.frames.jsonl)保留 ID、字段和顺序。其 `response id + command + success` 是原生边界观察，帧本身没有应用 trace，须通过当次请求映射关联；不能冒称 OMP 内部 trace、真实供应商故障或当前应用 JSONL 的完整阶段。

[native-evidence-replay.integration.test.ts](../../../tests/integration/native-evidence-replay.integration.test.ts)将真实样本碎片化后重走生产 Decoder/Conversation 投影，证明消费边界。[runtime-causality.integration.test.ts](../../../tests/integration/runtime-causality.integration.test.ts)使用传输替身/故障注入，检查同批旧 idle 不覆盖较新 ACK/执行事实，以及 protocol 断连与 close 的区别；本轮新增日志回归检查 receiptState/outcome、runtime:host disconnected/exited 和同一收据 trace/request/target。日志回调失败不阻断业务是既有保证的直接绿色补测，不伪称历史 TDD。这些都不是 SDK 真实故障或用户 GUI 证据。

未覆盖：真实供应商 ACK 后异步故障与工具修改、个人扩展、Renderer/Host 独立诊断采集、完整 span/error 因果链、丢弃摘要落盘、崩溃尾部零丢失、冷恢复执行全周期单写和用户试用。自动检查通过不能将这些缺口或设计要求改记为已完成。
