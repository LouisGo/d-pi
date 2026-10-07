# 06i 正文最新段与真实 Markdown 完成态

Status: claimed
Blocked by: none

所属范围与本轮授权见[spec](../spec.md#2026-10-07-首个长会话阅读闭环本轮授权)。

手动最新段沿用既有位置账本，追加不自动翻段，外层回底不改变段；真实Streamdown最终语义、Range/DOM/代码滚动检查，失败最小修复。写集reading-body.tsx/segments、markdown.tsx及所属测试。i18n由主Agent单写。

## Comments

2026-10-07：基点6daf80e；沿用D-02/D-17/D-24/D-26/D-32/D-35/D-37/D-38，阅读操作不改变执行，unknown不重发、冷恢复只读。

已领取：对应独立worker，写集及路径见spec。
