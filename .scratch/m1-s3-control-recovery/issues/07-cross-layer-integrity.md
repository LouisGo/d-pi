# 07 跨层提交重试与断线生命周期一致性

Status: resolved

2026-09-28。用户授权修复最新复核前三项，并沿相邻路径检查、合并必须现在处理的问题；以安全进入 S4 为目标，最终一次本地 commit，不推送、不启动 S4。受影响 D-21/D-22/D-24/D-29/D-35，沿用官方 SDK 与现有所有权。

## 行为与边界

- 明确 rejected 只释放对应 submissionId 的草稿捕获；不改正文、revision、撤销历史。unknown/error 不解锁，迟到旧拒绝不释放后续捕获。
- Main 的 executingIds 决定断线影响范围；Host 保留的请求关联仍接收迟到真实错误，不能让后来的连接故障改写已收束提交。
- 同类前置校验失败：prepare 后撤销授权、目录替换/不可读取，在派发前确定未写出的提交持久 rejected；重读收据避免并发已派发被误标。
- 同毫秒迟到 request reply 不覆盖事件已观察的 rejected/unknown/失败；调用 ACK 与 outcome 分别单调合并，unknown 后有效 ACK 仍可记录。

## 验证

每项先失败测试再修复。回归穿过真实 SubmissionModel/DraftController、RuntimeService、SessionHost 和 SQLite，只替换 Electron/原生进程传输；断线从 NativeObservation 进入 Host，不用单独的 Host exit 代替。正式记录见 [收尾复盘](../integrity-review.md)。

## 完成

生产修复及针对性验证完成；114 项测试、构建、固定 SDK 命令语义和隔离 GUI/SDK 检查通过。详细分层证据与限制见 [收尾复盘](../integrity-review.md)。工程完成不替代用户试用认可。
