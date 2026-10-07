# Beautiful UI 基础体系独立评审

日期：2026-10-07。固定基点 `7906f2553746801fddc892290b38b4269a69bd6e`，首轮实现 `1573c3154fdd193246d002079f97078cc3b4c48e`，代码修正 `cae44367ef5e4d6d1176314c83e405c722bca576`，设计记录 `1a75147`。

## Spec 轴

独立只读评审确认原生控件语义、公开 API、消费者迁移与规格边界。唯一高价值发现：primary-active 仍从蓝色 emphasis 派生，导致常规中性按钮按下时变蓝（P2）。

修正为 primary 与 primary-foreground 派生；复核 resolved，两主题仍有独立中性 hover/active 反馈。修正复核同时检查 Disclosure wrapper 对应的 runtime-source/composer-help 选择器，确认展开布局与段落间距恢复。未发现本次修正引入的实际新问题；未扩大业务矩阵。

## Standards 轴

独立只读评审发现两项 P2：浅色蓝色强调的白字/链接对比度不足；未选 Checkbox 必要轮廓对比度不足。两者均通过集中 token 修正，保持两主题及原生语义。

固定修正 head 独立复算：浅色强调白字 4.998:1，背景上的链接 4.788:1；Checkbox 边界 light surface/background 为 3.320/3.181:1，dark 为 3.767/4.228:1。两项均 resolved，无遗留项。此为源码与颜色计算复核，不是新 GUI 行为测试。

## 视觉收尾

新上下文评审者阅读实际截图、设计合同及实现，首轮核对字体、表面/材料、形状、交互反馈、两主题/窄窗等维度；确认中性工作底面、文字动作胶囊、小圆角控件、浅深度等方向。给出 fix：浅色强调对比度、中性 primary hover 与旧 DESIGN.md 蓝色主操作记录。

一次修正批次修复颜色/反馈，并更新 DESIGN.md 与 schemaVersion 2 sidecar。原 11 张评审截图均在最终代码内容下重拍；额外两张宽窗表单截图也更新为最终组合布局。

评审者固定复核代码 head 和设计记录提交，独立复算对比度、检查 hover 消费及 CSS 变量绑定，查看同路径重拍截图：三项均 resolved，截图有效，未见本次修复引入的可见回归。最终 disposition: ship，无遗留交付阻碍。此次 verdict 限定上轮三个修复，不扩展为重新完成全界面评审或 provider/打包验证。

## 主 Agent 结论

评审意见已落实；65 项定向测试、相关工程门禁及必要原生观测支持本轮源码 Dev 交付。用户认可仍 pending。证据与复现入口见[交接](handoff.md)。

## 追加 ChoiceGroup 与列表实验撤回

固定范围 `4792632 → cdd7f5d`。用户最新要求决定最终范围：撤回视频参考的列表跟随动效，仅保留图 2 ChoiceGroup。未提交的实验已删除，消费者恢复 base。

- Spec 独立复核 clear：源码差异限于 ChoiceGroup 配方、至少两项 tuple、四项演示及键盘测试；导航/业务列表/UI 导出与 base 一致，无动效组件、消费者或演示残留；真实设置仍二项、保存路径不变，决定取代关系已同步。
- Standards 独立复核无发现：自有 Base UI API、共享 token、两主题/reduced-motion、局部 CSS 范围与内偏移键盘焦点符合合同，全局 pointer-focus 禁止 outline 继续生效；未见列表 API 或生命周期变更。
- 视觉独立收尾 disposition: ship，无 material fixes。三张最终截图有效；连续轨道/内嵌选中面、轻边界、disabled 与完整 Orbit 焦点环符合参考，紧凑字阶/尺寸按项目合同适配，文档与实现一致。结论只覆盖追加 ChoiceGroup。

追加 14 项相关测试通过（包含首轮已测的相关行为和新增四项 Radio 键盘验证），不是另加 14 项独立覆盖；最终代码构建和相关门禁通过。追加截图与原生记录见[交接](handoff.md)。
