# 开发者工具与基础组件看板

日期：2026-10-07。阶段：基建。固定基点：`91104d0d8109c897cdf42c8c10c29b15544018e7`。

## 推进与交接

- 用户已确认：独立组件看板路由，完整收录已开发基础组件，分类总览、形态/状态并排展示、真实交互和重置；原源码归属不搬迁。
- 新授权：一级功能栏设置图标上方加入 tools icon；悬停显示开发者工具菜单，当前为组件看板，后续可增加工具；开发者区域可使用固定中文，保持简单，重点在看板内容。授权实施及标准本地工作流；本轮没有远端 push/PR/merge 授权。
- 已定方向：D-31/D-32 自有图标/组件/token、light/dark、默认紧凑布局，D-38 类型安全路由；保留当前 focus-visible 轮廓与鼠标反馈规则。新增 HoverMenu 薄封装 Base UI，不引入依赖。
- 重要待决：无。工具菜单同时支持点击/键盘打开、Esc关闭、移动到菜单不闪退。
- 工程：实施中。主 Agent 在 `codex/component-dashboard` 隔离 worktree 单写集成；01由主 Agent负责，02委派 gallery Agent，在 `/Users/louistation/.codex/worktrees/component-dashboard-gallery/d-pi` / `codex/component-dashboard-gallery` 固定同一基点实现；整段独立Spec/Standards评审。
- 用户试用：尚未交付，认可pending。
- 验收：真实 Router/AppModel 证明工具导航不选择/释放Thread、位置不会被无关模型通知拉回、退出可恢复会话；进入工具路由需完成原编辑冻结/flush，IME、保存失败或附件/引用输入尚未完成及失败待处理时保留原位置；组件行为测试及隔离Electron真实渲染证明菜单悬停/键盘、全量展示、重置、弹层/页签/拖拽、light/dark与窄窗几何。
- 继续边界：不补未实现组件、不接业务命令、不改执行/存储/认证，不公开发布。示例仅用本地演示状态。

## 范围与组成

- `/dev/components`：分类索引、搜索、组件真实预览，默认全部可见；以当前源码盘点为单源，不按上游组件清单造组件。
- 基础清单：Button（三variant、default/icon尺寸、disabled/pressed交互）、IconButton（tooltip、0/999+/状态角标）、WorkspaceTabs（切换/关闭/键盘/重置）、ResizableSplit（横/纵、拖拽/键盘/重置）、NavigationOverlay、SettingsModal、自有Icon Layer；新增HoverMenu纳入同一看板。
- 展示组件名称、用途、实际variant/size/状态标签。hover/active/focus由真实操作触发，不复制伪装样式。
- 界面沿用主题和token，开发者固定中文无需翻译；采用分类分区与组件预览，避免逐项打开才看到外观。
- 页面局部状态归演示组件，退出释放视图状态；Thread事实/后台资源仍归原拥有者。

```implementation-plan
[{"id":"dashboard","tickets":["01","02"]}]
```

```project-status
[{"id":"component-dashboard","title":"开发者工具与基础组件看板","phase":"基建","engineering":"in-progress","trial":"not-delivered","acceptance":"pending","evidence":["spec.md"],"next":"完成工具入口、分类交互看板及独立评审验证","constraints":"仅本地实施与交付；开发者区域固定中文；不改变Thread执行与持久化。"}]
```

## 实施票

- [01 工具入口与路由](issues/01-tools-routing.md)
- [02 分类交互看板](issues/02-component-gallery.md)
