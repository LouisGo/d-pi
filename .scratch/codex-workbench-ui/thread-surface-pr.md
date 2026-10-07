## Summary

Thread 主区整理为消息滚动区与底部 Composer；有用的模型、子 Agent、运行检查与记录入口收纳到 Modal，停止/待答/队列异常继续可见。搜索框鼠标打开后的自动聚焦继承指针来源，键盘焦点仍显示主题轮廓。

WorkspaceTabs 替换为通用 TabStrip，仅负责标签、选择/关闭/新增与键盘导航，内容及资源由调用方组合。选中使用轻量底色，悬停用关闭按钮替换同位置图标且宽度不变。

## Evidence

最终实现源16568d3；[反馈交接](feedback-handoff.md)记录33项受影响回归、22项隔离Electron工作台检查、搜索原生场景、类型/设计/i18n/快速工程门禁/构建及本地两轴复核。[06交接](thread-surface-handoff.md)保留前一段基础布局证据。GUI使用模拟桥接，不代表真实provider、固定包或用户认可。

## Merge Danger

Two-way：Renderer呈现及验证fixture，无持久化迁移或执行业务变化。影响Thread工具入口、标签交互与焦点来源判定；revert可恢复旧呈现，资源及数据仍归既有拥有者。本地分支交付，尚未合入main；原A3物理拖窗缺口保留。
