# Beautiful UI 基础视觉体系升级

日期：2026-10-07。基点：7906f2553746801fddc892290b38b4269a69bd6e。

## 推进与交接

用户已确认跟随 Beautiful UI，授权完成基础组件视觉/布局/交互升级、补齐实际缺少的控件及必要实机测试。采用项目级 impeccable 的 Operate 指导；视觉方向已由用户固定，不再进行方案竞赛。工作分支 codex/beautiful-ui-system，隔离 worktree。主 Agent 串行实现，收尾独立评审。

D-31/D-32 延续 Base UI、自有公开 API、Hugeicons、light/dark 和唯一紧凑布局。2026-10-07 新确认：Beautiful UI 为直接视觉与动效对照，常规主操作改用中性深浅对比，蓝色保留给强调动作，取代此前默认蓝色按钮配方。共享 token 为唯一权威源，文档只引用来源。

范围：表面/边界/阴影/文字/尺寸/圆角/动效；Button、输入/表单、选择、导航/浮层及配置组合；新增并接入真实使用的 Checkbox、TextArea、Slider、Disclosure。补全看板，已有业务入口消费公开组件。保留提交/unknown/恢复、权限、编辑器和持久化合同。不引入整套 Beautiful UI、演示计时器或新业务状态。无重要产品待决。

验收：控件组合协调、light/dark 和窄窗可用、hover/active/selected/disabled/invalid 与 focus-visible 区分；鼠标无 outline，键盘可见；Select 搜索不改值、Esc 返回焦点；Checkbox/Slider/Disclosure 保留原生键盘及表单语义。实机验证仅覆盖本轮变化；不请求真实 provider、不打包、不远端发布。

工程：完成。试用：源码 Dev 已交付，见[交接](handoff.md)。用户认可：pending。65 项定向测试、Renderer 类型检查、构建与相关门禁通过；隔离 Electron 完成本轮必要的视觉和键盘交互观测。评审与证据边界见[评审记录](review.md)。

```project-status
[{"id":"beautiful-ui-system","title":"Beautiful UI 基础视觉体系升级","phase":"基建","engineering":"complete","trial":"delivered","acceptance":"pending","evidence":["handoff.md","review.md","evidence/native-observations.json"],"next":"用户在Dev组件看板及真实入口试用统一视觉体系；认可pending","constraints":"本地源码交付；GUI证据为隔离Electron真实Renderer，不是provider或固定包验收。"}]
```

任务：[01](issues/01-foundation-upgrade.md)。
