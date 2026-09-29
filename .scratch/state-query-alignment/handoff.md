# 状态与查询基础库对齐：交接

2026-09-29。切片规格与票见 [spec.md](spec.md)、[issues/](issues/)。受影响决定 [D-37](../../docs/decisions.md)。

## 发生了什么

用户发现重构后 Zustand 与 `@tanstack/react-query` 既不在依赖里也没有实现，只以历史归档存在。核对确认属实：`a56ea59` 删除了早期应用连同依赖与锁文件，`4386b7d` 只恢复了归档，S1–S4 用自写 `state + listeners` 与组件内直接 IPC 交付切片；停掉接入的唯一文字是 09-28 加固轮次追加的"不为名录补齐状态库"，没有走决定变更流程。D-37 取代该规则，确认两库为全局状态与异步状态的基础设施。

## 本次交付的代码

依赖：`zustand@5.0.15`、`@tanstack/react-query@5.104.0`（精确锁定；`@tanstack/query-core` 仍为传递依赖）。

Zustand（vanilla store，`core` 不引入 React）：

- [app/renderer/model.ts](../../src/app/renderer/model.ts)：整体替换语义用 `setState(state, true)`。
- [execution/renderer/runtime-model.ts](../../src/modules/execution/renderer/runtime-model.ts)：新增 `disposed` 守卫与投影订阅。
- [execution/renderer/submission-model.ts](../../src/modules/execution/renderer/submission-model.ts)：部分更新保留浅合并。
- [conversation/core/model.ts](../../src/modules/conversation/core/model.ts)：水位/gap/重同步规则不变。
- 四者都新增 `subscribeTo(selector, listener)`；`DraftController` 与 `I18nProvider` 有意不迁移（不是展示状态，见 spec 的迁移边界表）。

TanStack Query：

- [app/renderer/query-client.tsx](../../src/app/renderer/query-client.tsx)：单例 client 与 provider；默认 `staleTime: 0`、`retry: 3`、关闭窗口聚焦/重连隐式重取；注释记录"不用 mutation"的理由。
- [files/renderer/queries.ts](../../src/modules/files/renderer/queries.ts) 与 [changes/renderer/](../../src/modules/changes/renderer/)：key、请求构造、hooks 与失效函数；全部 `networkMode: 'always'`。
- [workbench/file-workspace.tsx](../../src/app/renderer/workbench/file-workspace.tsx)：4 个结果型 `useState` 与手写序号防串线改为 key 隔离。

顺带修掉的真实缺陷：`files/renderer/public.ts` 原先静态再导出 `MonacoViewer`，任何人导入查询 hook 都会被传染加载 Monaco，而它在模块顶层读 `window`，会让无头测试在导入期崩溃；现在编辑器经 `loadFileEditor()` 按需解析，由 Renderer 入口注入，构建中已独立分包。

## 验证状态

- `pnpm check` 全项通过（含 285 测试 / 1 可选跳过）；`pnpm build` 通过。
- 需要 Node 24.21.0 才能跑通设计 lint；Node 24.17.0 下 oxlint 的 JS 插件 worker 会 SIGTRAP（脚本会明确报工具故障）。
- **真实 GUI 未核对**：本会话环境有 `ELECTRON_RUN_AS_NODE=1`，Electron 被当作纯 Node 运行，`pnpm dev` 启动即失败；干净基线同样失败，故为环境限制。请在终端按 [04 票](issues/04-integration-verification.md) 的步骤试用。

## 未覆盖与风险

- 只有文件与 Git 读路径接入了 Query。历史分页、模型列表、配置摘要等异步查询仍走原有命令；它们属于"按功能接入"的后续范围，规则已写入模块地图与合同。
- Query 缓存不跨窗口恢复，也没有持久化与后台重取；刷新是显式动作。
- 视图刷新失败时保留上次成功内容并显示传输错误（旧实现先清空）。这是可感知差异，试用时请确认。
- 冷恢复只读、停止/继续门槛、未知结果不自动重发等 S3/S4 边界未改变，也不因本次迁移放宽。

## 范式固化（2026-09-30）

用户要求把本轮的 Zustand 与 TanStack Query 结论固化成按需加载的范式，避免每个 AI 各写一套。新增项目 skill [d-pi-state-query](../../.agents/skills/d-pi-state-query/SKILL.md)：按"新建 store / 视图接线与逐行订阅 / 新增只读查询 / 副作用归属 / 评审"五个场景渐进给出写法、反例与检查项，规则单源仍指向[无头功能合同 §4](../../docs/architecture/headless-features.md)。已接入三处发现路径：根的[按任务读取](../../AGENTS.md)表、[文档导航](../../docs/README.md)、[模块地图](../../docs/architecture/modules/README.md)；D-37 登记同步指向该 skill。skill 不复制所有权与验收标准，只写"怎么写代码"。

后续实现与评审要求：新增 store、给视图接线、写查询 hook 或评审这类改动，先加载该 skill 并按场景取用，不再另起一套状态风格；合同与 skill 冲突时以合同为准，并回改 skill。
