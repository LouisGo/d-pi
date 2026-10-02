# 普通导航后的暖会话中断

2026-10-02。用户报告两次“alpha 双无模型 Thread → beta 历史 → alpha/back/forward”，授权优雅修复并 commit；本轮只本地提交，不将旧报告或工程检查视为用户认可。范围见 [10](issues/10-warm-session-liveness.md)，沿用 D-02/D-08/D-21/D-22/D-24/D-39，无新增产品待决。

## 原始证据与判断

用户提供 `dpi-gui-retest-7ae6962.zip`；[原始报告](evidence/gui-retest-7ae6962.md)保留原文，[元信息与两次时间线](evidence/warm-interruption-source.json)记录来源哈希与诊断摘录。原报告固定 Linux x64 构建 `7ae6962c-5e567df2`，没有提交、模型或真实认证。当前修复从 `5d8a323` 开始。

- 两次 Main 仍存活；原生 scope 分别于 02:07:42 UTC、02:15:45 UTC 在约 8ms 内断开。每轮四个配置快照同时启动，完成耗时分别约 26s、131s。20s 的本地 timeout 回调也显著迟到，支持当时存在调度/资源压力的推断，但不证明 OOM。
- 源码事实：导航没有调用 Main 的 closeIdle；历史 list/read 为寻找配置目录各调用一次完整只读配置采样，与配置 UI 采样共享 NativeConfiguration，但原实现未限制读取进程并发。
- 确定缺陷：bootstrap 将一次 `ps` 查询失败的 null 与已登记 birth 比较，误认为所有者被替换，继而 SIGKILL 整个原生组。对 Main 和 SessionHost 两种查询失败的测试均先失败。
- 原始两次退出没有 code/signal/watchdog reason，**具体原因仍 unknown**；不把上述可达机制宣称为原事故的唯一根因，也不归罪于 UI 修复。调查中的日期正则假设已被真实生成代码和进程验证排除。

## 修复与资源所有权

bootstrap 在导入 SDK 前仍验证 permit；看门狗使用异步 ps、每个原生实例最多一个检查周期。ps 失败/空结果保留 unknown；kill(pid,0) 的 ESRCH、父 PID 变化或成功采样的 birth 不匹配才触发终止。临时 EPERM/超时不杀存活会话。这里是 SDK 导入前、无依赖的受管进程 bootstrap，使用原生 timer/child_process；NativeSession 的业务等待及释放仍由既有 Effect Scope 统一拥有。

终止前最多等待 100ms 刷出固定原因和 SDK 请求的退出码；NativeSession 按 token 和有限 schema 读取，不转交阅读投影，也不记录 stderr/业务内容。close 的 PID/code/signal 经 SessionHost → HostConnection → RuntimeService 到 Main 诊断。utility 退出单独记录 Electron 提供的 code，未提供的 signal 保持 null。外部 SIGKILL/SIGTERM 不自动归因为看门狗；损坏协议或强杀可能使原因帧缺失，保持 null。

NativeConfiguration 控制所有入口（配置 UI、项目历史 list/read）的快照资源：最多一个读取子进程、八个等待请求，等待最长 20s，实际子进程继续保留 20s 超时。超限/等待过期返回既有类型化失败，不启动更多 SDK。每个请求保持独立 scope/trace，不共享或改写别人的快照；排队后仍核验原 Thread/工作目录，dispose 释放等待者。认证 mutation 保持独立准入与取消出口，不能被读取排队锁住。配置子进程也补 PID/code/signal 诊断。

这是读取资源调度，不是 OMP 执行队列。草稿、事务、原生身份、unknown 不重发、冷恢复只读及真实故障后的只读保护不变。

## 验证与复试

已完成先红后绿：两种 ps 失败不误杀、四个并发快照只启动一个 SDK、退出证据不会在运输中被丢弃。真实 Node 子进程的两个 scope 在连续注入 ps 超时后仍可查询；正常 EOF、SDK exit(7)、外部 SIGTERM 的实际 code/signal/原因有独立断言。排队上限/超时、目标删除、dispose、跨请求身份和 Main 诊断接入有回归。

固定 Node 24.21.0 / pnpm 12.8.1 的完整 `pnpm check` 通过：526 行为、34 架构、50 tooling；固定 CLI opt-in smoke 仍跳过。`pnpm build` 通过。真实 macOS arm64 Electron 44.4.5 / Bun 1.3.14 / OMP 18.4.6 的[监督结果](evidence/warm-session-supervision.json)通过：两条 live scope 在四个并发只读配置请求后保持 ready，读取进程峰值为 1；等待多个看门狗周期后仍能由真实 RPC 核验 idle 并正常关闭。单 Bun 故障保留另一 scope，Host/Main 故障终止所属 native/工具组，ACK 与原文保留，冷恢复仍只读；SQLite 写锁下实际停止仍通过。原脚本在同一隔离 HOME/App/配置下运行，没有个人凭据或外部供应商请求。

这是源码工作树的工程与原生监督验证，不是新的正式包或 Linux GUI 复试；真实 Node ps 故障注入也不能替代原事故的退出原因。原始两次事故根因仍 unknown，需在修复版按原路径复试并核对新诊断；用户认可继续 pending。

用户复试同一短路径，预期两个 scope 持续 ready/no-model、各自草稿保留，历史/配置没有并发启动 SDK 的峰值。若仍中断，在 `userData/logs/main.jsonl` 按 Thread/connection/build 查看：

- `runtime:native-exit`：processPid、exitCode、exitSignal、terminationReason、requestedExitCode；只有带具体 watchdog reason 的证据才支持该归因。
- `runtime:utility-exit`：整个 utility 的退出；单 scope 正常关闭不冒称 utility 已死。
- `configuration:snapshot:adapter`：采样实际执行与进程退出；`configuration:snapshot:queue`：容量/等待/释放的类型化失败。

Main/utility 若先遭强杀，原因转交可能缺失；null 是证据缺口，不能推断正常结束或已安全重连。
