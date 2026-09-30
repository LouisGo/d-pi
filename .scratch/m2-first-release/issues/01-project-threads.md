# 01 项目与 Thread

Status: resolved
Blocked by: none

所属范围与授权见 [spec](../spec.md)。

新增项目/会话入口、列表及切换，保存失败保留当前视图，后台资源跨切换保留；只读冷恢复有自然新建出口。测试真实 SQLite、Renderer 迟到/保存/身份边界与实际 SDK 并行。

## Comments

2026-09-30：M2 明确授权接续 S5；这是工程票，用户认可在 spec 单独维护。

2026-10-01：入口工程完成，真实 SQLite/切换保存与独立后台 scope 测试、clean 包内两个真实 OMP 并行与冷只读/新 Thread 出口均通过；已交付首批候选，证据见 [交接](../handoff-entry.md)。该票 resolved 不代表 M2 完成或用户认可。
