# 07 Thread 工具弹窗、通用标签条与自动聚焦修正

Status: resolved
Type: task
Blocked by: none

## 授权与范围

2026-10-07 用户明确要求：有用的 Thread 工具改为弹窗；修复搜索框自动聚焦的异常 outline；参照两张标签条截图改善 WorkspaceTabs，并使标签 widget 与内容容器可组合使用。

固定基点 a0c62e3；沿用 codex/thread-layout 和隔离工作树 /Users/louistation/.codex/worktrees/thread-layout/d-pi。主 Agent 串行实现，不改消息/Composer 能力，不增加终端、文件或执行业务。

## 实现与验收

- Thread 工具保留真实模型、子 Agent、运行检查、文件/提交/历史入口，改为自有 Modal。Esc/关闭返回打开入口；背景编辑器、阅读面板与 ThreadController 保持。健康检查进入弹窗，停止/待答/队列异常仍在主区处理。
- 共享焦点来源判断保留鼠标触发器进入 portal 的自动聚焦来源。键盘导航清除指针标记，独立辅助技术焦点继续遵从浏览器 focus-visible；不永久取消输入框键盘轮廓。
- WorkspaceTabs 改为 TabStrip / TabItem。只接受标签描述、选择/关闭/新增回调与可选 panelId，不渲染或拥有内容。资源面板由宿主组合；支持禁用、不可关闭、方向键/Home/End/Delete、关闭后焦点回落。选中轻量底色，悬停用 X 替换同位置图标，标签宽度不变。
- 回归测试与实际 Electron 检查覆盖独立组合、鼠标自动聚焦/键盘轮廓、light/dark、1440×900/720×540、弹窗边界/焦点返回/资源连续性、标签切换/悬停/关闭/新增/键盘导航。

## 证据

共享焦点回归先在旧实现失败：触发器→portal 搜索框后 pointerFocus 为 undefined；修正后通过。原组件目录搜索测试随名称和描述更新，保持真实目的搜索。

[交接](../feedback-handoff.md)维护最终源提交、检查结果和限制。GUI 使用隔离模拟桥接，工程验证不提升用户认可或既有 A3 物理拖窗缺口。

## 工程结果

源提交 16568d3faacf0466beed9644e00c3c277b3a3e9d；33 项回归、22 项隔离工作台 Electron 检查及搜索控件原生场景通过。类型、设计/i18n、check:fast、构建与本地 Spec/Standards 两轴复核通过。没有未解决的本票高价值发现；详细证据、试用和限制见交接。
