# 状态与查询基础库对齐（Zustand / TanStack Query）

2026-09-29。用户确认"这两个库对我的状态管理非常非常重要，我不能接受不在这两个库的基础上去做全局的状态管理，包括异步状态的管理"，并选择：**先落决定与规格，再按 TDD 实施迁移，保留现有外部行为与测试**（见 [D-37](../../docs/decisions.md)）。

## 推进与交接

- 起点：`main` 工作树干净；`0.1.0-s4.0` 已交付试用，用户反馈未到。S3 待试用，冷恢复保持只读。
- 受影响决定：新增 D-37（锁定 Zustand 与 `@tanstack/react-query` 为基础依赖）；取代 development-foundation spec 中 09-28 的"不为名录补齐状态库"规则；修正 B-01 的适用范围；细化而非改变 D-24 / D-29 / D-05。
- 重要产品待决：无。本次不新增用户可见功能，不改变任何既有行为；Query 缓存"新鲜度"只影响何时重新读取，不改变显示内容与失败归属。
- 工程状态：01–03 工程票完成。`zustand@5.0.15` 与 `@tanstack/react-query@5.104.0` 精确锁定；四个展示状态模型（`AppModel`、`RuntimeModel`、`SubmissionModel`、`ConversationModel`）迁移到 Zustand vanilla store 并新增按实体选择器订阅；`files.renderer` 与新增的 `changes.renderer` 提供 Query key 与 hooks，文件/Git 面板改用 `useQuery`（`networkMode: 'always'`、显式刷新、`unavailable` 视为业务结论而非重试错误），Monaco 改为按需加载入口以脱离静态导入面。`pnpm check` 全项通过（类型、Biome、设计 lint、i18n、边界、架构、测试 285 通过 / 1 可选跳过），`pnpm build` 通过且 Monaco 已独立分包。真实原生工具结果样本与打包矩阵不在本次范围。
- 用户试用：**尚未交付**。本会话环境存在 `ELECTRON_RUN_AS_NODE=1`（由 DSH 桌面 harness 注入），Electron 二进制被当作纯 Node 运行，`pnpm dev` 无法启动 GUI；干净基线与本次改动表现一致，属环境限制而非本次缺陷。需在你的终端按 04 票核对受影响路径。
- 继续边界：可在本授权内继续修复本切片回归、补充验证与本地提交；不扩展 S5/M2、不新增用户功能、不推送、不改 `docs/archive/pre-reset/`、不改官方 OMP。

## 目标与范围

**目标**：把当前"自写 store + 组件内直接 IPC"的状态层改为锁定依赖支撑的全局状态与异步状态层，且不改变外部行为、事务原子性、恢复顺序或 OMP 所有权。

范围：

1. 锁定并验证 `zustand` 与 `@tanstack/react-query`（版本精确锁定，Electron 44 / React 19 环境下验证接入）。
2. 现有展示状态模型迁移为 Zustand vanilla store：`AppModel`、`RuntimeModel`、`SubmissionModel`、`ConversationModel`。对外方法、订阅语义与既有测试保持有效。
3. Renderer 接入 Query：`QueryClientProvider` 单例 + 文件读取/Git 查询迁入 `useQuery`，替代 `file-workspace.tsx` 中 4 个结果型 `useState` 与手写序号防串线。
4. 一处记录真源：决定登记、无头合同、技术选型审议与模块地图同步，去掉"文档要求、代码没有"的脱节。

不在范围：新用户功能；UI 重构或视觉调整；Query 持久化/离线恢复；OMP 原生队列、历史或执行语义；`DraftController` 与 `I18nProvider` 的改写；`docs/archive/pre-reset/` 的任何复用或改动。

## 行为与所有权

### 1. 迁移边界：什么是"展示状态模型"

| 现有实现 | 是否迁移 | 理由 |
| --- | --- | --- |
| [AppModel](../../src/app/renderer/model.ts)（视图状态、草稿/偏好/忙碌/通知） | 迁移 | Renderer 展示状态与细粒度订阅，正是无头合同交给 Zustand 的部分 |
| [RuntimeModel](../../src/modules/execution/renderer/runtime-model.ts)（执行镜像、代次、失败视图） | 迁移 | 客户端执行镜像；不成为 OMP 执行事实的拥有者 |
| [SubmissionModel](../../src/modules/execution/renderer/submission-model.ts)（提交回执视图） | 迁移 | 回执落盘仍归 Main；此处只是消费结果的展示镜像 |
| [ConversationModel](../../src/modules/conversation/core/model.ts)（阅读投影、水位、gap） | 迁移 | 阅读投影模型；generation/seq/gap 证据规则不变 |
| [DraftController](../../src/modules/input/core/draft-controller.ts)（保存协调、revision 竞争） | **不迁移** | 它是保存协调与竞争判定，不是展示状态；换库会改变 D-24 相关语义而无收益 |
| [I18nProvider](../../src/modules/preferences/renderer/i18n-provider.tsx) | **不迁移** | 它是 React context provider 与已有 bridge 订阅的生命周期绑定，不是全局 store |

迁移只替换"状态容器 + 通知"这一层：`private state/listeners + getSnapshot/subscribe + publish` 变为 Zustand vanilla store 的 `getState/setState/subscribe`，其余生命周期（`connect`/`bind`/`dispose`/代次与序号校验/失败视图构造）留在原类内。`core` 与 `contracts` 环境继续不得引入 React：**core 内只使用 vanilla store，React 绑定只出现在 `renderer`**（[source-boundaries](../../validation/s1/source-boundaries.mjs) 与架构门禁继续把关）。

