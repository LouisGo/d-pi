# 06h live 阅读操作与用户接管

Status: claimed
Blocked by: none

所属范围与本轮授权见[spec](../spec.md#2026-10-07-首个长会话阅读闭环本轮授权)。

外层回底、新输出提示、覆盖缺口经Thread tools入口和返回；来源切换不串提示、仅实际输出置位，滚动接管取消旧自动定位，隐藏/dispose释放。写集 reading-anchor.ts/tests、conversation.tsx/tests、thread-workbench.tsx/tests、必要局部新模块/样式。i18n由主Agent单写。

## Comments

2026-10-07：基点6daf80e；沿用D-02/D-17/D-24/D-26/D-32/D-35/D-37/D-38，阅读操作不改变执行，unknown不重发、冷恢复只读。

已领取：对应独立worker，写集及路径见spec。
