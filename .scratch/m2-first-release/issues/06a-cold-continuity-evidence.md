# 06a 冷恢复执行所有权证据

Status: resolved
Blocked by: none

所属范围与授权见 [spec](../spec.md#2026-10-02-下一阶段授权与本轮切片)。阶段M2，沿用D-11/D-24/D-27/D-28–D-30及模块合同。

固定SDK18.4.6核实原生身份、CLI/桌面/SDK全周期单写。必要最小双进程隔离实验。若无执行lease不得解禁旧Thread，unknown不重发；给出事实、缺口及可对齐方案。

## Comments

2026-10-02：本轮已领取，工程、候选与用户认可分别记录。

2026-10-02 工程收口：固定 SDK 18.4.6 的源码核查与隔离双进程反例已完成，详见[证据记录](../../m2-cold-continuity-boundary/research.md)。两个活的 SessionManager 可打开同一原生会话并分别成功写入；原生 publish lock 只保护单次写入，未提供执行全周期单写 lease 的保证。本票完成的是证据核查，不是冷执行恢复实现。旧 Thread 保持只读，unknown 不自动重发，既有原生 binding 不替换。

验收仍 pending；后续“复制历史到关联新 Thread”的用户可见语义、上下文完整性与未决收据处理需产品对齐，尚未获准替代原身份恢复。该待决不阻塞 05a/05b 独立工程。
