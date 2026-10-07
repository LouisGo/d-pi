# 组件看板本地试用交接

2026-10-07。分支 `codex/component-dashboard`，固定基点 `91104d0d8109c897cdf42c8c10c29b15544018e7`。应用源码评审 Head `655e955936965a206f40d1ced9a96117266a66f6`；包内源 `232f76bcce22e37e6cf765298d9d6f15af8817ec`，其后仅交付文档。原 main 工作区未改动，无远端push/PR/merge。

## 候选

- 应用：`/Users/louistation/.codex/worktrees/component-dashboard/d-pi/dist/mac-arm64/d-pi.app`
- 版本/构建：0.1.0-workbench.3 / 232f76bc-5dedc932，dirty=false，macOS arm64本地未签名包。
- app.asar SHA-256：`f6d214d0890c9edee2f54725c2caa6c2df8504e6c42270af0cfcb45c8e2cc1a0`。
- [验证](validation.md)、[独立评审](review.md)、[本地PR草稿](pr.md)。

## 试用

1. 退出旧d-pi，再打开上述候选；单实例保护可能把第二次启动交给旧实例。此候选正常启动沿用原App数据与OMP配置。
2. 左侧设置上方是Tools图标，悬停移入菜单或点击/键盘打开，选择固定中文“组件看板”，进入 `/dev/components`。
3. 顶部有4类与8个组件索引；所有示例默认直接展示，滚动查看形态/状态，或搜索名称、用途、形态。逐项体验按钮、提示与角标、页签切换/关闭、横纵分割拖拽/键盘、弹层、图标及菜单；每组可独立重置。
4. 顶部主题开关查看明暗表现；窄窗保持纵向滚动。弹层可Esc关闭；工具菜单可Esc关闭。
5. 点击一级会话图标或后退回原Thread。进入看板前flush草稿；IME、保存失败、附件/引用未完成或失败待处理时保留原视图，完成/处理后可再次进入。

工程已完成，候选已交付待试用，用户认可pending。后续工具增加菜单项及相应注册路由即可，无需改变共享菜单契约。集成worktree保留，便于试用和后续本地PR。
