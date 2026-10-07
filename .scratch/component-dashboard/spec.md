# 开发者工具与基础组件看板

日期：2026-10-07。阶段：基建。固定基点：`91104d0d8109c897cdf42c8c10c29b15544018e7`。

## 推进与交接

- 用户已确认：独立组件看板路由，完整收录已开发基础组件，分类总览、形态/状态并排展示、真实交互和重置；原源码归属不搬迁。
- 新授权：一级功能栏设置图标上方加入 tools icon；悬停显示开发者工具菜单，当前为组件看板，后续可增加工具；开发者区域可使用固定中文，保持简单，重点在看板内容。授权实施及标准本地工作流；本轮没有远端 push/PR/merge 授权。
- 已定方向：D-31/D-32 自有图标/组件/token、light/dark、默认紧凑布局，D-38 类型安全路由；保留当前 focus-visible 轮廓与鼠标反馈规则。新增 HoverMenu 薄封装 Base UI，不引入依赖。
- 重要待决：无。工具菜单同时支持点击/键盘打开、Esc关闭、移动到菜单不闪退。
- 工程：两轮已完成；本轮三点修正的完整check、build/package、独立双轴复审及26项Electron通过（续作基点 `71bb9fbf571f2c1508a552d79bac855e6b1e0187`，主 Agent 串行实施03）。主 Agent 在 `codex/component-dashboard` 隔离 worktree 单写集成；01由主 Agent负责，02委派 gallery Agent，在 `/Users/louistation/.codex/worktrees/component-dashboard-gallery/d-pi` / `codex/component-dashboard-gallery` 固定同一基点实现；整段独立Spec/Standards评审。
- 用户试用：首轮布局/维护反馈已落实，新候选已交付见[交接](handoff.md)；认可pending。
- 验收：真实 Router/AppModel 证明工具导航不选择/释放Thread、位置不会被无关模型通知拉回、退出可恢复会话；进入工具路由需完成原编辑冻结/flush，IME、保存失败或附件/引用输入尚未完成及失败待处理时保留原位置；组件行为测试及隔离Electron真实渲染证明菜单悬停/键盘、全量展示、重置、弹层/页签/拖拽、light/dark与窄窗几何。
- 继续边界：不补未实现组件、不接业务命令、不改执行/存储/认证，不公开发布。示例仅用本地演示状态。

## 2026-10-07 用户反馈修正

- 图标仅作轻量预览，从项目公开 Icon Layer 自动收录；新增普通语义图标或公开类别模块不修改看板名单，不枚举供应商全集。去除图标预览的尺寸切换/重置。
- 左侧主内容独立滚动；右侧常驻竖向分类/组件锚点，复用同一目录及搜索结果，接管顶部两排导航。720×540仍保留右侧导航，无遮挡或横向溢出。
- `/dev/components` 使用独立开发者工作区布局，覆盖Thread列和内容区；仅共享一级功能栏、native标题栏/后退前进/主题。Thread列表、标题和辅助宿主不显示；返回保留原Thread资源、草稿和工作台布局意图。
- 与 D-31/D-32/D-38 保持一致；Icon Layer 的普通消费仍用静态具名导入，看板自动收录是开发者预览例外。工程选择不增加依赖或业务状态。

## 范围与组成

- `/dev/components`：分类索引、搜索、组件真实预览，默认全部可见；以当前源码盘点为单源，不按上游组件清单造组件。
- 基础清单：Button（三variant、default/icon尺寸、disabled/pressed交互）、IconButton（tooltip、0/999+/状态角标）、WorkspaceTabs（切换/关闭/键盘/重置）、ResizableSplit（横/纵、拖拽/键盘/重置）、NavigationOverlay、SettingsModal、自有Icon Layer；新增HoverMenu纳入同一看板。
- 展示组件名称、用途、实际variant/size/状态标签。hover/active/focus由真实操作触发，不复制伪装样式。
- 界面沿用主题和token，开发者固定中文无需翻译；采用分类分区与组件预览，避免逐项打开才看到外观。
- 页面局部状态归演示组件，退出释放视图状态；Thread事实/后台资源仍归原拥有者。

```implementation-plan
[{"id":"dashboard","tickets":["01","02"]},{"id":"dashboard-feedback","tickets":["03"]}]
```

```project-status
[{"id":"component-dashboard","title":"开发者工具与基础组件看板","phase":"基建","engineering":"complete","trial":"delivered","acceptance":"pending","build":"e97c5a05-b19549d5","evidence":["handoff.md","validation.md","review.md"],"next":"用户试用修正版图标预览、常驻目录与独立工作区；认可pending","constraints":"仅本地实施与交付；开发者区域固定中文；不改变Thread执行与持久化。"}]
```

## 实施票

- [01 工具入口与路由](issues/01-tools-routing.md)
- [02 分类交互看板](issues/02-component-gallery.md)

- [03 用户反馈修正](issues/03-dashboard-feedback.md)
