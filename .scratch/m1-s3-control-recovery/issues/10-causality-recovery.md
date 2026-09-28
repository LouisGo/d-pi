# 10 因果观测、prepared 恢复与原生退出清理

Status: resolved

2026-09-28。基线 `2008d59`；用户授权独立复核、修复及本地 commit，不推送、不实施 S4。

交付：Host 有效状态观测与 Main 当前派发空闲证明；显式继续原 prepared（用户已确认选择）；真实 native close 清理残留 Host；退出查询的旧观察保护。unknown、在途/后台不确定性、冷恢复单写门槛不变。与 issue 09 非空队列放弃分别处理。

测试按目标反例先红后绿，保留真实解帧/Promise 调度和 SQLite/Renderer 重建；正式 GUI/官方 SDK 验证恢复操作及空闲退出。根因、证据和限制见 [复核记录](../causality-recovery-review.md)。
