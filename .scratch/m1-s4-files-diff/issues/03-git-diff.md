Status: resolved
Blocked by: 01

# Git 当前差异

M1。D-14/D-20。只读区分 HEAD/index、index/工作区、未跟踪；明确双侧、仓库、采样与覆盖。非 Git、无 HEAD、冲突、二进制和变化中状态不能假装空 Diff；不标 Agent 作者。

## Answer

`src/main/project-git.ts` 查询当前项目范围，禁用外部 diff、textconv 与 fsmonitor；显示 HEAD/index/工作区来源及覆盖。测试覆盖混合暂存、未跟踪、非 Git、无 HEAD、重命名、二进制、父仓库子目录、symlink 与状态不变时的并发内容变更。普通文本 Diff 不处理 symlink/子模块；界面明确限制。
