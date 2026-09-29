# preferences 模块

- App 的主题、密度、发送方式和 locale 偏好归 preferences；OMP 配置、模型和凭据不归这里。
- `contracts/public.ts` 提供偏好与 LocaleBridge 合同，`renderer/public.ts` 提供 provider；formatter/catalog 继续由 `src/shared/i18n` 唯一维护。
- 偏好保存失败必须保留当前 UI 状态并如实回传；不要把 React provider 变成后台生命周期拥有者。
- 依据 `docs/architecture/internationalization.md`、`docs/architecture/design-system.md` 和 `architecture/modules.json`。
