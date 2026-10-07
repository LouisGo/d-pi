# 组件看板反馈修正版交接

2026-10-07。分支 `codex/component-dashboard`，本轮续作基点71bb9fb。应用源码固定评审Head `823bbc18a2acb406afd4309d31e8d96003af5b47`；包内源 `e97c5a05e40fc27ef809ee551943b1be5010c068`，之后仅交接/状态文档，应用源码无变化。原main工作区未改动，无远端push/PR/merge。

## 最新候选

- 应用：`/Users/louistation/.codex/worktrees/component-dashboard/d-pi/dist/component-dashboard-feedback/mac-arm64/d-pi.app`
- 版本/构建：0.1.0-workbench.3 / e97c5a05-b19549d5，dirty=false，macOS arm64本地未签名包。
- app.asar SHA-256：`544b507914e1c85a53669545c3b61043cabf59c4eb72de78379b5b2fbd8640e0`。
- [候选身份](evidence/feedback/candidate.json)、[验证](validation.md)、[独立评审](review.md)、[本地PR草稿](pr.md)。[首轮候选及交接](handoff-initial.md)保留，未覆盖其应用包。

## 本轮修正与试用

1. 退出旧d-pi，打开最新候选。正常启动沿用原App数据及OMP配置；单实例保护可能把第二次启动交给旧实例，请核对构建号。
2. 左侧设置上方悬停/点击Tools，选择“组件看板”。`/dev/components`通过注册路由元信息选择独立工具工作区，覆盖Thread列表及内容区，仅共享一级功能栏、native标题栏/history/theme；顶栏显示“组件看板”。
3. 左侧内容独立滚动，右侧按分类竖向列出锚点，常驻可见；分类/组件名称均可跳转。搜索同步过滤内容及目录，清空恢复。窄窗仍保留右侧目录，内容自然换行。
4. 图标仅以20px/currentColor静态展示名字/字形，没有尺寸切换或重置。看板静态glob收录项目公开Icon Layer（排除tests/declarations/private），新增普通图标或公开类别模块不改看板名单。带参数图标由自身提供标准默认形态；WebsiteIcon默认generic。
5. 其他组件仍可体验按钮/提示/角标、页签切换关闭、横纵分割拖拽和键盘、Modal/Esc及HoverMenu，每组可重置。
6. 一级会话图标或后退回原Thread，保留controller、草稿及工作台布局意图/侧栏宽度。未完成附件/引用、待处理失败、IME或保存失败仍拒绝离开原输入视图。

工程与独立复审已完成，新候选已交付待试用，用户认可pending。完整check826项单测通过/2项跳过；26项真实Renderer Electron检查及4项包内原生工作台检查通过。看板完整交互由隔离Renderer覆盖，包内检查只覆盖原生启动/主题/设置；系统IME/VoiceOver及真实provider未覆盖，未把工程结果当作产品认可。
