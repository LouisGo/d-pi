# 设置页验证记录

2026-10-07，macOS；base `5c25d3c3e31a3f046989031847cc66fe51c83bf5`，生产实现 `d02201c3bb29d9e7e083ae82f8a41cbe137906cd`，最终验证工具与画面 `b0a7ab66a6081669cbde7d6cb27d0270aaa47b67`。

| 检查 | 实际结果与覆盖 |
| --- | --- |
| `pnpm check:environment` | 通过；Node 24.21.0、pnpm 12.8.1、SDK 18.4.6 / Bun 1.3.14 可用 |
| `pnpm check` | exit 0；类型、lint、设计/i18n/交互/文档/架构/结构/看板门禁、tooling 通过；35项架构测试通过；Vitest 142文件/836项通过，1文件/2项跳过 |
| `pnpm build` | exit 0，生产编译通过；未运行打包产物 |
| 受影响行为 | controls 3、configuration settings 4、attention 12、appearance/subscription 23，共42项；组件看板另9项，均通过，并被完整检查覆盖 |
| `node validation/m2/settings.mjs` | 8项隔离 Electron 场景通过，生成6张画面；[native.json](evidence/native.json) |
| `pnpm exec biome check validation/m2/settings.mjs validation/m2/rendering.tsx` | 补充验证工具变更通过 |

两项跳过分别需要 `D_PI_NATIVE_SMOKE=1` 和 `D_PI_REFERENCE_BENCH=1`，本次没有将默认跳过项记作通过。

显式主题目标按 TDD 实施：新增 light→system 单次写入测试在旧循环实现下得到 dark 而失败，增加目标 API 后通过。原来正确的资源保持、串行保存与认证行为补测不伪造失败。控件覆盖受控选择、disabled、FormField 标签及说明关联。

Electron 使用实际 App 组合与 Base UI 控件、隔离 HOME/App 数据、mock bridges。验证单页显示、Select body portal 不裁剪、ArrowDown/Escape/焦点归还、直接主题保存、提醒保存、640×720 窄窗边界、Thread 身份保持、Modal 关闭焦点归还。截图等待 CSS transition 完成和双 RAF；分类核对唯一 `aria-current` 与标题，通知等待保存解除 disabled。模拟通知开启后返回 `unavailable`，不模拟真实 OS 成功。

画面：[浅色外观](evidence/appearance-light.png)、[通用选择器](evidence/general-select.png)、[浅色配置](evidence/configuration-light.png)、[深色外观](evidence/appearance-dark.png)、[深色提醒](evidence/notifications-dark.png)、[窄窗配置](evidence/configuration-narrow-dark.png)。Agent 实际查看 light/dark、提醒保存态与窄窗布局；原先过渡中的截图已替换。

未覆盖真实 OpenAI OAuth、DeepSeek 原生凭据保存、macOS 通知授权/投递、打包差异与用户认可。SDK 和集成测试通过不能替代真实账户认证；GUI fixture 也不能证明供应商成功。
