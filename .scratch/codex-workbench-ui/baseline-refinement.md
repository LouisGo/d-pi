# a86dc5a基线细化

2026-10-07，基点a86dc5a，分支codex/sandwich-layout。用户已要求回退并重新明确三项视觉目标。

面板实际分隔占位改为0.5px，hover/drag/键盘焦点的主题色填满该区域，左右/上下直接贴合，不使用居中伪元素在4px空隙内画线。原手势命中范围保持；分隔条去掉宽焦点框，其他控件焦点不改。

顶中底仍为4px预算，Thread侧栏背景按实时宽度填满上下间隙，收起时不残留。状态栏独立statusbar-background：light由sidebar与surface混合为更浅底色，dark由surface与少量foreground混合提亮，文本仍沿用muted-foreground；28px与列对齐不变。没有新增Thread圆角或阴影。

DESIGN、D-16、设计合同、布局说明和规格同步。旧截图仍属对应提交，不作为本轮结果。

一次针对性Electron检查通过10项：light/dark下1440×900和720×540的整体布局、28px状态栏、侧栏上下背景、状态栏与侧栏的明度区分及文本对比度；两种主题分别检查左侧、右侧和底部三处分隔条的实际0.5px尺寸、相邻面板贴合及真实拖拽响应。结果见[记录](evidence/baseline-refinement/native.json)，桌面外观见[light](evidence/baseline-refinement/chrome-light-1440.png)、[dark](evidence/baseline-refinement/chrome-dark-1440.png)。Biome、设计lint、文档检查通过；不重跑全量工程/供应商或系统IME/物理拖窗。

开发窗口需按一次⌘R完整刷新，使启动时读取的分隔尺寸由4px更新到0.5px；仅CSS热更新不足以刷新该尺寸缓存。
