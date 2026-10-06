# 05d 原生子 Agent 状态与结果观察

Status: resolved
Blocked by: none

M2，父票[05](05-queue-subagent.md)，范围依据[spec](../spec.md#2026-10-06-生命周期切片)、D-27、V1-06 和 conversation 合同。

交付：从固定官方 OMP 18.4.6 可用 RPC/事件读取子 Agent 的真实身份、阶段及可取得结果，正式 GUI 有稳定观察入口。初始化和 Renderer 重连可重建有界投影；Thread/connectionGeneration 隔离，迟到/重复/缺失事件保持真实覆盖原因。原生终态/可得结果与默认配置、主提交状态分别表达，不以 agent_end 推断所有子任务结束；不改 OMP 调度、工具或共享配置。

沿用原生 get_subagents / get_subagent_messages / subscription 或已验证公开能力；摘要/结果限额、截断/不可读显式。不能让 Renderer 传任意原生文件路径，历史可读不代表可执行。需要 SDK 样本时用 localhost fixture、无个人凭据/费用。TDD 覆盖真实固定 SDK 形态、同名不同任务、流式/终态、事件竞争、双 Thread、重连、失败和 UI 可达；不宣称完整 TUI 或冷执行恢复。

纯工程票可 resolved，用户认可由 spec 维护。

## 2026-10-06 工程集成

Worker `60ebdc2fdf199e2261973f3dd031599f9f7fc16d`，固定基点 `ade890c`；主分支串行集成为 `dea8b46`。沿用 Conversation 投影及正式消息视图，新增原生身份/独立状态/有界结果，不接管执行。缺号自动重连最多三次，随后保留 gap 并允许显式只读重连。

Worker 全量行为 667 通过，1 既有 CLI opt-in 跳过；类型、构建及相关门禁通过。主分支再次验证 20 项受影响行为和真实固定 SDK localhost 样本；同 Agent 两个 task，四次 supplier 调用，终态结果可读。原始结果在 `dist/validation/m2-lifecycle/05d/`、`05d-integrated.log`、`native-subagent-sdk.log`。整段独立评审与 macOS 包内验收由 [06b](06b-lifecycle-candidate.md)接续。

已知覆盖边界：Host 启动前完成的任务不能从原生活动快照重建；超过 1MiB 的 transcript 不全读，保留有界片段及 partial 原因。当前不是真实供应商或用户认可证据，冷执行恢复边界保持。

独立评审后补充（2026-10-06）：原生 yield 优先于普通说明文字，nullable error 参数遵从固定 SDK；live/transcript 两条真实失败回归已通过，包内 fixture 改用不同的 prose/yield 内容。整段最终独立复核和候选结果见 06b 交接。
