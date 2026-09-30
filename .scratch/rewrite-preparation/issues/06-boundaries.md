# 06 跨进程与诊断边界

Status: claimed
Blocked by: none

阶段：既有 M1 重写。授权、待决项与继续边界见 [spec](../spec.md#推进与交接)。受影响决定：D-05、D-17、D-21/D-22、D-24、D-28–D-37 与 B-01，按实际触及项核对。

## 交付与验收

主 Agent 负责 desktop command/reply 对应关系、消费点 payload 必要字段、读取 received 在 I/O 前与真实终态。保留 trace/原因、未知事件开放、官方 SDK 不改；补相关固定版本真实证据。

## Comments

2026-09-30：从准备提交的干净 `codex/rewrite-core` 开始；不维持旧内部类/补丁形态，但保持正确的产品合同、事务、恢复与执行所有权。完成后记录实际验证、未覆盖项与提交。

2026-09-30 桥接切片：Command → ReplyFor 保留命令结果关系，统一边界关联校验（含 locale），调用者不再处理该命令不可能的回包；DesktopRequestError 保留 trace/code/cause，诊断不含原文或原始秘密错误。新测试先 2 项失败（错 locale 被接受、cause/trace 丢失），修正后桥接/renderer 4 文件 20 项通过，六套 tsc 通过。读取诊断及 payload 子项继续实现，不以该提交冒称整票完成。
