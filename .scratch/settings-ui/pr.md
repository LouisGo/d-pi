## Summary

原设置将偏好、认证、提醒与诊断堆在同一内容区，控件和说明缺少层级。现在分为五页，采用分组边框、行分隔、说明与右侧操作，支持直接主题选择、light/dark和窄窗布局。

先固定 [名称、职责、类型/API](spec.md)，再建立 `ui/renderer/public.ts`：迁移原 Button，提供 Select、Switch、TextInput、FormField、ChoiceGroup、SettingsPage、SettingsGroup、SettingRow。组件看板同步接入；认证、Query 和持久化仍由原业务拥有。范围见 [01](issues/01-components.md)、[02](issues/02-settings.md)。

## Evidence

base `5c25d3c`，生产实现 `d02201c`，验证工具与画面 `b0a7ab6`。显式主题 light→system 的新测试在旧循环逻辑下实际失败，修复后通过；既有行为补测没有伪造红灯。完整 `pnpm check` exit 0，836项通过/2项条件跳过；`pnpm build` exit 0。

8项隔离 Electron 场景、6张 light/dark/窄窗画面通过。初版过渡中截图已替换；[原始结果](evidence/native.json)、[验证记录](validation.md)、[独立 Spec/Standards 评审](review.md)。两个 reviewer 无实质发现，并复核补充证据。mock bridges 不代表真实 OAuth、凭据保存或 OS 通知成功；未进行打包及用户体验验收。

## Merge Danger

Two-way door：无数据库/schema迁移、权限调整或新执行路径；可 revert 源码提交。Button 公开面迁移影响原消费者，已同步导入和设计 lint 映射，完整检查覆盖。偏好仍是原结构，revert 不撤销用户自行保存的主题、语言或提醒选择，也不撤销其主动完成的原生认证。

Dev 使用按 checkout 区分的 App 数据，OMP 配置仍按现有规则共享。切页和关闭 Modal 保留认证 hook，active 只控制只读摘要 Query。工程完成与本地草稿不代表 merge、真实供应商验收或用户认可；[试用步骤](handoff.md)。
