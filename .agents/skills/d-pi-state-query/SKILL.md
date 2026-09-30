---
name: d-pi-state-query
description: "用于 d-pi 展示状态模型、按需订阅与 React 渲染边界、只读异步查询的实现和评审（Zustand 与 @tanstack/react-query）。新增 store、给视图接线、处理外观更新性能或写查询 hook 时使用；不用于全局文档审计、纯样式或无关仓库任务。"
---

# d-pi 状态与查询范式

D-37 的所有权、生命周期、本地读取及执行命令政策单源是[无头功能合同 §3–4](../../../docs/architecture/headless-features.md#3-生命周期先于-hooks-选择)。本文提供有条件的写法和实际入口，不把旧补丁固定为唯一形态。先读目标模块 `AGENTS.md` 及合同相关节，按场景取用：

| 场景 | 取用 |
| --- | --- |
| 展示状态模型 | [§1](#1-展示状态模型zustand-vanilla-store)、[§4](#4-生命周期) |
| React 订阅与列表 | [§2](#2-react-绑定与实体订阅) |
| 文件、Git 等只读查询 | [§3](#3-只读查询tanstack-query) |
| 发送、回答、停止、继续 | [§3.1](#31-执行命令与-mutation) |
| 验证与评审 | [§5](#5-按影响验证) |

## 1. 展示状态模型：Zustand vanilla store

**推荐写法**：vanilla store 放无头模型，React 绑定留在 `renderer`。先决定展示投影与内部资源各归谁；不要求每个模型同时包装 `getSnapshot`、`subscribe`、`subscribeTo` 三套 API。

```ts
import { createStore } from "zustand/vanilla";
import { subscribeWithSelector } from "zustand/middleware";

interface RuntimeState {
  phase: "idle" | "running";
  threadId: string | null;
}
const createRuntimeStore = () =>
  createStore<RuntimeState>()(
    subscribeWithSelector((): RuntimeState => ({
      phase: "idle",
      threadId: null,
    })),
  );
type RuntimeStateStore = Pick<
  ReturnType<typeof createRuntimeStore>,
  "getState" | "getInitialState" | "subscribe"
>;
```

**库事实，Zustand 5.0.15 / TypeScript 7.0.2**：

- `createStore<State>()(initializer)` 是合法的柯里化签名；完整 `StateCreator<…>` 标注、显式初始化函数返回 `State` 都可用，不强制唯一写法。字面量或 middleware 推断失去所需状态范围时再补类型；有 selector middleware 时用工厂返回类型保留订阅重载，别将其提前收窄成普通 `StoreApi<State>`。
- `setState(partial)` 默认浅合并；整体替换用完整 `next` 加 `true`。判别联合切换时检查旧成员字段是否残留，部分更新则保留合并。
- 普通订阅按整体状态 `Object.is` 变化通知；`subscribeWithSelector` 默认比较选中值，可显式配置 equality 与 `fireImmediately`。内部代次更新不应无意义地通知无变化的展示投影。

**实际入口**：[ConversationModel](../../../src/modules/conversation/core/model.ts)及[订阅行为测试](../../../src/modules/conversation/core/subscription.test.ts)提供稳定快照、投影订阅和未变化实体引用的证据。沿用这些行为，不要求照搬类结构、所有状态字段或订阅包装。供应商类型留在适配层，不进入领域公开 DTO。

## 2. React 绑定与实体订阅

`useStore(store, selector)` 的快照需稳定。原始值或 store 内已有引用直接选择；派生对象/数组可用 `useShallow`、记忆化或预计算，使未变化结果保持引用。不要裸返回每次新建的 `{ busy: state.busy }`。

```tsx
const phase = useStore(model.stateStore, (state) => state.phase);
const ids = useStore(model.stateStore, (state) => state.itemIds);
const item = useStore(model.stateStore, (state) => state.itemsById.get(id));
```

更新实体列表时保留未变化项引用，父级订阅顺序，行订阅对应实体。在频繁更新或大列表中评估 ID 顺序 + 实体索引；逐行 `items.find(...)` 可能让每次通知产生所有行的重复扫描，少渲染不能单独证明低成本。不为小且低频列表强制新增索引。

模型的只读 store 足以接官方 `useStore` 时直接使用；已有窄 `getSnapshot`/`subscribe` 合同可用 `useSyncExternalStore`，不为 API 数量额外包装。当前[Conversation 视图](../../../src/app/renderer/conversation.tsx)按稳定 ID 顺序订阅，行从同一投影派生的 Map 取实体；[SubmissionModel](../../../src/modules/execution/renderer/submission-model.ts)的收据索引同样只由发布路径生成，不是可独立写入的第二份事实。

### 2.1 订阅范围与父级渲染

写 React 接入时先明确每个组件实际消费哪些状态，以及哪些子树不应随该状态更新。默认选择需要的字段或稳定资源引用；`useStore(store)` 或选择整个 state 只适用于确实消费全部投影的窄视图，不能用在包含编辑器、阅读列表等大子树的应用壳中图方便。全局偏好仍使用原状态拥有者，不另建可双写的 store。

- 子组件有 selector 并不能阻断父级重渲染。检查从应用壳、Context 到列表行的传播路径；把偏好、保存 busy、提示等订阅放到真实消费者，工作内容订阅 Thread/资源身份。语言变更等确实影响内容的 Context 更新应正常传播。
- 按自然职责拆分订阅边界；仍昂贵的子树才考虑 `memo`。检查回调、对象和 JSX 引用是否稳定，避免每次创建的新 props 使边界失效，也不把每个组件机械套上缓存。
- 大正文解析、初始编辑文档构造和编辑器创建按真实输入或初始化身份发生。偏好重绘不得顺带重新构造正文、重建 editor/model、清空 Query 缓存或重发读取。重挂载必须读取当前 pending 正文，不能把初始快照永久缓存成另一份事实。
- 对已知渲染缺口先写真实 React 挂载的失败回归：无关偏好/busy 更新不执行工作子树，实际资源变化和控件状态仍更新。可在慢业务边界观察调用次数；只 mock hooks 或比较 JSX 文本不证明实际订阅与父级传播。

当前落点为 [App 接入](../../../src/app/renderer/app.tsx)与 [Composer](../../../src/app/renderer/workbench/composer.tsx)。需要非 CSS 组件换肤或尺寸测量时同时查 [design-system skill](../d-pi-design-system/SKILL.md#外观更新与布局成本)，保持颜色、字体和几何各自的更新原因。

## 3. 只读查询：TanStack Query

**推荐写法**：领域 `renderer/queries.ts` 提供 key 与 `queryOptions`，经对应 `public.ts` 暴露；hook 与命令式读取复用同一工厂，应用层只组合。新增公开面/环境/跨模块依赖才同步机器清单与模块地图。

**查询身份**：key 表达影响结果的稳定资源身份和维度。当前文件/Git 查询共用 threads 的真实 `ThreadContext`（threadId、workingDirectoryId、directory），再加入路径及 Git scope；不构造没有事实拥有者的配置代次，bridge 对象引用也不能代替资源身份。数组或可序列化对象都可作为维度，不限制为只有字符串/数字。区别“未选中”与合法默认值：未选中 key 使用 `null`，目录根路径 `""` 合法。

**项目政策**：本地文件/Git/配置读取显式 `networkMode: "always"`；业务 `unavailable` 按数据返回，采样失败进入错误通道。错误仍需保留真实原因和 trace，不把所有失败压成同一无来源的字符串。缓存不是当前磁盘事实；分别表达旧采样、正在采样和失败，不借工程重写自行改变已定刷新体验。

**库事实，TanStack Query 5.104.0**：

- `queryOptions` 共享定义并保持类型，不统一各消费 API 的触发语义。`enabled` 控制 observer 的自动查询；命令式 `fetchQuery` / `query` 以及显式 `refetch` 不把它当执行前置。当前工厂在执行函数内也核对选择，未选中的显式 fetch/refetch 返回 `null`、不发 IPC；消费方不能把 `null` 当文件或 Diff 数据。
- `enabled: false` 且无数据的 observer 可以是 `status: "pending"`、`fetchStatus: "idle"`；已有缓存时可为 `success`，不是恒 pending。以 `isFetching` 判断当前采样，等待首次读取时再结合 `isPending && isEnabled`。
- 首次读取重试期间可为 pending；已有成功数据的后台重试可以保持 success。只看 `isError` 或 `isPending` 无法完整表达正在重新采样，应同时检查 `fetchStatus`/`isFetching` 和旧数据身份。
- `invalidateQueries` 的取消/重取条件取决于活动 observer、已有数据和 `cancelRefetch` 等选项。当前界面在采样期间禁用刷新，避免重复刷新扰乱当前尝试；不能概括成任何连点都必然取消并重试。

当前入口：[文件查询](../../../src/modules/files/renderer/queries.ts)与[行为测试](../../../src/modules/files/renderer/queries.test.ts)、[Git 查询](../../../src/modules/changes/renderer/queries.ts)与[行为测试](../../../src/modules/changes/renderer/queries.test.ts)、[应用 QueryClient](../../../src/app/renderer/query-client.tsx)。行为检查覆盖真实资源身份隔离、未选中零 IPC、本地离线读取、采样失败重试与业务结论不重试；`FileReadError`/`GitReadError` 保留该次请求的 trace、operation、业务回包或 transport cause。Client 默认配置集中维护，显式刷新，不新增轮询或后台重取策略；刷新失败的旧采样体验仍待用户试用。

概念参考官方 [Query Options](https://tanstack.com/query/latest/docs/framework/react/guides/query-options)、[Query Keys](https://tanstack.com/query/latest/docs/framework/react/guides/query-keys)；实际成立条件以锁定包的 `queryObserver.ts`、`queryClient.ts`、`retryer.ts` 和行为检查为准，不以 latest 文档暗中升级本项目。

### 3.1 执行命令与 Mutation

发送、回答、停止、继续沿用协调器/收据，不放进 `queryFn` 或 Query Mutation 的缓存、重试、暂停恢复生命周期。这是 D-24/D-29 的**项目政策**：命令关联、ACK、执行结果与 unknown 恢复有独立合同；Query 不能负责补发不确定命令。保存等既有命令也沿用对应拥有者，不为接状态库搬走写入职责。

**库事实**：锁定版本 Mutation 默认 `retry: 0`；默认 online 模式会在离线时暂停，恢复行为受网络模式、scope、持久化与显式恢复配置影响。不能把所有 Mutation、所有配置或每次暂停都等同于“已经执行后自动重发”。业务 unknown 的不重发约束继续成立。

## 4. 生命周期

业务实例由应用、Thread 或 Renderer 连接作用域拥有，视图卸载释放订阅、编辑器和 DOM 资源，不等于停止 OMP 任务。内部资源状态与展示投影分清；dispose 幂等，释放后投影仍表达真实可读性和可操作性，不靠保留非空字段伪造可用资源，也不因清空字段制造半成品工作区。

跨 `await`、事件回调与重连继续校验 Thread/会话身份、实例代次和版本；入口一次检查不足。只保留真实需要的守卫，不把每个模型都必须存 `disposed/epoch/generation` 当统一模板。已有[Runtime 行为测试](../../../src/modules/execution/renderer/runtime-model.test.ts)与[AppModel 测试](../../../src/app/renderer/model.test.ts)是相应路径的验证入口。

当前应用通过[ThreadModel](../../../src/app/renderer/thread-model.ts)构造完整资源后才发布 ready；草稿保存 lane 绑定原 Thread，编辑器重挂载读取 controller 的 pending/已确认正文。视图只绑定和释放编辑资源，旧回调不从应用的“当前 controller”取新 Thread；[绑定回归](../../../src/app/renderer/workbench/composer-binding.test.ts)补迟到 IME 与重挂载路径，真实编辑器体验仍由对应构建的 GUI 验证和用户试用确认。

## 5. 按影响验证

针对实际缺口先写失败行为测试，再最小实现；既有正确行为补测可直接通过。重点验证稳定快照/订阅、身份隔离、迟到结果、释放、业务 unavailable 与采样错误、离线读取；不以覆盖率或字段快照凑测试。

按任务运行相关类型与行为检查，必要的 `pnpm check` / `pnpm build` 由集成方协调；受影响 GUI 补实际证据，自动化与 Agent 检查不替代用户认可。代码事实或经过验证的入口改变后更新本 skill 引用，政策仍回链合同。

数据边界见 `d-pi-typescript`；目录与依赖见 `d-pi-architecture`；组件/样式见 `d-pi-design-system`；拆票与交付见 `d-pi-headless-features`，不复制其完整流程。
