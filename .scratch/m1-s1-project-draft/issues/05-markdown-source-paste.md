# 修复 Markdown 原文粘贴丢失

Status: resolved

Stage: M1 S1

2026-09-27 用户试用反馈：粘贴提供的 Markdown 原文后格式被清空。授权沿用 S1 必要修复，不扩展 OMP 历史或 Markdown 所见即所得。

## 边界与修复

保留 text/plain 中的 Markdown 标记、列表编号、链接原文、缩进及连续空行；CRLF/CR 统一为 LF。S1 不从 HTML 反向生成 Markdown；M2 已确认的富内容转 Markdown 与粘贴为纯文本方向不被本修复取代。

源码证据：ProseMirror 默认优先解析同时存在的 HTML；最小 Document/Paragraph/Text schema 不承载富结构。默认纯文本路径以多个换行作为分隔，会折叠连续空行。修复位于 Renderer 编辑适配层，显式 text/plain 优先，并构造一次选区替换 transaction；无供应商类型进入 IPC 或业务草稿合同。

## 验证

- 提供的475字原文作为固定fixture；原生双MIME剪贴板复现旧行为，标记/编号丢失。
- 修复后原生Cmd+V：输入text/plain与fixture一致，输出475字逐字一致；一次undo为空，redo完整恢复。
- 行为测试覆盖原文与末尾换行、选区中间替换、缩进、代码围栏、连续空行及CRLF；全量13项通过。
- 正式包0.1.0-s1.3原生粘贴后SQLite正文与475字fixture逐字一致，退出重开仍一致；已交付原试用目录复试。原始证据见 `../evidence/markdown-paste.json`。

用户试用状态：反馈已收到并转为修复，不能再写“没有反馈”；修复后的体验尚未获认可。
