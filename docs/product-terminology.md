# 产品术语

本表是 d-pi 自有界面文案与核心产品概念的**单源**：使用边界见[国际化架构 §20](architecture/internationalization.md#20-terminology)，领域定义见 [CONTEXT.md](../CONTEXT.md)。协议字段、用户输入、Agent 与工具输出保持原文；术语随产品演进更新。

| 内部概念 | English UI | 简体中文 UI |
| --- | --- | --- |
| Agent | Agent | Agent |
| Subagent | Subagent | 子 Agent |
| Thread | Thread | 会话 |
| Run | Run | 运行 |
| Tool call | Tool call | 工具调用 |
| Approval | Approval | 审批 |
| Workspace | Workspace | 工作区 |
| Diff | Diff | Diff |

## 使用注意

- `Thread` 的中文 UI 是“会话”，指用户在应用里持续推进的工作单元；它与 OMP 管理的**原生会话**不是同一对象。当前单会话设计下两者一一对应，界面靠位置与动作区分（顶栏“新会话”＝新建 Thread；阅读区的“会话”＝当前 Thread 的原生记录投影）。多 Thread 落地时须重新校对中文用词，见[国际化架构 §20](architecture/internationalization.md#20-terminology)。
- 本表只统一术语，不替代领域合同或行为规格；具体操作名称按实际功能校对。
