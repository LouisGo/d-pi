# 05 多终端、撤销与组合退出

Status: open
Blocked by: 04
阶段：M3。受影响决定：D-02/D-08/D-21/D-22/D-40。

授权与T-P2见[spec](../spec.md#产品待决)，行为单源见[契约 §1/§2/§6](../../../docs/architecture/terminal.md#6-生命周期与清理)。不建立第二份全App退出协调器。

## 行为与验收

一个Host多shell，目录列表/来源标识/会话与终态数量上限明确；同目录Thread与不同worktree按已确认T-P1行为切换，后台不误停。Host批处理公平，单shell故障不终止其余终端。TerminalHost崩溃所有旧实例失联、清理后用户明确新建；绝不自动接回或重放旧shell。

撤销执行信任汇总该目录终端与既有OMP资源，fence后阻止新输入/创建，核查停止后才能降级。真正退出汇总存活shell、OMP与清理未知，等待/结束后退出/取消具有真实结果；单终端end和App退出不以utility.kill冒充进程树清理。

TDD覆盖旧端口/旧permit竞争、共享目录撤销、创建第5个、退出取消后迟到事件、同时end、残留重试、自然exit与后台新组job；真实故障注入同时跑OMP，证明不误杀/不重启SessionHost或OMP。诊断与退出不依赖SQLite可写，清理失败不删除登记。通过适用硬门槛后及时交付Dev操作路径，用户反馈留spec。
