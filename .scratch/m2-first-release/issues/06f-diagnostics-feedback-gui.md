# 06f 正式诊断GUI与反馈闭环

Status: claimed
Blocked by: none

所属范围、授权与验收见[spec](../spec.md#2026-10-06-基础诊断导出与故障反馈切片)。本票为工程验收，用户认可由spec独立维护。

正式全局与故障trace入口、时间/trace/Thread/Writer/阶段筛选、明确刷新/旧采样/失败、记录与覆盖缺口、脱敏本地导出和可复制反馈模板。Query仅用于读取，导出明确意图不重试；卸载/迟到结果不串scope，主题/密度/语言/焦点可达。TDD真实React行为。
