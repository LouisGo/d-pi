# threads 模块

- 拥有 App Thread、工作目录身份与关联、目录级执行信任和原生会话绑定；项目选择协调与仓储经 `main/public.ts` 提供。
- SQLite `workspace` / `workspace_id` 是既有物理格式，仓储映射为 `workingDirectoryId`，不新增平行业务别名或为改名迁表。
- 每次执行操作仍由实际操作方复核真实目录和授权；Renderer 缓存不能授予权限。
- 不拥有 OMP 执行循环、原生历史、文件内容或 Git 状态；数据库通过 `platform/main/storage/public` 使用。
