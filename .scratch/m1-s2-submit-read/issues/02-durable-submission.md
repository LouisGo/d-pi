# 02 — 冻结提交、持久调用确认与草稿保护

Status: open
Type: task
Stage: M1 S2
Blocked by: none
Labels: ready-for-agent

## 目标与依据

独立完成可执行的发送交接功能：捕获 A，先保存再派发，持久 ACK 后只消费 A，B 不丢，故障后冻结记录仍可读取。通过可替换 NativePort 验收；真实 Runtime/GUI 接线由 05 完成。

受影响决定：D-21/22/24/34/35。共同依据：[S2 spec](../spec.md)、[确认方案](../acceptance-decision.md)、[固定版本证据](../evidence.md)、[基础契约](../../../docs/architecture/foundation-contracts.md)。授权与用户试用状态以 spec 为准；本轮只拆票，未开始实现。

## 交付与所有权

- Main 唯一拥有收据与 SQLite 事务；输入功能复用已有串行保存/CAS。捕获编辑序号与 A 后绑定已知持久 revision，不 drain 最新稿后改取 B。
- prepared 含冻结正文，dispatching 再落盘，才授权一次原生写入。相同 submissionId 重入返回已有结果；重启 prepared 不自动派发，dispatching 恢复 unknown。
- 关联 ACK 与消费标记一个事务，不能改草稿正文/revision。有效草稿恢复识别已消费 revision；B 已保存/未保存都能正常继续，保存核对不能复活 A。
- ACK 与业务接受/执行错误分别保留。ACK 事务失败不清稿；已持久 ACK 后迟到错误不撤销确认、不覆盖 B。未知不自动重发。
- 提供持久发送记录查询与通知合同，原文可读/复制；S2 不 GC 唯一副本。现有草稿 4 MiB 与发送 JSONL 编码预算分离，超限不截断或拆分发送。
- 存储失败/旧代次/超时都有明确归属；日志不含正文或秘密。消费通知幂等，释放等待者和过期操作不触发重发。

## 验收

功能和修复遵循 TDD，先目标失败测试、最小实现、再必要重构；既有正确行为补测不伪称历史红灯。实现前读取适用的 headless-features / TypeScript skill，GUI 另读设计系统 skill。

- A2/A3/A5：先红后绿；真实临时 SQLite 覆盖写前失败零派发、重复 IPC 一次派发、迁移/回滚、通知丢失与重启。
- 捕获 A 后输入 B，覆盖 B 未保存、已保存、同文字新编辑、undo/redo、IME 暂缓清理；后续保存无伪冲突。
- A4 的可控故障：ACK 后同 ID 错误、ACK 写失败、断链、旧代次、超时迟到，不误清或重发。原生 transport 的实际映射在 05 验证。
- A6 的编码预算：可保存却不可发送的正文保留完整。无头接口可执行且有自动测试，不以只声明 DTO 交付。

## 边界与完成

不扩大 S3 控制/恢复、S4 文件/Diff 或 M2 认证/附件/多 Thread；不修改官方 OMP。按风险验证并记录实际结果，无头通过不代表 GUI 或用户认可。阻塞票须 resolved 后开始依赖工作；未知工程细节按现有证据收敛，重要新产品取舍才对齐用户。

## Comments

### 2026-09-28

依据用户“保留官方 OMP。开始同步规格并推进 to-tickets”创建。本票尚未领取、实现或验收。
