# 03 品牌图标和 Panel 基础

Status: resolved
Blocked by: none

范围和授权见[spec](../spec.md)。从固定 T3 本地源码提取实际 provider/model 品牌 SVG，记录许可与来源，经共享 UI Icon Layer 窄 API 封装；未知品牌降级，真实厂商身份优先。补齐可复用 Popover/Search panel 基础，Base UI 管 Esc、外部关闭、焦点、位置翻转，样式继承现有 token，不带业务 store/IPC。最低层行为测试验证语义与键盘。

组合完成：原生能力/偏好/组件已接入集成树；验证记录在本切片 evidence 和后续交接。工程解决不等于用户认可。
