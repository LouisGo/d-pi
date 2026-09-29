# execution 模块

- `contracts/`、`core/`、`host/`、`main/`、`renderer/` 的公开面分别按环境导出；跨模块只走 `public.ts`，模块内部不绕回自身总入口。
- App 收据、准入、停止/继续、待答和当前执行镜像归 execution；OMP 队列、原生历史和真实执行仍归官方 OMP。
- `SubmissionRepository` 与输入仓储继续共用 `AppDatabase` 的事务；`dispatching` 恢复由 App 初始化显式调用，`unknown` 不自动重发。
- `RuntimeService`/`SessionHost` 保留同一生命周期状态的协调边界，已有 `RuntimeAdmission`、`SubmissionCoordinator`、`HostConnection`、`PendingInteractions` 和 `ConversationProjection` 不得复制第二份真相。
- 依据 `docs/architecture/modules/execution.md`、`runtime-host.md`、`flows.md` 和 `architecture/modules.json`。
