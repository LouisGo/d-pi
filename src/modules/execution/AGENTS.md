# execution 模块

- 拥有 App 提交收据、准入、控制、待答交互和当前执行镜像；不拥有 OMP 原生队列、历史或执行事实。
- `core` 保持平台无关规则；`main` 监督 Host 和持久收据；`host` 持有单个 Host scope 的原生连接/交互；`renderer` 只维护客户端镜像。
- `unknown` 不自动重发；ACK 与 draft consumption 必须在同一 SQLite 事务中完成。恢复单写证据不足时保持只读。
- Runtime/Host 拆分以状态所有权和生命周期为准，不为目录或行数制造第二套 service、队列或状态。
- ACK、精确 prompt_result、本地响应完成与 session settled 是独立证据；不按 agent_end/idle 猜逐提交结果，迟到 error 不提前释放已接受请求关联。
- schema 6 收据仅存有限结果观察；Main commit 后确认 evidenceId，同活 Host 有界重送事实，不重送 prompt。未确认证据阻止正常 idle 回收，原生闲置不代表证据已持久。已确认身份有界保留且不含正文，重复终态与迟到错误仍核对完整身份。持久失败、缓存满/超时、无关联结果和 Host 再崩溃保留覆盖缺口。
