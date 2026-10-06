## Summary

故障trace此前主要依赖手动读取日志，缺少正式GUI筛选、脱敏报告和可复制反馈入口。现在复用Main JSONL，提供有界筛选、明确覆盖缺口、故障trace快捷入口、Main原生本地导出与用户审阅的反馈模板；不上传、不改变OMP执行或恢复所有权。所属[spec](spec.md#2026-10-06-基础诊断导出与故障反馈切片)、[06e](issues/06e-bounded-diagnostics.md)/[06f](issues/06f-diagnostics-feedback-gui.md)/[06g](issues/06g-diagnostics-candidate.md)。

## Evidence

base main 1c9c30a；产品source ba0e7df、clean m2.17 build ba0e7df1-808e60b8、harness49cfaa3。真实红绿及SSR/SQLite修正见[TDD](evidence/diagnostics-tdd.md)；751行为/34架构/74工具通过，2既有opt-in跳过。[两轴独立评审](diagnostics-review.md)确认高价值问题0/0；21项实际macOS包内检查包含保存/取消/剪贴板、真实Writer路径故障、损坏SQLite启动和8MiB预算，ZIP CRC与app.asar同源见[交接](diagnostics.md)。合成脱敏样本、实际固定SDK+localhost供应商与原生操作分开标记；未验证真实付费供应商、完整B6/M2负载或用户认可。

## Merge Danger

工程two-way door：可revert本切片恢复旧入口；不迁移数据库、不扩大任意文件/IPC权限、不依赖日志恢复业务。影响链为shared DTO → Main读取/保存 → preload校验 → shell诊断GUI；扫描及报告预算抑制资源放大，但协作式时限不能抢占未返回的OS I/O。原生保存会在用户选定位置生成或覆盖JSON，revert不会撤销已导出的文件，用户须自行保管/删除；0600私有写入、白名单与源身份重检降低泄漏风险。总体V1-00/父06/M2保持开放，用户认可pending。本地PR草稿，未push或创建远端PR。
