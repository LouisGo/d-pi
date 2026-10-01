# 05 窗口内跨 Thread 编辑连续性

Status: open
Blocked by: none

范围/授权见 [spec](../spec.md)；这是已认可的产品改善，不声称既有跨 Thread undo 合同已违规。关联 D-10/D-29/D-33/D-37 和 [M2 04](../../m2-first-release/issues/04-input-attachments.md)。

## 目标与设计

同窗口 A→B→A 恢复 A 的选区和有限撤销，B 独立；保持保存草稿、迟到 IME 绑定、发送消费不复活原文。采用 [design](../design.md)的 Thread 编辑状态缓存，最多 8 个 Thread/估算正文 4 MiB/每 Thread 50 history event 深度初值、LRU，EditorView/DOM 切换释放，业务草稿不随 eviction 删除；正文估算不冒称 undo 内存硬上限。

不把 ProseMirror JSON/undo 写 SQLite，不承诺 reload/重启跨进程恢复撤销，不为每 Thread 保留隐藏 DOM。语言/主题/密度更新不重建 editor，原有正确行为继续。

## 验收

真实 Tiptap/ProseMirror：段中选区、两次修改、切 B 编辑、回 A、undo/redo 后内容与位置正确；迟到 IME 不写 B；发送消费/新的草稿版本使旧 undo 失效；LRU eviction 后正文保留、恢复无旧历史；窗口 reload 只恢复持久草稿。必要 GUI 补焦点/输入法证据，不只比较字符串或 mock editor。

本票无 SDK 前置，可以独立并行交付，不阻塞 01–04；完整切片的 06 集成验收包含本票。

## Comments

2026-10-01：待整体方案审阅时明确纳入或延期，未实施。

2026-10-01（方案认可后）：用户认可完整方案，本票纳入新会话实施范围；尚未领取或实施。
