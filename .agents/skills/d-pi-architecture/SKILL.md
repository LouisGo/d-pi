# d-pi Architecture

用于领域归属、目录迁移、跨模块依赖和架构门禁相关任务。它补充而不替代 `d-pi-headless-features`、`d-pi-typescript` 与设计系统规则。

## 开始前

1. 读取当前切片 spec/交接、`docs/decisions.md`、`docs/architecture/modules/README.md`，跨模块再读 `flows.md` 和相关模块页。
2. 先判断业务事实的唯一拥有者，再选择 `contracts`、`core`、`main`、`host` 或 `renderer`。只有应用级装配才进入 `src/app`，纯平台能力才进入 `src/platform`；不能因目录看起来整齐而创建空抽象。
3. 检查 `architecture/modules.json` 中的公开面和环境依赖。普通内部文件不登记；公开面、新跨模块依赖或环境变化才更新清单。

## 实施规则

- 模块之间只通过对应环境的 `public.ts`；模块内部使用相对路径，不绕回自己的总入口。
- `contracts`/`core` 不引入 Node、Electron、React、Monaco 或 OMP 运行时；`renderer` 不引入 Node/Electron。测试可以使用测试环境依赖，但生产代码不能导入测试工具或 fixture。
- 临时例外必须精确到来源、目标和规则，写明原因及 `removeBy` 波次；不能用宽泛 `src/**` 豁免，也不能以例外掩盖行为所有权问题。
- 迁移只移动既有实现并保留行为、事务原子性、恢复顺序和 OMP 所有权；不为行数制造 `service`/`utils`/`part` 或第二份状态。
- 新门禁和缺陷修复遵循 TDD：先写能失败的行为/规则测试，再做最小实现；既有正确行为补测不伪造红灯。

## 收尾验证

按影响范围运行：

```text
pnpm check:architecture
pnpm test:architecture
pnpm report:structure
pnpm typecheck
pnpm test
```

受影响的构建、GUI 或原生系统交互另行验证，并在交接中区分自动化证据、Agent 检查和用户试用。目录迁移完成后同步模块地图、模块 `AGENTS.md`、切片 spec/交接；不把 commit 当成 push，也不把工程通过当成用户认可。
