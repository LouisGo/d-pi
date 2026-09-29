---
name: d-pi-state-query
description: "用于 d-pi 展示状态模型、store 订阅、React 绑定与只读异步查询的实现、重构和范式评审（Zustand 与 @tanstack/react-query）。新增 store、给视图接线、写查询 hook 或评审这类改动时使用；不用于全局文档/skill 审计、纯样式或无关仓库任务。"
---

# d-pi 状态与查询范式

落实 D-37：展示状态用 Zustand，只读异步查询用 TanStack Query。规则单源是[无头功能合同 §4](../../../docs/architecture/headless-features.md)（所有权、订阅粒度、选择器稳定性、本地读取网络语义）；本文只写"怎么写代码"，不另立所有权或验收标准。

先读合同相关节与目标模块 `AGENTS.md`，再按下面场景取用。别整份照抄：只读当前任务对应的那一节。

| 场景 | 取用 |
| --- | --- |
| 新建/改造展示状态模型 | [§1](#1-展示状态模型zustand-vanilla-store)、[§4](#4-生命周期) |
| 视图读取 store、列表逐行订阅 | [§2](#2-react-绑定与订阅粒度) |
| 新增只读查询（文件、Git、历史、配置……） | [§3](#3-只读查询tanstack-query) |
| 发送、回答、停止、保存等有副作用的操作 | [§3.1](#31-副作用不进-query) |
| 评审这类改动 | [§5](#5-提交前检查) |

## 1. 展示状态模型：Zustand vanilla store

```ts
import { createStore, type StateCreator } from "zustand/vanilla";
import { subscribeWithSelector } from "zustand/middleware";

interface RuntimeState {
  view: RuntimeView | null;
  thread: ThreadId | null;
  generation: number;
  disposed: boolean;
}
const initial: StateCreator<
  RuntimeState, [], [["zustand/subscribeWithSelector", never]]
> = () => ({ view: null, thread: null, generation: 0, disposed: false });
const createRuntimeStore = () =>
  createStore<RuntimeState>()(subscribeWithSelector(initial));
/** 只读面，供 React 绑定与测试；不导出到模块公开面。 */
type RuntimeStateStore = Pick<
  ReturnType<typeof createRuntimeStore>,
  "getState" | "getInitialState" | "subscribe"
>;
```

- **位置**：状态规则放 `contracts`/`core`，React 绑定放 `renderer`；`core` 与 `contracts` 不得出现 React（架构门禁与 `validation/s1/source-boundaries.mjs` 会把关）。
- **初始值必须显式标注 `StateCreator<…>`**。`exactOptionalPropertyTypes` 下，柯里化的 `createStore<T>()` 会把字面量收窄成 `{ view: null }`，导致 `setState` 拒绝后续状态；用工厂 + `ReturnType<typeof createStore>` 还能保住 `subscribe(selector, listener)` 的重载。
- **替换语义要显式**：`setState(partial)` 默认浅合并；原手写实现是整体替换时必须 `setState(next, true)`，并让 `next` 是完整的判别联合成员，否则一个成员会残留另一成员的字段。本来就是部分更新的（如提交视图）保留默认合并。
- **通知语义**：`subscribe` 只在 `Object.is` 变化时触发。不要依赖"同值也通知"。
- **元素引用保持**：列表更新不要整表重建，否则逐行订阅会全部触发。用 `items[index] = next` 或 `filter` + 单点替换，保留未变元素的引用。
- **只暴露只读面**：模型上暴露 `stateStore`（`Pick` 只读视图）+ `getSnapshot`/`subscribe`/`subscribeTo`；不要把 zustand 的 `StoreApi` 派生类型导出到模块 `public.ts`（供应商类型留在适配层）。
- **类型命名**：模块内已有同名类型时（例如 execution 的 `SubmissionStore`）不要并发导出另一个同名"Store"类型。

**细粒度订阅**由 `subscribeTo(selector, listener)` 提供，供无头读取与测试使用：

```ts
subscribeTo<Selection>(
  selector: (state: RuntimeState) => Selection,
  listener: () => void,
): () => void {
  return this.store.subscribe(selector, () => listener());
}
```

## 2. React 绑定与订阅粒度

```tsx
import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";

const state = useStore(model.stateStore, (s) => s.view?.phase);        // 原始值：直接选
const ids = useStore(                                               // 派生数组：必须 useShallow
  model.stateStore,
  useShallow((s) => s.view?.items.map((item) => item.id) ?? []),
);
```

- **选择器必须返回 store 内已有的引用或原始值。** 每次新建对象会触发 `getSnapshot should be cached` 并无限重渲染。
- 反例（禁止）：`useStore(store, (s) => ({ busy: s.busy }))`。
- 逐行订阅：行组件只订阅自己那一项，父级只订阅 ID 列表，避免一次 token 更新通知整表：

```tsx
const item = useStore(model.stateStore, (state) =>
  state.view?.items.find((entry) => entry.id === id),
);
```
- 组件内不要再包一层新的 subscribe 函数；`model.stateStore.subscribe` 引用稳定。仅当模型确实只提供 `getSnapshot`/`subscribe` 时才退回 `useSyncExternalStore`（如未迁移的 `DraftController`）。

## 3. 只读查询：TanStack Query

```ts
export const fileKeys = {
  all: (threadId: string) => ["files", threadId] as const,
  listing: (threadId: string, path: string) =>
    ["files", threadId, "list", path] as const,
};
const localRead = { networkMode: "always" } as const;   // 本地 IPC 必须显式声明

export const fileQueryOptions = {
  listing(files: FileBridge, threadId: string, path: string) {
    return queryOptions({
      queryKey: fileKeys.listing(threadId, path),
      queryFn: () => listDirectory(files, threadId, path),
      ...localRead,
    });
  },
} as const;

export function useDirectoryListing(...) {
  return useQuery(fileQueryOptions.listing(files, threadId, path));
}
```

- **位置**：`<module>/renderer/queries.ts`，经该模块 `renderer/public.ts` 暴露；应用层只组合，不自己建 key。新增环境或公开面要同步 `architecture/modules.json`、模块地图与模块页。
- **一个查询一个工厂**：`queryOptions` 同时供 `useQuery` 与命令式读取使用，key、`enabled`、`networkMode`、重试语义只写一次。
- **key 形状**：`[域, threadId, 资源, …维度]`；`all(threadId)` 用于按 Thread 前缀失效。key 里只放字符串/数字等稳定值；闭包捕获的 bridge 一旦会按 workspace 重建，就必须进 key。
- **`enabled` 只用于"未选中"真的不同于"默认值"的查询**。`""` 是合法根路径，因此目录列表的 `path` 是必填 `string` 且不设门控；把 `undefined` 与 `""` 映射到同一个 key，会让"未选中"读到根目录的数据。
- **`unavailable` 是业务结论，不是错误**：缺失/拒绝/二进制/超限/变化中/非 Git 等按数据返回。**只有采样失败**（`unavailable("failed")`）在查询层转成 throw，才能落到 `retry`；配置了 `retry` 却把失败当数据返回，等于重试永不生效。
- **client 默认值集中在 `src/app/renderer/query-client.tsx`**：`staleTime: 0`、`retry: 3`、关闭 `refetchOnWindowFocus`/`refetchOnReconnect`；刷新是显式动作，不轮询，不新增后台重取。

### 失败与进行中状态

- 重试窗口内 `status` 仍是 pending、`isError` 为 false；只用 `isError` 会让旧采样停在被当成本次结果。进行中判定要覆盖窗口：

```ts
export function readInFlight(state: {
  isPending: boolean; isFetching: boolean; isEnabled: boolean;
}): boolean {
  return state.isFetching || (state.isPending && state.isEnabled);
}
```

- `enabled: false` 的查询在 v5 里 `isPending` 恒为真，必须同时看 `isEnabled`，否则状态常亮。
- 进行中禁用刷新按钮：`invalidateQueries` 默认 `cancelRefetch`，连点会取消当前尝试并从头重试。

### 3.1 副作用不进 Query

- 发送、回答、停止、继续、保存等**不得**用 `useMutation`，也不得放进 `queryFn`：mutation 的 `networkMode` 默认 `online`，离线会被暂停并在重连后自动按序继续 —— 对"结果未知"的操作等同自动重发，违反 D-24。这类操作走直接命令与既有提交/收据合同。
- 同理不要用查询的重试、失效或缓存机制去"补偿"一次不确定的写操作。

## 4. 生命周期

- store 由应用装配（如 `AppModel` 构造）创建，**不随组件挂载**；视图卸载只取消订阅，不停止后台任务（D-29）。
- `dispose()`：置失效标记/递增代次 → 释放订阅与计时器 → 之后忽略迟到回包（`disposed`、`epoch`、`generation` 守卫），且保持幂等。
- **不要置空视图当作渲染开关的字段**（例如 `app.tsx` 用 `model.controller`、`model.submission` 决定工作区与面板）。释放后状态仍可能被重渲染，置空会让界面塌成空态，非空断言处还会抛错。释放资源即可，字段交给整棵模型一起回收。
- 迟到结果必须在 `await` 之后重新校验代次/线程身份，不能只在入口检查一次。

## 5. 提交前检查

- TDD：先写能暴露缺口的行为测试（投影订阅只在该投影变化时通知、跨 Thread 不共享缓存、瞬时失败会重试、业务 `unavailable` 只采样一次、切换到另一路径不显示上一个路径的残留）。
- 选择器没有任何一处返回新对象/数组而缺少 `useShallow`；逐行订阅依赖的元素引用确实被保持。
- 本地查询全部带 `networkMode: 'always'`；有副作用的路径没有 Query 重试或 mutation。
- `pnpm check`（含 `check:architecture`、设计与 i18n 检查）与 `pnpm build` 通过；受影响 GUI 路径按任务风险核对，不重跑无关矩阵。

## 与其他 skill 的分工

数据边界的 Zod/ts-pattern 与类型设计见 `d-pi-typescript`；目录归属、公开面与依赖登记见 `d-pi-architecture`；组件与样式见 `d-pi-design-system`；切片、拆票与验收节奏见 `d-pi-headless-features`。本文只覆盖状态与查询的写法。
