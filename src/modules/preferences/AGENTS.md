# preferences 模块

- 拥有 App theme、density、sendKey、locale 和通知偏好，以及 Renderer 的 i18n provider；不拥有 OMP 配置、凭据或模型参数。
- Main 只读写 App SQLite 偏好，Renderer 通过 `contracts/public.ts` 的 `LocaleBridge` 接收解析后的语言快照；通知偏好沿用应用 attention 桥接，`readNotifications` / `saveNotifications` 不覆盖外观或语言字段。
- 文案解析复用 `shared/i18n`；不把 locale 传入 OMP 或 SessionHost 请求。

- 通知偏好 `{ system: false, completion: false }` 默认关闭，属于 App 的 SQLite schema 11；不冒称已获 OS 授权或通知送达。
