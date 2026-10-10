# `src/platform` 规则

- 这里只放可复用的技术设施：SQLite/诊断、真实路径、OMP 协议与资源；平台适配不拥有产品用例或 OMP 业务事实。
- 公开能力从对应 `public.ts` 暴露；领域模块不直接依赖私有驱动文件。
- OMP 原生执行、队列、历史、配置和凭据仍归官方 OMP；平台层只做协议、资源校验和受限接入。
- 改动需保持资源释放、路径授权、诊断有界和失败不改变业务结果；运行架构门禁、类型检查及受影响回归。
- `node/processes/public.ts` 只提供 macOS 进程身份及受管独立进程组终止；业务登记、准入与故障状态归 execution。清理复核 birth/executable/group，不能仅凭旧 PID 结束未知进程；逃逸进程不在已证终止范围。
- App 当前 schema 16：有限原生结果和 queue_change 收据归 execution，附件 manifest 与内容对象的引用投影归 input；平台只创建表及提供事务，不恢复业务或派发 OMP。AppStorage 先做 submission recovery，再完成至 v16 的迁移/备份及 submission presentation index，最后做 queue change recovery 后发布；before-v6 保留 schema 5、before-v7 保留 schema 6、before-v8 保留 schema 7、before-v9 保留 schema 8、before-v10 保留 schema 9（typed reference JSON 契约的旧版读取保护）。before-v11 保留 schema 10（App 通知偏好两项独立列，默认关闭，不覆盖既有偏好）。内容对象的计数不替代删除前的权威引用核实；SQLite 事务不冒充文件系统事务。不建立原生事件库，失败不删库或降级重写。

- schema 14 的 `submission_presentation` 仅是 execution 拥有的冻结收据查询索引：存稳定身份与 message digest，不存正文或执行结果。before-v14 保留 schema 13；execution 在迁移后补齐旧索引，新收据和索引同事务写入，候选仍核对原文，不推断原生身份或结果。

- schema 15 的 sidebar_preferences 保存 preferences 拥有的版本化导航 JSON 与 revision；before-v15 保留 schema 14。独立于 desktop/model_picker_preferences，不改变执行恢复顺序。备份发布失败保留旧库，记录损坏报错而非重置。

- schema 16 的 thread 管理元数据与操作 journal 归 threads；before-v16 保留 schema 15。仅保存 App 管理事实，不复制 OMP 原生历史；journal 不使 SQLite 与文件操作成为同一事务。
