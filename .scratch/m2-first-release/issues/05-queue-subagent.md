# 05 队列与子 Agent

Status: open
Blocked by: 05a, 05b

所属范围与授权见 [spec](../spec.md)。

沿用原生所有权实现完整队列管理和当前 Thread 后续子 Agent 配置，实际消费竞争与请求隔离验证；不依赖 S3 退出放弃决定。

## Comments

2026-09-30：M2 明确授权接续 S5；这是工程票，用户认可在 spec 单独维护。

2026-10-01 固定源码依据：`Settings.override(path,value)` 为原生实例内、不持久的覆盖，`resolveEffectiveSubagentPolicy` 在后续 spawn 时读取 `task.agentModelOverrides`，优先级仍归原生 resolver。可继续实例隔离接入，不能改共享文件再改回模拟。原生 Agent `peekSteeringQueue`/`peekFollowUpQueue` 与 `replaceQueues` 可访问真实队列，消费前 hook 不带队列种类；编辑门控须验证批次/竞争及隐藏伴随消息，不复制 App 队列事实。这些只是源码依据，不是 App 已实现/隔离 spawn 或队列竞争已通过。

2026-10-02：独立行为拆为[05a](05a-native-queue-management.md)和[05b](05b-thread-subagent-configuration.md)；完整父票未完成范围保持，附件编辑仍按04准备管线接续。
