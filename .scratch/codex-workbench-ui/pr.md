## Summary

[基础布局规格](spec.md)将旧侧栏加顶部工具条改为默认紧凑的工作台外壳：一级导航、上下文侧栏、全余量主会话、按内容开放的右/底宿主，共享44px顶栏、独立滚动与受约束收起恢复。macOS custom header把后退/前进/侧栏置于原生控件右侧；IconButton分离主图标与绝对indicator，修复未读空wrapper造成的偏心，包含数字0与辅助文案。

沿用Thread准入、唯一Tiptap、原草稿/附件/撤销/合成IME/阅读与配置/提醒/诊断。UI仅消费自有API，成熟面板与Base UI能力由自有适配封装；移除密度入口，旧字段兼容。生产无右/底内容时关闭，样本仅隔离验证。

## Evidence

[交接](handoff.md)、[验证](validation.md)、[独立Spec/Standards复核](review.md)。最终候选源91499e7、dirty=false。完整check806行为/35架构/89tooling、56条隔离Electron和18项实际包检查通过，固定SDK18.4.6配localhost supplier。真实失败→修复包含图标偏心、键盘恢复焦点、提醒隐藏已读、分隔条折叠焦点；不把未改正确行为补测伪称红灯。

本地候选已交付，认可pending。A3物理拖窗未确认成功，04继续claimed；原生共享标记遮住交通灯像素，系统IME/VoiceOver/长时流式性能未覆盖。无真实账户/provider或远端CI/发布证据。

## Merge Danger

可逆外壳与控件变更；影响Renderer几何/展示订阅、公开控件和macOS窗口样式，业务协调器/OMP所有权与关闭保存协议不变。新增独立本地布局意图，旧density列不改写；回滚源码不会自动回滚新布局意图，但旧版本不读取该键。业务过程中已保存的草稿/附件/原生session不由git revert删除或重发。需先补A3物理拖窗证据再判断整段工程完成。此为本地PR草稿，不代表ready、merge或用户认可。
