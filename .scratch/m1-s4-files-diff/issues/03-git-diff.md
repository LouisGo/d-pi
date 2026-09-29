Status: resolved
Blocked by: 01

# Git 当前差异

M1。D-14/D-20。只读区分 HEAD/index、index/工作区、未跟踪；明确双侧、仓库、采样与覆盖。非 Git、无 HEAD、冲突、二进制和变化中状态不能假装空 Diff；不标 Agent 作者。

## Answer

`src/main/project-git.ts` 查询当前项目范围，禁用外部 diff、textconv 与 fsmonitor；显示 HEAD/index/工作区来源及覆盖。测试覆盖混合暂存、未跟踪、非 Git、无 HEAD、重命名、二进制、父仓库子目录、symlink 与状态不变时的并发内容变更。普通文本 Diff 不处理 symlink/子模块；界面明确限制。

2026-09-29 夯实：补未跟踪单文件 Diff（左 absent/右 worktree）、暂存删除与工作区删除两侧、冲突判 `unmerged`、超限未跟踪判 `too-large` 单测；实现不变。

2026-09-29 S5 准入加固：只读查询中和全部生效 filter 驱动（clean/smudge 直通 `cat`、process 置空），采样前后复核驱动集合，变化即判 `changed`；blob 改走 `cat-file -p`，不跑 smudge/textconv。比较为去外部程序后的当前采样，不等同于完整 Git 规范化语义；回归测试断言标记 filter 不执行且列表仍报 modified。
