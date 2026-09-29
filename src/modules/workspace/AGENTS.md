# workspace 模块

- `contracts/public.ts` 是 Thread、目录身份、执行信任和原生绑定的公开合同；`main/public.ts` 提供仓储与项目选择协调。
- 项目选择、真实路径和 Thread 持久化归 workspace；不要在桌面入口或 execution 内复制选择/身份真相。
- 执行授权与 App 文件读取授权保持分离；OMP session 绑定只保存关联事实，不转移 OMP 所有权。
- 依据 `docs/architecture/modules/threads.md`、基础契约和 `architecture/modules.json`。
