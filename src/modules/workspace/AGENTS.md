# workspace 模块

- 拥有 Thread、Workspace、目录身份、执行信任和 Native session binding 的 App 记录；`main/public.ts` 提供仓储与项目选择组合入口。
- 每次执行操作仍由调用方复核真实目录和授权；Renderer 缓存不能授予权限。
- 不拥有 OMP 执行循环、原生历史、文件内容或 Git 状态；数据库通过 `platform/main/storage/public` 使用。
