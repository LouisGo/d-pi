# 01 锁定并验证状态与查询依赖

Status: resolved
阶段: M1 基建（D-37 对齐切片）
受影响决定: D-37（新增）、B-01（范围修正）、D-28/D-29（不改变）

## 交付结果

在 Electron 44 / React 19.3 / TypeScript 7 的当前工程中锁定并验证两个基础依赖，并建立 Renderer 的查询客户端接入点：

- `zustand` 与 `@tanstack/react-query` 以精确版本进入 `package.json` 与锁文件（`.npmrc` 已有 `save-exact=true`，不手写范围版本）。
- 依官方文档核实本切片用到的 API 在现代版本下的准确形态（vanilla store 的创建与 `getState/setState/subscribe`、`subscribeWithSelector`、`useStore` 选择器订阅；Query v5 的 `useQuery` 对象签名、`QueryClient`/`QueryClientProvider`、`networkMode`、`retry` 与失效 API），并在票内记录来源与版本，不用推测当作事实。
- Renderer 入口提供唯一 `QueryClientProvider`（[main.tsx](../../../src/app/renderer/main.tsx)），默认值按"本地 IPC 为主"设置：不因窗口聚焦或重连做隐式全量重取，副作用不进重试。

## 真正依赖

无前置任务。需要网络获取依赖；官方版本与 peer 兼容性以 registry 与官方文档为准。

## 验收证据

- 锁定后的 `package.json` 与锁文件片段；`pnpm install` 成功记录。
- API 核实结论与官方 URL（含版本），逐条对应本切片实际用到的调用。
- 类型检查与构建能解析新依赖（`pnpm typecheck`、`pnpm build`）；`pnpm check:architecture`、`pnpm test:architecture` 通过（结构未变时也应保持）。
- 不新增用户可见行为；此票不改 store 实现与查询调用点。

## Comments

- 版本候选在 2026-09-29 查得 `zustand@5.0.15`、`@tanstack/react-query@5.104.0`（peer `react: ^18 || ^19`，依赖 `@tanstack/query-core@5.104.0`）；归档旧原型用的是 `zustand ^5.0.15`、`@tanstack/react-query ^5.103.2` 的范围写法。实施按当前最新且精确锁定，并在票内记录实际版本。

## Answer

实际锁定：`zustand 5.0.15`、`@tanstack/react-query 5.104.0`（传递依赖 `@tanstack/query-core 5.104.0`，未加为直接依赖，避免双实例），写入 `package.json` 与 `pnpm-lock.yaml`。

安装方式：`node_modules` 原本链接在全局 pnpm store，用 `pnpm add --save-exact --store-dir /Users/louistation/Library/pnpm/store/v10 …` 保持同一 store；storeDir 未改变。沙箱默认禁止写入工作区外的 store，该次安装经用户批准放宽一次完成。

API 核实（官方文档、对应版本源码与 npm 发布元数据；同时用下载的 `.d.ts` 与 `.mjs` 做机器级复核）：

- `createStore` 从 `zustand/vanilla` 导入，5.x 同时支持柯里化 `createStore<T>()(creator)`；`StoreApi<T>` 提供 `getState`/`getInitialState`/`setState(partial, replace?)`/`subscribe(listener)`。`setState(partial)` 默认**浅合并**，`replace: true` 才整体替换 —— 迁移必须逐处选择，见 02 票。`subscribe` 仅在 `Object.is(next, prev)` 为假时通知（原手写实现每次发布都通知）。
- `subscribeWithSelector` 从 `zustand/middleware` 导入，把 `subscribe` 扩展为 `subscribe(selector, listener, { equalityFn, fireImmediately })`；不传 selector 时保持原生行为。
- `useStore(store, selector?)` 内部即 `useSyncExternalStore(api.subscribe, () => selector(api.getState()), …)`；`use-sync-external-store` 是可选 peer，基础绑定无需显式安装。React 19 官方答复为可直接工作。
- Query v5 的 `useQuery` 只有单对象签名；`networkMode` 默认 `'online'`，离线时 `fetchStatus` 变 `'paused'`（含首次加载）；`'always'` 永不暂停且 `refetchOnReconnect` 默认转 false。`retry` 默认 3、指数退避；`retryOnMount`/`refetchOnMount`/`refetchOnWindowFocus` 默认 true，`staleTime` 默认 0，`gcTime` 默认 5 分钟。
- 风险点（已在本切片规避）：mutation 的 `networkMode` 默认 `'online'`，离线时会被暂停并在重连后自动按序继续 —— 对"结果未知的提交"等同自动重发。因此本切片**不使用 Query mutation**，发送/回答/停止/恢复/保存继续走直接命令，`D-24` 边界不变；`src/app/renderer/query-client.tsx` 内注释记录该理由。
- Electron 窗口隐藏（macOS 被遮挡也算）会让重试与焦点 refetch 暂停；`networkMode: 'always'` 与关闭 `refetchOnWindowFocus` 后，本地读取不受该行为影响。

验收：`pnpm typecheck`、`pnpm build`、`pnpm check:architecture` 通过；`pnpm check` 全项通过。

## Comments（环境）

- 本机 `pnpm lint:design` 在 Node 24.17.0 下 oxlint JS 插件 worker 以 SIGTRAP 退出（脚本自身会报"这是工具故障、不是规则结果"）；用 nvm 的 Node 24.21.0 运行 `pnpm check` 可全项通过。该差异与本次依赖无关，属环境已有的 Node 版本敏感性。
