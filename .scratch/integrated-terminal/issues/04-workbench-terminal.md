# 04 正式工作台终端

Status: open
Blocked by: 03
阶段：M3。受影响决定：D-13/D-31/D-32/D-37/D-38/D-40。

授权与T-P1见[spec](../spec.md#产品待决)。按[契约 §7](../../../docs/architecture/terminal.md#7-显示输入与工作台接入)用xterm.js适配正式底部面板，复用设计token、自有Icon Layer/ResizableSplit与焦点/导航。React只订阅轻量状态，不拥有PTY或每块正文。

## 行为与验收

显式新建/选择终端，Command+`、中文IME、Ctrl+C、选区复制/粘贴、bracketed paste及多行风险提示；隐藏/导航/卸载只detach，窗口重开同shell恢复屏幕。显示真实初始目录与状态，退出/unknown/cleanup-pending有正确文案，不给虚假ready。

resize按内容盒有变化才发，隐藏0尺寸不fit，主题变更只更新option不重建shell/xterm；选择/滚动保持，snapshot替换的选择失效明确。OSC52、标题/链接输出不授予App权限，headless/browser查询不重复应答。

自动化证明事件/订阅/卸载边界，真实macOS核对系统IME候选/组合态、键盘焦点、拖动resize、light/dark与紧凑布局；未测可访问性保持缺口。先前已实现的OMP收据/阅读/导航回归按受影响面运行。内部可操作路径不能绕过已受影响的退出、清理和有界输出门槛当可用交付。
