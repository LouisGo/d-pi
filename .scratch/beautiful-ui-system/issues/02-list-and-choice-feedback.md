# 02 ChoiceGroup 参考图对齐

Status: resolved
Blocked by: none

2026-10-07 用户追加授权：ChoiceGroup 使用所附图 2 的连续轨道/内嵌选中块；视频中的列表 hover/active 背景自然过渡做成共享组件，可覆盖多种场景。

用户随后澄清 active 应有背景，hover 未改变选择时应返回 active；实际导航中跨分组标题导致频繁往返。最终用户要求无良好优化依据时完整删除视频参考的过渡动画，只保留 ChoiceGroup。主 Agent 判断该场景收益不足，撤回未提交的跟随背景实现、列表组件、消费者接入、演示及实验测试/截图，恢复首轮列表样式，不追加延时或标题例外补丁。

最终交付：ChoiceGroup 整体轨道/内嵌选中块，保留 Radio 语义、允许至少两项，展示图 2 四项与禁用状态；相关类型/行为检查与必要两主题 Electron 观测。原首轮基础体系升级保留。

最终代码 `cdd7f5d`。14 项相关测试、Renderer 类型检查、相关 lint/架构/文档门禁及构建通过；原生证据见[追加观测](../evidence/choice-native.json)，评审见[评审记录](../review.md)。用户认可 pending。
