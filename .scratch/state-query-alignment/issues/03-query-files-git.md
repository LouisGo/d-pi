# 03 文件与 Git 查询迁入 TanStack Query

Status: resolved
Blocked by: 01
阶段: M1 基建（D-37 对齐切片）
受影响决定: D-37、D-20（不改变）、D-24（不改变）

## 交付结果

Renderer 的只读查询由 Query 拥有缓存与失效，替代 [file-workspace.tsx](../../../src/app/renderer/workbench/file-workspace.tsx) 中 4 个结果型 `useState` 与手写序号防串线：

| 查询 | key | 调用 |
| --- | --- | --- |
| 目录列表 | `["files",threadId,"list",path]` | `files.request({kind:"list"})` |
| 文件内容 | `["files",threadId,"read",path]` | `files.request({kind:"read"})` |
| Git 当前变化 | `["git",threadId,"changes"]` | `git.request({kind:"list"})` |
| 单文件 Diff | `["git",threadId,"diff",scope,path]` | `git.request({kind:"diff",...})` |

要求：

- 四个本地查询显式 `networkMode: 'always'`，不被离线判定暂停。
- 幂等只读采样允许默认重试；返回值中的 `unavailable`（缺失/拒绝/非 Git/二进制/超限/变化中）是业务结论，不作为可重试错误、不因重试改变显示。
- 视图提供显式刷新（重新采样并更新对应 key）；不做定时轮询。目录内文件变化事件可触发对应 key 失效，无事件源时保持显式刷新。
- 并发与路径切换由 query key 隔离保证：迟到的旧 key 结果不覆盖当前视图。
- 发送、回答、停止、恢复、保存等副作用不进 Query，未知结果不自动重发（D-24）。
- 视图只读投影并发出意图；文件/Git 的读取授权与来源/版本字段仍由 Main 与对应模块保证。

## 真正依赖

01。若 Git 查询放在 `changes` 模块的 `renderer` 环境，需要新增该环境、更新 `architecture/modules.json` 与模块地图；若保持在应用层组合，需要在票内说明理由。

## 验收证据

- TDD：先写失败测试，覆盖"离线判定下本地查询仍执行""切换路径时旧结果不覆盖""`unavailable` 不触发重试且如实显示""显式刷新后取到新采样"。
- 受影响 GUI：开发态真实打开项目、展开目录、切换文件、查看 Git 当前差异与单文件 Diff；非 Git 项目与缺失路径如实显示。
- `pnpm check`（含类型、Biome、设计 lint、i18n、边界、架构、测试）与 `pnpm build` 通过；不重跑无关性能矩阵。

## Comments

- 防串线从"手写序号 + 结果判等"改为"key 隔离"，这是行为等价替换而不是放宽：迟到的旧 key 结果只进入旧 key 的缓存项。
- 缓存新鲜度只决定何时重新读取，不改变显示内容或失败归属。

## Answer

放置：文件查询在 `src/modules/files/renderer/queries.ts`（公开面 `renderer/public.ts`）；Git 查询新建 `src/modules/changes/renderer/`（`queries.ts` + `public.ts`），`architecture/modules.json` 增加 `renderer` 环境与 `changes.renderer → shared` 依赖，模块地图同步；选择新增环境而不是把 Git 查询塞进应用层，因为 key 与失效策略属于该业务域的读路径。

实现：`fileKeys`/`gitKeys` 以 Thread、path、scope 组成 key；`useDirectoryListing`/`useFileContent`/`useChanges`/`useDiff` 四个 hook 全部显式 `networkMode: 'always'`；`refreshFiles`/`refreshGit` 以 `invalidateQueries` 按 Thread 失效；`QueryClient` 单例与 provider 在 `src/app/renderer/query-client.tsx`，默认 `staleTime: 0`、`retry: 3`、`refetchOnWindowFocus: false`、`refetchOnReconnect: false`。`file-workspace.tsx` 的 4 个结果型 `useState` 与手写 `fileSequence`/`gitSequence` 防串线被移除，改由 key 隔离；查看路径只由 key 派生，`unavailable` 作为数据参与渲染，不进入重试。

测试（先失败后实现）：`src/modules/files/renderer/queries.test.ts` 覆盖并发路径互不覆盖、`unavailable` 计为 success 且只请求一次、失效后重新采样、跨 Thread 不共享缓存。

顺带修掉一个真实缺陷：`files/renderer/public.ts` 原先静态再导出 `MonacoViewer`，任何导入查询 hook 的模块都会被传染加载 Monaco，而 Monaco 在模块顶层访问 `window`，导致无头测试在导入期崩溃。现在公开面只导出 `CodeView` 类型与查询面，编辑器改为 `loadFileEditor()`（`editor-loader.ts`）按需解析，Renderer 入口调用一次并作为组件注入工作台；`pnpm build` 显示 `monaco-viewer-*.js` 已独立分包。

## Comments（行为差异）

- 缓存新鲜度只影响何时重新读取：同一路径重新挂载会重新采样（`staleTime: 0`），切换路径不再显示上一个路径的残留内容（key 变化后无占位数据）。
- 视图在刷新失败时保留上次成功内容并显示传输错误提示；旧实现会先清空内容。保留内容更符合"如实显示来源与失败"的合同，但属可感知差异，需在试用中确认。
- `selected` 选区的清理从"请求发起时"改为"切换路径/线程时"，行为等价（选区仍随切换清空）。

## Comments（2026-09-30 review follow-up）

对 `1e615fb` 的独立评审发现三处范式缺陷，已按 TDD 修复：

1. **`retry: 3` 从未作用于真正的采样失败。** Main 的 `reasonOf` 把未列举的 fs/IO 错误兜底成 `unavailable("failed")` 并作为数据返回，`queryFn` 从不抛错，于是 Query 判定成功：瞬时故障被当终局结论，唯一被重试的反而是传输层拒绝。现在查询层用 `retryableSampling` 把 `unavailable("failed")` 转成错误，其余 reason 继续作为业务结论返回。测试：瞬时失败第二次成功（attempts=2）、耗尽重试后 `isError`（attempts=3）、`denied` 只请求一次且 `isError=false`。
2. **重试窗口内没有任何进行中状态。** v5 在重试期间 `status` 仍是 pending、`isError=false`，界面只用 `isError`，于是 1s+2s+4s 内旧采样与旧 `capturedAt` 被当成本次刷新结果，刷新按钮也还能连点。现在 `readInFlight` 汇总四个查询的进行中状态，显示 `ui.files.refreshing` 并在期间禁用刷新按钮。注意 `enabled: false` 的查询在 v5 里 `isPending` 恒为真，因此该判定同时要求 `isEnabled`，否则状态会常亮（测试覆盖）。
3. **列表查询的 `enabled` 门控失效且语义危险。** `listing` 的 `path ?? ""` 与 `enabled: path !== undefined` 组合让门控恒为真；将来用 `undefined` 表示"未选中目录"的调用者会接到真实根目录条目。现在列表的 `path` 收紧为 `string` 且不设门控（根目录就是空路径），`enabled` 只保留给 `content`/`diff`——`""` 不可能是文件路径。
