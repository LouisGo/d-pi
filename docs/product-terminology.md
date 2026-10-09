# 产品术语

本页是 d-pi **自有 UI 用词**的单源；领域定义在 [GLOSSARY.md](../GLOSSARY.md)，使用规则见[国际化架构 §20](architecture/internationalization.md#20-terminology)。协议、用户输入、Agent 与工具输出保持原文，业务含义不在此重复定义。

| 标准概念 | English UI | 简体中文 UI |
| --- | --- | --- |
| App Thread | Thread | 会话 |
| Native Session | Native session | 原生会话 |
| Project | Project | 项目 |
| Working Directory | Working directory | 工作目录 |
| Git worktree | Git worktree | Git worktree |
| Draft | Draft | 草稿 |
| Provider Settings | Providers | 模型服务 |
| Native Model Roles | Default models | 默认模型 |
| Thinking Effort | Reasoning effort | 思考深度 |
| Steer | Steer task | 调整当前任务 |
| Pending Queue | Queued messages | 待发送 |
| Frozen Submission | Message contents | 发送内容 |
| Submission Receipt | Send status | 发送状态 |
| Call ACK | Send confirmed | 发送已确认 |
| Business Acceptance | Accepted | 已接受 |
| Execution Outcome | Execution result | 执行结果 |
| Runtime | Runtime | 运行状态 |
| SessionHost | SessionHost | 会话宿主 |
| Agent | Agent | Agent |
| Subagent | Subagent | 子 Agent |
| Tool call | Tool call | 工具调用 |
| Interaction | Question | 待答问题 |
| Approval | Approval | 审批 |
| Git Current Changes | Current changes | 当前更改 |
| Tool Change Evidence | Tool change evidence | 工具修改证据 |
| Diff | Diff | Diff |
| Side Chat | Side Chat | 旁路问答 |

当前顶栏“新会话”指创建 App Thread；原生历史、记录身份等位置明确使用“原生会话”。项目选择动作与工作目录路径分清；不把分支名作为目录标签。`Workspace` 不作为当前业务实体的 UI 别名，`Run` / `Run Changes` 尚未定义产品语义，不提前补出“已支持”的文案或入口。本表统一名称，不表示所有列出的能力已经实现。

2026-10-09 用户确认：中文沿用“会话”，英文沿用“Thread”；服务配置入口使用“模型服务 / Providers”。中文与英文按各自语境精简，不逐字对译；优先说明当前状态、操作与必要后果，删除重复说明。思考深度的 `minimal`、`low`、`medium`、`high`、`xhigh`、`max` 两种语言均保留原始值。发送已确认不表示模型接受或任务完成；关闭提示不表示任务停止。开发者组件看板也跟随应用语言，组件技术名称保留。
