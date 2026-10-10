# preferences 模块

- 拥有 App theme、density、sendKey、locale 和通知偏好，设备侧栏的置顶/排序/折叠偏好，以及 Renderer 的 i18n provider；不拥有 OMP 配置、凭据或模型参数。
- Main 只读写 App SQLite 偏好，Renderer 通过 `contracts/public.ts` 的 `LocaleBridge` 接收解析后的语言快照；通知偏好沿用应用 attention 桥接，`readNotifications` / `saveNotifications` 不覆盖外观或语言字段。
- 文案解析复用 `shared/i18n`；不把 locale 传入 OMP 或 SessionHost 请求。

- 通知偏好 `{ system: false, completion: false }` 默认关闭，属于 App 的 SQLite schema 11；不冒称已获 OS 授权或通知送达。

- SidebarPreferences 是独立的版本化 App 偏好，schema 15 的 sidebar_preferences 不由普通外观保存覆盖。Main 用当前目录/Thread catalog 检查身份与归属，在一个事务内读取、归并新发现项、应用意图并递增 revision；Renderer 仅保留已确认快照，写入串行，迟到快照不能降级 revision，未知写入只读回核实，不自动重发。部分原生索引不删除已存偏好。
