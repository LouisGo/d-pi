## Summary

补齐 M2 的基础诊断导出/故障反馈和多 Thread 提醒。诊断面板复用现有 JSONL/trace，提供有界筛选、白名单脱敏、本地原生保存及可复制反馈模板；后台待回答/失败提供不抢焦点的应用内提醒，点击定位当前真实交互或失败收据。完成默认仅更新完成/未读，系统与完成通知须明确开启。

多提醒独立滚动，为当前阅读保留四行并保持 Composer/草稿；迟到首次 Runtime inspect 就位后再定位，后续更新不夺焦。Main 观察独立于窗口/Renderer，通知不改变执行事实、回答或提交重发。

目标 base 为 main `1c9c30a`。本 PR 同时包含之前未推送的诊断和提醒两个切片；附件、队列、子 Agent 与长正文的既有交付已在 base 中。所属 [M2 spec](https://github.com/LouisGo/d-pi/blob/codex/m2-thread-attention/.scratch/m2-first-release/spec.md)，诊断06e/06f/06g与提醒01a/01b工程完成。**01c实际系统通知显示/点击仍待验，M2整体与用户认可保持开放，因此本 PR 为 Draft。**

## Evidence

- TDD 与独立 Spec/Standards review 已覆盖两个切片及各产品修复：[诊断评审](https://github.com/LouisGo/d-pi/blob/codex/m2-thread-attention/.scratch/m2-first-release/diagnostics-review.md)、[提醒评审](https://github.com/LouisGo/d-pi/blob/codex/m2-thread-attention/.scratch/m2-first-release/attention-review.md)。真实失败包括阅读被提醒挤压、失败收据裁切、迟到Runtime状态丢失定位；均修复并复核。新 PR 组合复核与最终远端检查另由交接记录维护。
- 最终生产源完整 `pnpm check`：796行为、34架构、74工具通过，2既有 opt-in 跳过；build、文档/看板/架构及最终 `check:fast` 通过。精确原始结果保存在上述交接链接。
- [诊断候选](https://github.com/LouisGo/d-pi/blob/codex/m2-thread-attention/.scratch/m2-first-release/diagnostics.md)：clean m2.17，21项实际隔离macOS检查；真实原生保存/取消、0600脱敏报告、反馈复制、Writer故障及启动损坏数据库入口。读取预算12文件/8MiB/20000行/64KiB单行/1500ms，导出最多2MiB。合成秘密/坏行样本明确标记，未冒充真实供应商故障。
- [当前候选与试用](https://github.com/LouisGo/d-pi/blob/codex/m2-thread-attention/.scratch/m2-first-release/attention.md)：clean `0.1.0-m2.19 / 48cd01cc-42704447`，产品源码 `48cd01cc`；外部harness `adcd4d3`。18项实际固定SDK+localhost/macOS检查通过；真实后台、Cmd+W关窗而App仍运行、Finder精确bundle重开同Main、closed供应商请求恰好一次；真实冷启动偏好保存/旧Thread只读。五组9–10提醒预算与最后项focus/内部滚动、阅读/完整Composer/草稿及采样焦点恢复通过。全部ZIP CRC及source/受测副本/ZIP app.asar同源。
- **已知限制：系统提醒实际 `failed`，App内失败反馈/状态可用，真实OS显示/点击未观察，根因unknown；没有模拟通知callback，未签名/公证。** Chromium composition不替代系统IME；隔离SDK样本不替代真实账户/付费供应商或用户认可。PDF视觉/OCR、完整V1-00/B6负载/故障组合仍未完成。

## Merge Danger

SQLite schema11新增App通知偏好，属于持久化 one-way door：源码revert不降级数据库，旧候选会拒绝新schema。需要退回旧版时保留当前数据库/附件及新增工作，使用升级前 before-v11 备份在独立数据根验证，不覆盖新数据或删库掩盖恢复失败。

影响链为Main真实Runtime/收据→有界提醒投影→trusted IPC/preload→GUI定位/通用Notification与显式窗口入口，以及既有Writer→有界Reader→本地保存。诊断仅白名单导出，反馈不上传；不引入新OMP队列/执行事实或自动重试。unknown不自动重发，冷旧Thread继续只读。仅推送当前开发分支并创建PR，不合并、不公开发布、不扩M3；签名权限和真实个人账户未扩大。
