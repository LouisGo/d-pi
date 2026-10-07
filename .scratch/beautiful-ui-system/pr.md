# Beautiful UI 基础视觉体系升级与 ChoiceGroup 对齐

## Summary

现有基础组件的表面、形状和反馈缺少一致性。本次统一共享 token、按钮/表单/选择/导航/浮层配方，补齐 Checkbox、TextArea、Slider、Disclosure 和可复用 Tooltip，并接入真实业务入口及组件看板。ChoiceGroup 使用整体胶囊轨道和内嵌选中块；最终差异不包含列表跟随背景实验。

本地来源 `codex/beautiful-ui-system`，目标 `main`；基点 `7906f2553746801fddc892290b38b4269a69bd6e`，交付 head `58f33309bb970191a6674c5320aa74803f9d5132`，最终代码 head `cdd7f5d`。2026-10-07 用户明确授权本地合入 main。所属[规格](spec.md)、[交接](handoff.md)。

## Evidence

65 项基础定向测试及追加 14 项相关测试通过（有重叠），Renderer 类型检查、相关 lint/架构/结构/文档门禁和最终代码构建通过。新增原生控件测试先失败后通过。独立 Spec/Standards 与视觉收尾的发现均修复并复核，追加 ChoiceGroup 无遗留问题，见[评审](review.md)。

隔离 Electron 真实 Renderer 验证 light/dark、窄窗和本轮键盘/浮层行为；[追加观测](evidence/choice-native.json)确认方向键跳过禁用项、焦点环完整。未请求真实 provider、打包或运行远端 CI。用户认可 pending；本地合并不表示远端 PR 或发布。

## Merge Danger

变化影响共享 GUI 控件及其真实消费者，视觉与交互回归是主要风险。未变更数据迁移、权限、OMP 执行/恢复或业务资源所有权；依赖锁定不变。可通过 revert 本次本地合并回退源码，不涉及不可恢复的外部写入。main 与来源分支基点一致且工作区干净，可保留单个本地 merge commit 作为回退边界。
