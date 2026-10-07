# Thread 工具、TabStrip 与焦点反馈交接

## 结果与试用

沿用隔离分支 codex/thread-layout；固定基点 a0c62e3。源提交 `16568d3faacf0466beed9644e00c3c277b3a3e9d`。07 承接用户本轮三项要求，Thread 工具为 Modal；通用 TabStrip 与内容分离，并在真实组件看板提供切换/悬停关闭/新增示例；搜索自动聚焦修正在共享焦点入口。

在 /Users/louistation/.codex/worktrees/thread-layout/d-pi 运行 `pnpm dev`。Thread tools 打开实际配置/检查/阅读入口弹窗；开发者工具→组件看板→TabStrip 查看通用标签组合。当前 Dev 源码交付，不生成固定安装包。

## 检查记录

- TDD：共享焦点触发器→portal 用例在旧实现真实失败，修正后通过；新组合测试验证独立内容、禁用标签、不可关闭标签、关闭不触发选择、新增回调。
- 33 项受影响回归通过：focus-visibility、controls、tab-strip、component-dashboard、navigation-continuity、geometry、layout model。
- [搜索原生记录](evidence/feedback/search-focus.json)：真实 Electron 共享 Select 的位置/窄窗/搜索/键盘行为；鼠标自动聚焦无 outline，键盘焦点保留。
- [工作台原生记录](evidence/feedback/workbench.json)：22 项检查，light/dark、1440×900/720×540 工具 Modal 边界与焦点、编辑器/阅读/Controller 连续性；通用标签独立组合、轻量选中、图标替换关闭且无跳动、实际关闭命中、新增、Home/End 及窄窗。

`pnpm typecheck:renderer`、`pnpm lint:design`、`pnpm lint:i18n`、`pnpm check:fast`、`pnpm build` 通过；Impeccable detector 未报告问题。构建保留既有大 chunk 提示，未以此声明性能验收。所有原生记录与截图可从源提交恢复。

## 本地双轴复核

主 Agent 在实现后分别完成 Spec 与 Standards 复核；本轮单票串行实施，没有独立 reviewer Agent。固定输入为 a0c62e3 至16568d3 的差异，提交前暂存差异 SHA-256 为 cce25ef0678956ae9c00e74f34c6a8c09887a2587d3c3b3608651935534cdaa5。

- Spec：三项用户要求、工具实际入口与必要运行操作、标签视觉/悬停/独立组合、自动聚焦与键盘区别均覆盖；没有扩大消息/Composer/终端范围，没有未解决的高价值发现。
- Standards：自有 widget/Dialog API、共享 token/全局焦点、portal 与模态焦点返回、Runtime 展示订阅、调用方资源所有权、关闭后的键盘焦点、公开依赖及生成结构核对通过；没有未解决的高价值发现。

已核实主 checkout 仍为56f0b0a且干净。本轮本地分支交付，没有远端 PR/CI 或 main 合并。UI fixture 使用独立数据与模拟 IPC；未请求真实 provider，不代表包内验收、系统 IME/VoiceOver 或用户认可。A3 物理拖窗缺口继续保留。


## 2026-10-07 图标尺寸补充修正

用户截图指出标签左侧图标大小和对齐不一致。根因：TabStrip 仅限制图标槽为1rem，没有限制SVG；File/Close默认16px，Settings/Chat默认20px，SVG溢出槽位并影响网格居中。现在由TabStrip统一槽位、SVG与关闭图标的尺寸，其他场景的Icon Layer默认尺寸不改。

按用户明确要求，只修改源码并commit，未重跑测试、lint、构建或GUI验证；上面的验证记录仍属于16568d3，不外推到这次补充修正。
