# 03 接入原生 prompt 结果与有限持久证据

Status: resolved
Blocked by: none

范围/授权见 [spec](../spec.md)，证据含义见 [design](../design.md)。关联 D-02/D-11/D-21/D-22/D-24/D-34/D-35；不创建新 Agent 队列或产品 Run。

## 目标与修改范围

为真实 prompt_result/session_settled/queue_update 消费字段建立 typed adapter，复用 requestId→submissionId+target。更新 protocol/Host/execution contracts、coordinator/repository、RuntimeService 与恢复展示、必要 DB migration；全部生产者消费者同批切换。Main 保存有限结果和未决观察，OMP 仍是结果来源和队列拥有者。

## 验收

- 原生 completed/aborted/error、local-only、两个 follow-up/steer 与旧 run 的终态交错都有真实目标 SDK fixture；不把 agent_end 或 generic idle 归给未知提交。
- 保留真实 FrameDecoder→NativeSession→SessionHost→RuntimeService→SQLite 调度；terminal 与 ACK 保存交错、重复、旧代次和写失败验证最终收据/草稿外部结果。
- completed 且 sessionSettled=false 仍保留后台活动，不允许提前回收/退出；迟到 success 不清已有 error。
- ACK 已保存但 terminal 未保存时真正重启保持 ACK/原文并说明结果 unknown；已保存 terminal 重启不丢失；旧 schema unobserved 不猜成功。
- evidence 重送限于同活实例的事实，不能重写 prompt；Host 再崩溃/缓存满/Main 不可写如实保留缺口。
- 原生队列 snapshot/event 是展示源；一例压缩与新输入、重复 steer 消费的实际结果验证。不在此票实现全部队列编辑 GUI。

DB 备份/迁移失败与 ACK+revision 事务保持；diagnostics 默认无正文/秘密。unknown 无自动 replay/Query retry。收据迁移不开放旧原生会话写恢复。

## Comments

2026-10-01：v18.4.5 提供完整原生依据，现有 partial prompt_result 适配待补。

2026-10-01 实施：按用户后续授权完成最终目标 18.4.6。调用 ACK、精确 prompt_result、内置 local response 与 session settled 独立；Host 有界证据确认/重送与无正文近期关联、Main/schema 6 有限结果、错误优先恢复、Renderer 结果/覆盖缺口已接入。原生队列快照与实际消费录制完成，不扩展 M2 队列编辑 GUI。

## Answer

03 工程实现与目标SDK验证完成。实际证据、红绿记录、复现脚本和范围限制见 [native-outcomes](../evidence/native-outcomes.md)。范围验证 **210 passed / 1 skipped**（29 passed files / 1 skipped），Main/Host/Renderer TypeScript 与受影响 Biome 通过。

完整 Decoder→NativeSession→SessionHost→RuntimeService→SQLite 回归覆盖真实 SDK completed/aborted/error/local-only、ACK/terminal 保存交错、重复与迟到错误、写锁重送、未确认证据阻止正常 idle 回收、Host 再丢失、真正关闭重开及 schema 6 备份失败。后台 sessionSettled=false、旧 run 和未排空队列使用目标 SDK 原生类受控事件，与完整 localhost RPC 样本分别标明，不冒称真实计费供应商或完整 GUI 用户认可。
