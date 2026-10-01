# 01 原生生命周期

Status: resolved
Blocked by: none

所属：基建；授权、范围、验收与拥有者见[规格](../spec.md)。

替换 NativeSession 手写超时和在途等待清理，保留单次派发、协议身份匹配、进程监督与原生输出排空。新增 Effect 导入门禁，更新决定和受影响模块说明。

## Comments

- 2026-10-02：新增关闭立即结束在途 RPC、同时仍等待真实进程退出的测试，先验证目标缺口。

## Answer

NativeSession 已使用 Effect 4.0.0 Scope/Fiber/Deferred/timeoutOrElse，统一 ready/RPC 等待、超时关联清理和进程释放；关闭拒绝新请求/原始写入，重复关闭复用同一完整 finalization Promise，保留独立 close/groupStopped 证据。

测试确认原关闭等待缺口为红灯，再实现为绿灯；其余正确行为补测不伪造红灯。导入门禁及稳定 v4 必需依赖门禁也分别验证红→绿。注册许可、输入预算、64 并发限额、超时释放、迟到回复无重发、原始 Error、真实工具心跳终止保持正确。全部工程和原生 fixture 验证见[记录](../validation.md)，不承诺真实账户/供应商验收。
