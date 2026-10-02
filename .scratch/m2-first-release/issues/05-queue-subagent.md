# 05 队列与子 Agent

Status: open
Blocked by: none

所属范围与授权见 [spec](../spec.md)。

沿用原生所有权实现完整队列管理和当前 Thread 后续子 Agent 配置，实际消费竞争与请求隔离验证；不依赖 S3 退出放弃决定。

## Comments

2026-09-30：M2 明确授权接续 S5；这是工程票，用户认可在 spec 单独维护。

2026-10-01 固定源码依据：`Settings.override(path,value)` 为原生实例内、不持久的覆盖，`resolveEffectiveSubagentPolicy` 在后续 spawn 时读取 `task.agentModelOverrides`，优先级仍归原生 resolver。可继续实例隔离接入，不能改共享文件再改回模拟。原生 Agent `peekSteeringQueue`/`peekFollowUpQueue` 与 `replaceQueues` 可访问真实队列，消费前 hook 不带队列种类；编辑门控须验证批次/竞争及隐藏伴随消息，不复制 App 队列事实。这些只是源码依据，不是 App 已实现/隔离 spawn 或队列竞争已通过。

2026-10-02：独立行为拆为[05a](05a-native-queue-management.md)和[05b](05b-thread-subagent-configuration.md)；完整父票未完成范围保持，附件编辑仍按04准备管线接续。

2026-10-02：05a纯文本增量、05b后续默认配置工程完成并交付m2.11候选；完整附件内容编辑与子Agent全生命周期观察等父票未完成范围保持open，不把工程或包内通过视为用户认可。[交接](../next-stage.md)。

2026-10-02：附件引用与带图队列按04a/05c实施，见[本轮切片](../content-preparation.md)。PDF完整视觉/OCR表示、B4回收与完整子Agent生命周期等仍保留父票；不把最近增量或工具通过当全集完成。

2026-10-02：04a/05c工程完成，clean m2.13候选已交付待试用，18项实际macOS检查与独立review修复复核通过。父票未完成范围保留；04继续PDF完整视觉/OCR与B4回收，05继续完整子Agent生命周期等，不将子票完成扩大为全集完成。[试用与限制](../content-preparation.md#候选与试用)。
