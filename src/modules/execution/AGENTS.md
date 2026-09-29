# execution 模块

- 拥有 App 提交收据、准入、控制、待答交互和当前执行镜像；不拥有 OMP 原生队列、历史或执行事实。
- `core` 保持平台无关规则；`main` 监督 Host 和持久收据；`host` 持有单个 Host scope 的原生连接/交互；`renderer` 只维护客户端镜像。
- `unknown` 不自动重发；ACK 与 draft consumption 必须在同一 SQLite 事务中完成。恢复单写证据不足时保持只读。
- Runtime/Host 拆分以状态所有权和生命周期为准，不为目录或行数制造第二套 service、队列或状态。
