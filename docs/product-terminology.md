# 产品术语

本页是 d-pi **自有 UI 用词**的单源；领域定义在 [CONTEXT.md](../CONTEXT.md)，使用规则见[国际化架构 §20](architecture/internationalization.md#20-terminology)。协议、用户输入、Agent 与工具输出保持原文，业务含义不在此重复定义。

| 标准概念 | English UI | 简体中文 UI |
| --- | --- | --- |
| App Thread | Thread | 会话 |
| Native Session | Native session | 原生会话 |
| Project | Project | 项目 |
| Working Directory | Working directory | 工作目录 |
| Git worktree | Git worktree | Git worktree |
| Draft | Draft | 草稿 |
| Frozen Submission | Submitted text | 提交原文 |
| Submission Receipt | Submission status | 提交状态 |
| Call ACK | Call acknowledged | 调用已确认 |
| Business Acceptance | Accepted | 已接受 |
| Execution Outcome | Execution result | 执行结果 |
| Runtime | Runtime | 运行状态 |
| SessionHost | SessionHost | 会话宿主 |
| Agent | Agent | Agent |
| Subagent | Subagent | 子 Agent |
| Tool call | Tool call | 工具调用 |
| Interaction | Question | 待回答交互 |
| Approval | Approval | 审批 |
| Git Current Changes | Current Git changes | Git 当前差异 |
| Tool Change Evidence | Tool change evidence | 工具修改证据 |
| Diff | Diff | Diff |
| Side Chat | Side Chat | 旁路问答 |

当前顶栏“新会话”指创建 App Thread；原生历史、记录身份等位置明确使用“原生会话”。项目选择动作与工作目录路径分清；不把分支名作为目录标签。`Workspace` 不作为当前业务实体的 UI 别名，`Run` / `Run Changes` 尚未定义产品语义，不提前补出“已支持”的文案或入口。本表统一名称，不表示所有列出的能力已经实现。
