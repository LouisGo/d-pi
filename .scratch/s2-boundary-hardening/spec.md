# S2 领域与生命周期边界巩固

2026-09-28。起点 `dd3f1a2`。用户要求：判断三项结构调整是否必要，完成修复、检查及本地 commit，提供开启 S3 的 prompt。本轮不实施 S3，不推送。

## 判断与落地

三项均有必要，但只调整现有职责，不引入框架、分包或新产品概念。沿用 D-24 官方 OMP、D-28–D-30 无头与生命周期、D-34 SQLite、D-35 类型与数据边界；无决定变更。

1. **Thread 执行上下文独立于 Draft**：`features/threads/contracts.ts` 定义稳定目录/身份/授权合同；`ThreadRepository` 独立查询上下文。Runtime 准入、提交身份核对、历史与阅读通道不加载草稿正文或草稿消费状态。Draft 仍组合 Thread 身份供编辑使用。
2. **存储与生命周期按所有者拆分**：`main/storage/` 分开数据库连接与迁移、Thread、Draft、Submission、Preferences，`AppStorage` 只组装。所有仓储共用一个 SQLite 连接，ACK 收据与草稿消费仍在同一事务。保留 v4 表结构与迁移顺序，不为代码拆分迁移用户数据。`HostConnection` 管 utility process/握手/传输/退出；`RuntimeService` 保留准入、绑定和业务协调。`host/index.ts` 只启动和校验入口；每个 `createSessionHost` 独占原生会话、投影、端口、待答状态和定时器。
3. **合同归领域，平台实现归适配层**：删除通用 `shared/contracts.ts`，业务合同归各 feature；共享身份、偏好和桌面桥接组合分别命名。阅读投影依赖 `runtime/native-protocol.ts`，不再反向导入 Host decoder。目录身份读取归 `shared/node/directory.ts`，Host 不导入 Main。源码边界检查防止 feature 导入进程/Node 实现、Host 导入 Main；该检查不是完整依赖分析器。

目录职责与当前实现入口已同步至[模块地图](../../docs/architecture/modules/README.md)。保持单应用、按功能组织无头逻辑、按进程组织适配层，适合当前 S2 规模。Main 的启动装配、现有单 Thread 桌面桥接仍可随具体 S3 场景演进；没有证据要求现在另造通用生命周期框架。

## 验证

- `pnpm check`：类型、Biome、设计系统和依赖边界通过；26 个测试文件、76 项通过，1 项可选原生 smoke 默认跳过。见 [checks.log](evidence/checks.log)。
- `pnpm build`：通过。
- `pnpm exec electron validation/s2/host-smoke.cjs`：真实 utility Host 与固定官方 OMP 握手，两次 `/model` 在 ACK 后恢复空闲，Host/原生进程正常退出。
- `pnpm exec electron validation/s2/host-failure.cjs`：启动目录身份不符时失败并释放 Host/原生子进程。
- `D_PI_NATIVE_SMOKE=1 pnpm exec vitest run src/host/native-smoke.test.ts`：独立通过，官方 OMP 两轮普通流式输入沿用同一原生会话，第二轮上下文含首轮内容。使用隔离配置和本地模型 fixture，无个人凭据或供应商调用。
- 新行为测试覆盖 Runtime 不读 Draft。重构中先由失败测试捕获就绪后状态被旧握手覆盖、fork 前失败被误判为已有会话，再修正。补测两个 Host 所有者之间的投影/请求关联/定时器及关闭隔离；补测既有行为不称为历史 TDD。
- 复用已有真实 SQLite 迁移、重启恢复、写锁失败、ACK 事务回滚和 A 清/B 保留测试。协议载荷与用户流程未改，官方 OMP 未修改。

本轮未重跑 GUI/打包矩阵。`dist/s2-candidate` 仍是之前的历史包，不包含此前 review 修复及本次结构调整；运行当前源码用 `pnpm dev`。用户试用、真实中文输入法与个人配置仍待反馈。

## S3 进入结论与继续边界

当前没有发现阻止 **开始 S3 规格、关键证据核对与实现** 的架构问题；这不代表 S3 功能已验收。下一会话先读本记录、[S2 spec](../m1-s2-submit-read/spec.md)、[S2 交接](../m1-s2-submit-read/handoff.md)和 [M1 计划](../development-foundation/spec.md)。

- T3：保留官方 OMP，核对队列消费前控制与原生扩展接入能力；不以 App 本地自动续发冒充原生队列。重要产品取舍先对齐，只阻塞依赖该取舍的工作。
- T4：恢复执行前确认原生会话单写/占用；publish lock 不能视为整个执行周期互斥。证据不足时保持只读、禁止强占，不用新建会话冒充恢复。
- 结果未知不自动重发，ACK 不冒充业务接受，视图关闭不结束后台任务。沿用 S2 已有固定源码和工程证据，只对影响选择的关键未知做最小实验。
- S3 实际开发须由用户采用下一阶段 prompt 或其他明确指令开启；本次不扩大为 S4/M2、自用迁入或推送。