### 2. 订阅语义

- 现在：每个 store 一个全局监听集合，任何状态变化通知全部订阅者。
- 迁移后：`subscribe` 仍对每次变化通知，保持既有行为；新增按实体/选择的订阅能力（`subscribeWithSelector` 与 React 侧选择器订阅），供 `RuntimeModel` 与 `ConversationModel` 的列表项使用，避免整项任务的所有消费者随单条消息更新重渲染（[无头功能合同 §5](../../docs/architecture/headless-features.md)）。
- 业务生命周期继续独立于 React：store 由应用层创建并显式 `dispose`，视图卸载只取消订阅，不停止后台工作（D-29）。

### 3. Query 的拥有权与语义

| 查询 | key 形态 | 数据来源 | 新鲜度与失效 |
| --- | --- | --- | --- |
| 目录列表 | `["files",threadId,"list",path]` | `files.request({kind:"list"})` | 显式刷新与目录内文件变化事件触发失效；不做定时轮询 |
| 文件内容 | `["files",threadId,"read",path]` | `files.request({kind:"read"})` | 打开时取得，切换路径按 key 复用；显式刷新重新采样 |
| Git 当前变化 | `["git",threadId,"changes"]` | `git.request({kind:"list"})` | 显式刷新；原生记录变化可失效 |
| 单文件 Diff | `["git",threadId,"diff",scope,path]` | `git.request({kind:"diff",...})` | 与变化列表同源刷新 |

- **本地 IPC 的 `networkMode: 'always'`**：这些查询不依赖网络，必须按[技术选型审议](../../docs/architecture/technology-selection-review.md)的要求显式声明，避免 Query 判断离线时暂停本地读取。
- **重试**：这些查询都是幂等只读采样，允许 Query 默认重试以吸收瞬时失败；返回值中的 `unavailable`（缺失/拒绝/非 Git/二进制/超限/变化中）是**业务结论**，不得当作可重试错误。发送、回答、停止、恢复、保存等副作用继续**不进 Query 重试**，未知结果不自动重发（D-24）。
- **缓存不是第二份真相**：`unavailable` 与失败如实显示，缓存命中不伪装成功；并发变化仍以返回的来源/版本字段为准（D-20）。
- **单一可写正文**：输入正文仍归编辑器与 `DraftController`，Query 与 Zustand 都不持有可写正文（[无头合同 §4](../../docs/architecture/headless-features.md)）。
- 防串线：并发/切换路径的正确性由 query key 隔离提供，替代 `file-workspace.tsx` 的手写序号；迟到的旧 key 结果不得覆盖当前视图。

## 验收

先写能暴露目标缺口的失败测试，再最小实现：

- store 迁移的对外行为：既有 `AppModel`/`RuntimeModel`/`SubmissionModel`/`ConversationModel` 测试保持通过；新增"订阅只收到一次通知""按实体订阅不因无关项变化触发""同类实例互不影响"等选择器行为测试。
- 生命周期：`dispose` 后不再通知、不残留订阅；视图卸载不停止后台任务（沿用既有回归）。
- Query：本地查询在 `networkMode: 'always'` 下不被离线判定暂停；切换路径/并发返回不串线；`unavailable` 不作为失败重试；显式刷新使对应 key 失效；副作用查询无自动重试路径。
- 结构门禁：`core`/`contracts` 不出现 React 导入；`pnpm check`（类型、Biome、设计 lint、i18n、边界、架构、测试）与 `pnpm build` 通过。
- GUI：受影响路径（文件树/查看、Git 差异、执行面板与交互卡片）在开发态真实操作一遍；不重跑无关性能矩阵。

自动检查不替代用户试用；交付时给出启动与操作步骤、预期结果和已知限制。

## 任务

| 票 | 交付 | 依赖 |
| --- | --- | --- |
| [01](issues/01-pin-dependencies.md) | 锁定并验证 Zustand / Query 依赖与 `QueryClientProvider` 接入点 | 无 |
| [02](issues/02-zustand-migration.md) | 四个展示状态模型迁移到 Zustand vanilla store，含细粒度订阅 | 01 |
| [03](issues/03-query-files-git.md) | 文件与 Git 查询迁入 TanStack Query（`networkMode: 'always'`、显式失效） | 01 |
| [04](issues/04-integration-verification.md) | 全量检查、受影响 GUI 路径核对与试用交接 | 02、03 |

## Comments

### 2026-09-29 起点事实

- 依赖与实现均不存在：`package.json` 无这两项，`src` 内零命中；只有 [归档](../../docs/archive/pre-reset/README.md)保留旧原型，且旧原型中 Query 只有 `QueryClientProvider`、没有查询实现。
- 文档侧一直有效：B-01 与[无头合同 §4](../../docs/architecture/headless-features.md)把两库当作沿用方向与分工依据；[技术选型审议](../../docs/architecture/technology-selection-review.md)已写明本地查询需 `networkMode: 'always'`。
- 停掉接入的唯一文字是 09-28 加固轮次追加的"不为名录补齐状态库"，未走决定变更流程；本次以 D-37 取代并保留原句可追溯。
- 本切片按用户选择先落决定与规格；规格中的版本号在 01 票按官方文档核实后写入，不先写成假定事实。
