# `src/modules` 规则

- 这里按业务拥有者组织生产代码，不按页面、进程或文件数量切分。
- 每个模块只创建实际需要的环境目录；跨模块消费者使用相应环境的 `public.ts`，模块内部不绕回自身公开入口。
- `contracts` 与 `core` 保持平台无关；`main`/`host`/`renderer` 只放该模块的环境实现。应用级组合放在 `src/app`，共享能力必须有明确的跨域事实或平台理由。
- 目录迁移不得复制 OMP 状态、执行队列、持久真相或可写正文；恢复顺序、ACK 事务和失败归属继续由原拥有者保证。
- 新增门禁/结构缺陷按 TDD；结构变化后运行 `pnpm check:architecture`、`pnpm test:architecture` 和受影响行为测试。

模块细则见各模块 `AGENTS.md` 与 `docs/architecture/modules/` 对应页面。
