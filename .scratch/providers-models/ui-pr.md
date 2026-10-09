# 本地 PR：Provider / Models 界面与 Linux 反馈修复

目标：本地 `main`，范围来自用户 2026-10-09 的界面反馈、“本地 pr 到 main”及“全部一起”授权；包含已有 Linux 修复和本轮 UI 修改，不创建远端 PR、不 push。

2026-10-09 已合入：本地 merge `54b54e9b0d3a27d77cf1fffff992542699dde1c6`，source `e4e11b53f801f53e40a6ff7b7c5e7f67ae5d35c7`（`codex/provider-models-ui`），目标原 main `c14297c382fbf436d201605e0c0c9d04a4e0b637`。merge 双亲与目标/source 一致，合并树和 source 树均为 `d4aea85d7bc24bbccbd711ac17f6ef47794d963b`，无源码差异；已有 Linux `077ce1f`、UI `3fd82b4` 和交付文档 `e4e11b5` 均保留。该核对仅证明本地 Git 合入，不代表工程验证或用户验收；本记录随后以文档提交补入 main。

## Summary

服务商设置原有两级导航过窄、详情拥挤和嵌套滚动；模型弹框重复图标、信息过多，底部也未说明实际认证形式。调整导航宽度、两行信息布局和左右栏滚动，补齐品牌 logo；模型框简化筛选，按原生认证来源展示套餐/API key 等使用形式与可确定的账户摘要。

默认模型按版本新旧排列，已有手动顺序优先，支持拖动模型图标与上下移，设备偏好同步到选择框。跨服务商的原生模型角色单列为可展开区域。Composer 的模型和 provider 文字共用基线。共享 Icon Layer 增加声明式 stroke/solid 字形变体，收藏状态使用实心，开发者看板自动展示支持的变体；同步 D-31 与图标合同。

一并合入 Linux 反馈修复：共享 Portal 层叠、配置读取 Retry、窗口初始化与关闭保护、固定 Linux x64 SDK baseline 分发及资源预算适配。界面范围与反馈见 [spec](spec.md) 和 [界面反馈记录](ui-feedback.md)；Linux 行为及证据见 [原 PR](../linux-e2e-repair/pr.md)。

## Evidence

- 本地 PR 以 `main` 的 `c14297c` 为 base，包含 Linux 修复 `077ce1f`、UI 修改 `3fd82b4` 及本地交付文档提交；Linux 与 UI 的完整提交历史均保留。
- 根据用户截图迭代；源码涉及设置、模型弹框、设备排序、品牌资产、共享图标与开发者预览。静态品牌资源保留来源、固定版本及许可。
- 原生目录没有发布日期，新旧默认顺序基于版本、同族快照日期和原生推荐信息，不能声称严格发布时间排序。
- 用户明确要求快速开发且不验证，未运行测试、类型/lint 检查、构建、浏览器或 Electron 验证，未执行独立 review；仅格式化所编辑源码。历史工程验证不覆盖本轮。
- Linux 修复已有行为、tooling、类型/构建与隔离 Chromium 证据，见其 [验证记录](../linux-e2e-repair/validation.md) 与 [评审](../linux-e2e-repair/review.md)；本次未重跑，不能外推为 UI 修改或整体合并通过。
- 本地提交/合并跳过检查 hook，遵守用户不验证要求；Git 操作结果另外记录，不作为功能或视觉通过证据。

## Merge Danger

Two-way：未改数据库结构、凭据协议或 OMP 所有权，可 revert 本轮本地 merge 恢复代码。影响 Provider 设置、Composer 模型选择、设备排序呈现、主题布局和 Icon Layer；Runtime snapshot 新增可选模型目录字段。Linux 修复还影响共享浮层、Main 关闭协调和 Linux SDK 分发；回滚后需重新准备 SDK/构建，旧分发可能重新超过预算，见原 PR 的风险说明。

用户手动修改的设备收藏/显示/顺序仍按既有偏好路径保存，revert 代码不会撤销用户偏好。未验证界面/类型/构建行为，仍需用户实际页面测试；合并不代表产品验收。
