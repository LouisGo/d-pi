# 新会话开工 prompt

请在 `/Users/louistation/MySpace/Life/d-pi` 开始基础布局 UI 建设，完成一个可继续使用现有业务的 Codex 式桌面工作台外壳。本次授权实施基础布局切片，不要只给计划。

先核实 HEAD、工作区与并发状态，接续已保存的设计文档，并保留任何后续未提交改动。读取 AGENTS.md、项目总看板及以下入口：

- `/Users/louistation/MySpace/Life/d-pi/.scratch/codex-workbench-ui/layout-first.md`：第一轮范围、依赖顺序、工程默认及验收。
- `/Users/louistation/MySpace/Life/d-pi/.scratch/codex-workbench-ui/spec.md`、`/Users/louistation/MySpace/Life/d-pi/.scratch/codex-workbench-ui/layout.md`、`/Users/louistation/MySpace/Life/d-pi/.scratch/codex-workbench-ui/components.md`：布局和组件设计。
- `/Users/louistation/MySpace/Life/d-pi/docs/architecture/design-system.md`、`/Users/louistation/MySpace/Life/d-pi/docs/decisions.md`：最新已确认约束。

严格采用同一套视觉体系：基础、配套和业务组件的圆角、间距、字阶、图标、边界与交互状态按统一角色和 token/variant 定义。light/dark 两套主题必须完成，主操作和辅助文字等颜色角色及其状态同源联动。取消 normal/compact 切换，原 compact 尺寸就是唯一默认紧凑布局；撤下密度选项、命令及样式分支，兼容旧持久字段但不让它决定 UI，不重建用户数据。

应用只使用 d-pi 自有组件公开 API，借用外部 UI 能力至少封装一层。基础组件沿用 Base UI/shadcn 路线；Beautiful UI 和 Tool UI 用于研究写法、组合与选择性源码改造，统一适配 token/Icon Layer，不能直接采用整套运行时或暴露其组件 API。

按 A0 最小共享视觉与自有组件 → A1 几何规则/面板适配 → A2 工作台与存量业务接线 → A3 实际验证推进。实现一级窄导航、可调宽上下文侧栏、主会话、右工作区与底部宿主，以及对齐顶栏、独立滚动、拖拽阈值收起/恢复和窄窗口策略。面板库可以按已有研究核实并锁定必要版本，保留薄适配；不引入自由 docking。宿主没有真实内容时生产保持关闭，用隔离样本验证容器，不展示假终端/浏览器数据。

保留现有 Thread 导航准入、唯一 Tiptap、正文/附件/撤销/IME/阅读状态，以及配置、提醒和诊断入口。不要扩大为 Composer 全面重做、全部辅助业务迁移、完整组件库或 M3，也不改变 OMP、提交/unknown 和恢复合同。

先补本切片规格/任务，新增行为按项目 TDD 实施；完成受影响门禁、构建及实际 Electron 检查，覆盖当前最小窗口、light/dark、默认紧凑布局、三条分隔边与输入连续性。交付可识别的本地提交/试用结果和具体步骤，分别说明生产能力、隔离容器验证和未覆盖项。不自动 push/merge/公开发布或发起真实账户请求。常规工程选择自主完成，进展中简述结果；无需重复确认这些已明确要求。
