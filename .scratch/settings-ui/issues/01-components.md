# 01 共享配置控件与布局
Status: resolved
Blocked by: none

按 [spec](../spec.md) 固定 API 实施 ui 模块与共享样式，迁移 Button 并改接消费者。验证受控值、禁用、label/description关联、跨模块依赖与 token。主 Agent 单写，串行实施。

## 结果

已建立 UI 公开面，迁移 Button 并增加 secondary；控件、表单、配置布局及基础组件看板接入。controls 三项行为测试、严格类型、设计 lint、架构门禁通过。普通 CSS 间距消费 Tailwind 单一 spacing 标尺，几何与主题预览引用同源 token。
