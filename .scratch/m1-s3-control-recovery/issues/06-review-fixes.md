# 06 独立评审后的准入、控制失败与退出收束

Status: resolved

2026-09-28。用户要求修复独立评审的三项问题，确认可进入 S4 后本地 commit，不推送。本轮仅修复 S3 并判断 S4 工程进入条件，不实施 S4。沿用 D-11/D-21/D-22/D-24/D-29/D-35，无新增待决产品问题。

## 实现与所有权

- Main 与 Composer 的按钮、Enter 共用 `canSubmit`：忙碌允许原生排队，待答/unknown/不支持交互不允许新提交。Host 仍在实际写出前复核，解决跨进程竞争。
- Main 派发前或 Host 写出前的明确拒绝记录为 `rejected`，原文与草稿保留，不清稿、不自动再发；不再冒称 disconnected。准备后准入改变也结束为 rejected，允许用户以新 ID 再发同一草稿版本，旧 ID 不重放。SDK 的普通 error 仍不冒称从未执行。
- 控制请求失败使用独立 operation-result failed，带原 trace/代次；连接故障才进入 interrupted。失败不表示副作用绝未发生，不自动重试。
- Main 在原生无执行、队列、后台、待答等活动时逐项收束 rejected/明确失败/已 ACK 且非 unknown 的记录；真正 unknown 或未得回执仍阻止退出。状态和回执两种到达顺序都能收束，不依赖再来一帧状态。

## 验证

逐行为先失败后最小修复：待答准入、Host 未派发、控制拒绝、明确失败的空闲收束；unknown 保守保护是既有正确行为补测。追加存储测试确认未派发不能被 ACK 消费、跨重启保留、同版本显式新发送只清对应稿；自查发现并纠正修补时意外放宽 prepared ACK 的条件。

最终命令、结果与 S4 判断见 [review-fixes](../review-fixes.md)。无官方 SDK 改动，无自动重发或强占恢复。
