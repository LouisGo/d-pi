# 01 术语与命名

Status: resolved
Blocked by: none

范围与授权见 [spec](../spec.md)。定义与真实行为一致，迁移非持久内部标识及目录，显式保留 SQLite 兼容边界。

## 验收

记录实际变化、检查、证据与未覆盖项；工程 resolved 不代表用户认可。禁止 push 和 S5/M2。

## Answer

- 工作目录的代码身份统一为 `workingDirectoryId`，领域模块迁到 `threads`；原生会话关联使用 `NativeSessionBinding`，目录执行许可使用 `ExecutionGrant`。项目选择协调、App Thread 选择状态和文件面板各自按职责命名；连接 DTO 使用 `connectionGeneration`，本地请求计数使用 `requestGeneration`。
- SQLite `workspace` / `workspace_id` 保留，由 threads 与 input 仓储 SQL alias 映射；schema仍v5，不改实体/原文/原生协议/冻结收据持久 target。原生阅读自有文案明确原生会话。
- 旧v5数据的新目录身份回归先失败，迁移后恢复ID、信任、原生绑定和混合换行草稿不变；CAS、ACK与消费事务、连接代次/迟到事件、查询隔离等回归通过。类型六入口通过，222项受影响测试通过、1项CLI原生opt-in跳过。
- 原始日志：[红灯](../evidence/terminology-red.txt)、[绿色回归](../evidence/terminology-green.txt)、[类型](../evidence/terminology-types.txt)。后续冻结审阅及必要原生验证见05票；工程完成不替代用户体验认可。
