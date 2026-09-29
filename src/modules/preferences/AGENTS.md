# preferences 模块

- 拥有 App theme、density、sendKey 和 locale 偏好，以及 Renderer 的 i18n provider；不拥有 OMP 配置、凭据或模型参数。
- Main 只读写 App SQLite 偏好，Renderer 通过 `contracts/public.ts` 的 `LocaleBridge` 接收解析后的快照。
- 文案解析复用 `shared/i18n`；不把 locale 传入 OMP 或 SessionHost 请求。
