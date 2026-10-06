# 06c TDD 记录

固定工作树 `/Users/louistation/.codex/worktrees/m2-long-reading-06c/d-pi`，base 88e40303b1b13707e5717818df19ccf6ce3cd124。每轮先运行目标测试失败，再最小改动运行相同测试通过；随后下一轮，不制造既有正确行为红灯。

1. 巨型 assistant 文本 / 短 Markdown：bounded-reading-renderer 第 1 条失败，Markdown 实际得到 30000 code units；加入 ReadingBody / 字符偏移后同测试通过。
2. 多行正文：reading-segments 第 1 条失败，实际 1001 行 >120；加入行边界后通过。
3. emoji / CRLF：reading-segments 第 2 条失败，首段长度 8192（劈开成对单位），预期8191；补 pair / CRLF 保留后通过。
4. 工具与子 Agent 输出：挂载参数化两条失败，data-reading-text 未出现；两路径接入 ReadingBody 后通过，完整复制与截断提示同时通过。
5. Host / Thread 身份：挂载回归失败，新 Host 后页码1应为0；行 key 含 Thread / generation / id 后通过，同 Host 重连仍保持页1。
6. 原生历史分段 / 复制 / 覆盖：真实 Query 接入回归失败，data-reading-text 为空；历史接入并补行头复制后通过。
7. 历史来源隔离：预热现有 Query cache（避免无数据卸载掩盖）后更换 page.source 失败，页码1应为0；记录 key 增加真实来源后通过。
8. 缩短后再增长：先第4段，缩短到2段，再增长失败，页码恢复3应保持1；即时夹紧本地 choice 后通过，并覆盖变短消息后再长重置首段。
9. 可访问滚动区：挂载回归失败，tabIndex -1应为0；补 tabIndex/aria-label/aria-controls 后通过。
10. 已封闭段DOM/选择/scroll、末段增长及不自动翻页是加入上述实现后的补充行为验证，直接通过，不伪造红灯。MutationObserver 对当前pre无childList/characterData修改；同一 text node 和选择范围、scrollTop 保留。

纯分段5次测量（Node24.21.0、本机、无GUI）：8Mi code units 中文长单行 26.69/22.12/18.13/17.96/18.17ms；6Mi code units 多行26/18.97/19.72/18.7/19.87ms。此为偏移计算成本，不代表整体Renderer/GUI性能验收。
