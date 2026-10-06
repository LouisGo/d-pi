# 05d 原生子 Agent 状态与结果观察

Status: claimed
Blocked by: none

M2，父票[05](05-queue-subagent.md)，范围依据[spec](../spec.md#2026-10-06-生命周期切片)、D-27、V1-06 和 conversation 合同。

交付：从固定官方 OMP 18.4.6 可用 RPC/事件读取子 Agent 的真实身份、阶段及可取得结果，正式 GUI 有稳定观察入口。初始化和 Renderer 重连可重建有界投影；Thread/connectionGeneration 隔离，迟到/重复/缺失事件保持真实覆盖原因。原生终态/可得结果与默认配置、主提交状态分别表达，不以 agent_end 推断所有子任务结束；不改 OMP 调度、工具或共享配置。

沿用原生 get_subagents / get_subagent_messages / subscription 或已验证公开能力；摘要/结果限额、截断/不可读显式。不能让 Renderer 传任意原生文件路径，历史可读不代表可执行。需要 SDK 样本时用 localhost fixture、无个人凭据/费用。TDD 覆盖真实固定 SDK 形态、同名不同任务、流式/终态、事件竞争、双 Thread、重连、失败和 UI 可达；不宣称完整 TUI 或冷执行恢复。

纯工程票可 resolved，用户认可由 spec 维护。
