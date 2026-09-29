# changes 模块

- Git 读取只读且保留 HEAD/index/worktree 来源、覆盖范围、冲突、无 HEAD、二进制和并发变化信息。
- `contracts/public.ts` 是跨进程合同；`main/public.ts` 是 Git 读取实现入口。不得把工具摘要推断成 Agent 修改，也不得写 Git index。
- Diff 展示消费 files 的明确公开视图；不要在 changes 内复制文件读取或引入回退/恢复副作用。
