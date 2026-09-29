# 02 展示状态模型迁移到 Zustand

Status: resolved
Blocked by: 01
阶段: M1 基建（D-37 对齐切片）
受影响决定: D-37、D-29（不改变）、D-24（不改变）

## 交付结果

四个展示状态模型改为 Zustand vanilla store 承载状态与通知，对外方法与订阅语义保持有效：

| 文件 | 现状 | 迁移后 |
| --- | --- | --- |
| [app/renderer/model.ts](../../../src/app/renderer/model.ts) | `private state` + `listeners` + `publish` | vanilla store + `setState`，`getSnapshot/subscribe` 仍可用 |
| [execution/renderer/runtime-model.ts](../../../src/modules/execution/renderer/runtime-model.ts) | 同上，含代次与失败视图 | 同上；`bind`/`act`/`control`/`answer`/`dismiss`/`dispose` 不变 |
| [execution/renderer/submission-model.ts](../../../src/modules/execution/renderer/submission-model.ts) | 同上，`publish(Partial<View>)` | 同上；回执消费与清稿判定不变 |
| [conversation/core/model.ts](../../../src/modules/conversation/core/model.ts) | 同上，含 generation/seq/gap | 同上；水位与重同步规则不变 |

同时提供细粒度订阅：`RuntimeModel` 与 `ConversationModel` 的列表消费者按实体订阅，单条消息更新不再通知全部消费者。`core` 内只用 vanilla store，React 绑定只在 `renderer`。

不改：`DraftController` 与 `I18nProvider`（见 spec 的迁移边界表）；不改变事务原子性、恢复顺序、ACK/清稿规则与失败归属。

## 真正依赖

01（依赖与 API 形态确定后实施）。

## 验收证据

- TDD：先写暴露缺口的失败测试，再最小实现。新增覆盖：订阅每次变化只通知一次、按实体订阅不因无关项变化触发、两个同类实例互不影响、`dispose` 后不再通知且无残留订阅。
- 既有 `model.test.ts`、`runtime-model.test.ts`、`submission-model.test.ts` 及 conversation 相关回归保持通过（不伪造红灯，必要时补回归覆盖）。
- 竞态与代次行为仍被拦截：迟到回执不复活旧视图、Thread 切换不串状态、gap 重同步仍触发。
- 视图卸载不停止后台任务（沿用既有回归）；`pnpm typecheck`、Biome、`pnpm check:architecture`、`pnpm test:architecture` 通过。

## Comments

- 迁移只替换状态容器与通知层；`connect`/`bind`/`dispose`/代次校验/失败视图构造留在原类内，避免把桥接生命周期搬进 store。
- React 侧优先使用选择器订阅（按官方 API 形态），不改变组件读取的公开字段。

## Answer

四个模型全部迁移为 Zustand vanilla store + `subscribeWithSelector`，对外方法与稳定引用（`getSnapshot`/`subscribe` 为类属性箭头函数，可直接进 `useSyncExternalStore`）保持不变，并新增 `subscribeTo(selector, listener)` 细粒度订阅。

关键语义选择：

- `AppModel.publish(state)` 原来整体替换，迁移后用 `setState(state, true)` 保留替换语义 —— 用默认浅合并会让判别联合的一个成员保留另一成员的字段。
- `SubmissionModel.publish(change: Partial<View>)` 原本就是部分更新，保留默认浅合并。
- `RuntimeModel.publish(view)` 增加 `disposed` 守卫：释放后不再发布，即使桥接迟到投递；`ConversationModel`/`RuntimeModel` 的 epoch/generation 语义原样保留。
- store 类型用 `StateCreator<T, [], [["zustand/subscribeWithSelector", never]]>` + `ReturnType<typeof createStore>` 表达，避免 `StoreApi<T>` 丢掉选择器重载（`tsconfig` 开启 `exactOptionalPropertyTypes`，curried `createStore<T>()` 需要显式初始值类型）。
- `core` 内只用 vanilla store，React 绑定留在 `renderer`（`source-boundaries` 与架构门禁继续把关）。

新增测试（先失败后实现）：`src/modules/conversation/core/subscription.test.ts`（按实体订阅只在该实体变化时通知、整状态订阅不受选择器影响）、`src/modules/execution/renderer/runtime-store.test.ts`（投影选择器、绑定线程隔离、dispose 后不发布、迟到回执不复活旧视图）、`src/app/renderer/model-store.test.ts` 与 `src/modules/execution/renderer/submission-store.test.ts`（投影订阅、退订、部分更新保留其他字段、dispose 释放）。

既有回归全部保持通过，未修改任何既有断言来迁就实现。
