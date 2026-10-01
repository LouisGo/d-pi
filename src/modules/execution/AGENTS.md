# execution 模块

- 拥有 App 提交收据、准入、控制、待答交互和当前执行镜像；不拥有 OMP 原生队列、历史或执行事实。
- `core` 保持平台无关规则；`main` 监督 Host 和持久收据；`host` 持有单个 Host scope 的原生连接/交互；`renderer` 只维护客户端镜像。
- `unknown` 不自动重发；ACK 与 draft consumption 必须在同一 SQLite 事务中完成。恢复单写证据不足时保持只读。
- Runtime/Host 拆分以状态所有权和生命周期为准，不为目录或行数制造第二套 service、队列或状态。
- ACK、精确 prompt_result、本地响应完成与 session settled 是独立证据；不按 agent_end/idle 猜逐提交结果，迟到 error 不提前释放已接受请求关联。
- schema 6 收据仅存有限结果观察；Main commit 后确认 evidenceId，同活 Host 有界重送事实，不重送 prompt。未确认证据阻止正常 idle 回收，原生闲置不代表证据已持久。已确认身份有界保留且不含正文，重复终态与迟到错误仍核对完整身份。持久失败、缓存满/超时、无关联结果和 Host 再崩溃保留覆盖缺口。

## 内部落点

- `core/runtime/` 维护执行准入，`core/submission/` 维护提交准入、协调与原生命令策略。
- `main/runtime/` 监督运行，`main/transport/` 管 Host 连接，`main/submission/` 持久收据。
- `host/native/` 管原生进程和启动，`host/interactions/` 管待答交互；`session-host.ts` 保留共同关联与恢复状态的 owner。
- D-39：Effect v4 仅用于 `host/` 和 `main/transport/` 的连接生命周期；当前 NativeSession 已接入。Scope/Fiber 等供应商类型留在内部，对外普通 Promise/DTO；超时/中断不是执行取消或失败证据，禁止自动重发写请求。不使用 unstable 或 `@effect/*` 扩展包。
- 在上述范围新增并发等待、超时、取消、后台任务或资源释放时，默认用 Effect，任务绑定实际拥有者的 Scope，统一收尾；不要再拼一套 timer、清理栈或任务管理器。参考 [NativeSession](host/native/native-session.ts)，API 以安装的 v4 源码为准。
- 简单单次异步调用可沿用 Promise；维护旧代码时，只迁移本次范围内有实际收益的生命周期，不顺带全层改写，也不为使用 Effect 增加无用包装。
- `renderer/runtime/` 与 `renderer/submission/` 分别维护客户端投影，不因目录分开改变提交与执行的合同。

公开面保持各环境 `public.ts`，内部相对导入；测试与所属实现就近。AppStorage 与 RuntimeService 的跨域组合验证放 `tests/integration/`。
