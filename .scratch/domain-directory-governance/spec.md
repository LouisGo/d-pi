# d-pi 领域、目录与 AI Coding 治理方案

当前结构化状态由此块维护，下文有日期的过程记录保留当时语境。

```project-status
[
  {
    "id": "domain-migration",
    "title": "领域目录治理",
    "phase": "基建",
    "engineering": "complete",
    "trial": "not-applicable",
    "acceptance": "not-applicable",
    "evidence": [
      "handoff.md"
    ],
    "next": "沿用模块机器清单，目录规模不作为硬门槛"
  }
]
```

日期：2026-09-29。版本：第二版（独立复核后完整修订）。状态：**原 P0–P4 工程切片已交付；本次独立 review 发现的收口缺口已补修，当前交付待用户试用**。

历史方案授权仅覆盖文档，已被 2026-09-29 用户后续指令覆盖：正式启动领域重构，先完成 P0 最小门禁和 P1 完整切片，按实际成本校准后继续 P2–P4；遵循 TDD、必要回归/构建/受影响 GUI 验证，不扩展 S5/M2。针对本次 review，用户进一步明确授权在修复完成后 commit 并 push；文档或工程通过不等于用户试用认可。

当前交接：第一版的共享 formatter 与启动恢复落点已补齐；行数由硬门槛改为维护信号；P0 缩至最小有效边界，P1 增加开发成本验收。后续明确开启重构后，按本方案拆近期工作包；常规结构调整由 Agent 自主完成，只有影响既有产品决定的变化才需对齐。

## 1. 建议与目标

采用 **单应用、按领域聚合、领域内按运行环境分层** 的结构。将现在分散在 `features/`、`main/`、`host/`、`renderer/` 中的同一能力收拢到 `modules/<领域>/`；进程入口留在 `app/`，通用技术适配留在 `platform/`，少量纯共享基础留在 `shared/`。

先落实公开入口、环境边界、禁止依赖和有负例的门禁测试，再通过一个真实切片校准清单、编译隔离和文档维护方式。文件规模用于提示职责审查；AGENTS/skill/任务模板负责让日常开发经过这些检查。目录是规则的可视化，检查防止明确越界，实际开发反馈决定治理是否值得保留。

目标是回答并检验四件事：新功能归谁；状态和资源归谁；允许依赖谁；怎样证明没有突破边界。不是把每个文件都变短，也不是增加一层统一 Manager。

以下为本项目建议，不冒称上游现成规范或用户已确认决定：七个当前模块、目标目录、初始依赖矩阵、规模提示、检查工具和迁移顺序。模块和依赖矩阵是当前版本，可以随实际能力演进；环境安全、资源所有权、数据完整性是持续约束。

## 2. 当前事实与问题

### 2.1 调查基线

- review 固定基线：`7ea1d2336afa7c16b946e56e60fa772868dd06ba`；修复前工作树干净。
- `package.json`：`0.1.0-s4.0`，单应用；Electron + React + TypeScript，固定 OMP SDK `18.3.0`。
- 已读取决定登记、基础方案、领域词汇、模块地图/交接、无头合同、任务约定、S4 spec/交接、关键入口/协调器/视图/存储及检查配置。
- S4 文档记录工程已交付、用户试用未认可；S3 冷恢复仍受单写证据约束。本次没有运行应用、重跑业务测试或验证历史验收结论。
- 外部仓库仅在 `/tmp` 取得只读研究副本；其 AGENTS 是研究对象，不是本仓库执行指令。

### 2.2 规模与职责集中

统计口径：当前 `src/` 实际文件；行数包含空行和注释，TS/TSX 总量包括测试。`runtime/host.mjs` 等构建入口另行审查，不混入下表。

| 位置 | 全部文件 | 直接平铺文件 | TS/TSX 行数 |
| --- | ---: | ---: | ---: |
| `src/` | 135 | 0 | 19,188 |
| `src/main/` | 31 | 25 | 6,878 |
| `src/renderer/` | 29 | 23 | 3,104 |
| `src/host/` | 11 | 11 | 2,916 |
| `src/features/` | 43 | 0 | 4,764 |
| `src/shared/` | 19 | 6 | 1,134 |

| 具体证据 | 判断与影响 |
| --- | --- |
| `main/index.ts` 604 行，含窗口、菜单、语言、启动存储、退出及各类 IPC | 启动入口承担多个能力；新增功能容易继续向入口追加分支 |
| `main/runtime-service.ts` 701 行，含准入、启动、Host 消息、提交、停止及资源关闭 | Runtime 成为跨领域汇合点，改一个行为需要理解大量关联状态 |
| `host/session-host.ts` 664 行，含原生观察、阅读投影、交互超时、控制、派发、释放 | 存在可分解职责，但生命周期状态紧密关联，不能仅按行数切块 |
| `renderer/runtime-panel.tsx` 492 行；`file-workspace.tsx` 354 行；`conversation.tsx` 308 行 | 一个文件承载多个交互或展示能力；文件/Git 查询协调与 JSX 混在一起 |
| `main/project-git.ts` 480 行 | 命令执行策略、状态解析、采样和 Diff 查询可以按责任划分；必须保持 filter 中和等已有效果 |
| `DraftService` 处理 restore/choose-project/save/preferences；桌面桥 `Command` 也混合这些命令 | 早期 S1 用例组合被命名为草稿服务；命名和真实职责逐渐脱节 |
| `RuntimeModel` 创建 `ConversationModel`；阅读投影引用 runtime 原生帧类型；submission 与 runtime 双向引用 | review 已确认原生命周期归属不清；修复后由 `AppModel` 持有 Renderer 阅读模型，`app/host` 组合独立的 conversation Host scope |
| `main/storage/database.ts` 在构造时将 dispatching 收据更新为 unknown，且位于 v3 与 v4/v5 schema 升级之间 | 执行恢复策略藏在存储基础设施；仅搬文件和 import 检查无法消除职责越界，必须显式拆出并保留顺序 |
| 模块地图仍标 S2；交接图仍描述旧 stdio RPC 接入，当前已存在官方 SDK 薄宿主 | 文档的当前代码导航与实现演进脱节，AI 容易沿旧落点继续追加 |

并非项目毫无组织：已有领域合同、无头规则、事务仓储拆分、token/i18n 检查和明确进程所有权。这些应保留。真正缺口是 **领域合同没有贯穿实现落点，规则缺少完整执行门禁，文档更新没有形成闭环**。

### 2.3 当前检查不足

- `validation/s1/source-boundaries.mjs` 自述为 narrow source checks；通过正则处理部分 import，限制 feature→平台和 Host→Main 等方向。没有模块公开入口、跨领域依赖图、循环或新目录归属检查。
- 此脚本对 feature/platform 检查跳过 `.test.ts`，不构成统一测试边界策略；side-effect import、别名/重导出等也不能依赖现有正则完整覆盖。
- `tsconfig.json` 把 DOM 和 Node 类型放入同一程序，缺少浏览器、无头、Node 的独立环境约束；review follow-up 已补齐 core/renderer/main/host/preload 专用 typecheck。
- i18n 与设计 lint 只扫 `src/app/renderer`，Tailwind source 也只从 App root 推导；review follow-up 已显式覆盖模块 Renderer 根目录。
- Biome `preset: none`，有格式检查但没有启用完整通用 lint 规则集；Oxlint 当前集中于设计系统。这不表示 lint 无效，但不能把它当领域架构检查。
- 当前 checkout 无 `.github/`，没有可见的仓库 CI 工作流。远端是否另有保护规则本轮未查询。
- 没有模块公开入口清单、结构例外跟踪或“新增硬规则必须接入 check”的自动验收；也没有用于识别热点增长的规模报告。规模报告与强制边界检查的作用不同。

## 3. 两个参考项目：借什么、舍什么

研究固定到以下提交，避免把未来变化混作本次依据：

- DeepSeek Harness：[`4878cdabd87d4041bdaff61d04c966883b9fd07a`](https://github.com/deepseek-ai/deepseek-harness/tree/4878cdabd87d4041bdaff61d04c966883b9fd07a)。
- Kimi Code：[`395d537237d737de0239159b60d1cc160bdf04e6`](https://github.com/MoonshotAI/kimi-code/tree/395d537237d737de0239159b60d1cc160bdf04e6)。本次参考当前 TypeScript `kimi-code`，不是用旧 Python `kimi-cli` 的结构代替。

| 可核实实践 | d-pi 的应用 |
| --- | --- |
| DeepSeek 按能力组组织 `packages/<group>/<package>`，架构明确能力/服务所有权，应用由组合入口装配。[架构](https://github.com/deepseek-ai/deepseek-harness/blob/4878cdabd87d4041bdaff61d04c966883b9fd07a/docs/architecture.md) | 借鉴按能力归属和显式组合；d-pi 先用目录边界，不复制 Cordis、插件总线或包数量 |
| DeepSeek 要求抽象对应当前消费者和拥有者，发布状态遵循提交点，注册资源可释放。[包规则](https://github.com/deepseek-ai/deepseek-harness/blob/4878cdabd87d4041bdaff61d04c966883b9fd07a/packages/AGENTS.md) | 模块卡必须写状态、资源和释放条件；不因迁目录新增另一份队列/会话真相 |
| DeepSeek 有工作区约束脚本、门禁聚合及本地 hook；局部检查与 CI 全面检查分工。[约束脚本](https://github.com/deepseek-ai/deepseek-harness/blob/4878cdabd87d4041bdaff61d04c966883b9fd07a/scripts/check-workspace-constraints.ts)、[门禁入口](https://github.com/deepseek-ai/deepseek-harness/blob/4878cdabd87d4041bdaff61d04c966883b9fd07a/scripts/run-gates.ts)、[hooks](https://github.com/deepseek-ai/deepseek-harness/blob/4878cdabd87d4041bdaff61d04c966883b9fd07a/lefthook.yml) | 规则必须进入统一命令并实际失败；保留快速本地反馈，不复制庞大调度器 |
| DeepSeek Client tsconfig 不默认带 Node ambient types。[配置](https://github.com/deepseek-ai/deepseek-harness/blob/4878cdabd87d4041bdaff61d04c966883b9fd07a/tsconfig.base.client.json) | d-pi 拆分无头、Renderer、Main、Host、Preload 编译环境，兼用 import 门禁 |
| Kimi 根 AGENTS 保留热路径地图，目录规则就近维护；CLI 通过 SDK 接入；transcript 是独立且 browser-safe 的阅读数据层。[根指南](https://github.com/MoonshotAI/kimi-code/blob/395d537237d737de0239159b60d1cc160bdf04e6/AGENTS.md)、[transcript 包](https://github.com/MoonshotAI/kimi-code/blob/395d537237d737de0239159b60d1cc160bdf04e6/packages/transcript/package.json) | 缩短根入口，领域规则就近路由；阅读投影不依赖执行实例的构造细节 |
| Kimi 开启生产代码 import cycle/self-import 检查，并把 lint/sherif 等接入 CI。[lint 配置](https://github.com/MoonshotAI/kimi-code/blob/395d537237d737de0239159b60d1cc160bdf04e6/.oxlintrc.json)、[CI](https://github.com/MoonshotAI/kimi-code/blob/395d537237d737de0239159b60d1cc160bdf04e6/.github/workflows/ci.yml) | 采用依赖图检查和必需状态检查；不直接复制其测试覆盖例外或全部 lint 偏好 |

**文件体积结论：**Kimi 的 `.oxlintrc.json` 明确把 `max-lines`、`max-lines-per-function` 设为 `off`。在已检查的 DeepSeek 根 lint、开发文档、包规则与 scripts 搜索范围内，未发现通用单文件行数上限；这不是对每个子目录不存在局部规则的证明。不能声称“优秀项目统一限制 300 行”。第 7 节仅将规模作为审查信号，不从上游规则推导本项目必须采用硬上限。

不采纳的上游特性：DeepSeek 的全插件运行时和每文件 100% coverage 目标、Kimi 的特定目录禁注释/DI Scope 系统、各自包发布与 changeset 流程。它们解决的是不同规模和产品的问题；d-pi 的 D-17/D-29/D-30 及官方 OMP 所有权保持有效。

## 4. 领域划分

仍采用根 CONTEXT 的单一产品上下文；下列是内部能力模块，不宣称七个独立 DDD bounded contexts，不新建七套词汇表。

| 模块 | 拥有的业务事实与职责 | 不拥有 | 当前来源 |
| --- | --- | --- | --- |
| `workspace` | Project/Workspace/Thread 身份、目录关系、执行信任/App 文件授权记录、Thread 与原生记录关联 | OMP 会话执行、文件当前内容 | threads 合同/仓储、目录身份、choose-project 的业务部分 |
| `input` | 草稿版本、冻结输入内容、引用序列化、Composer 接入与输入保存协调 | 收据终态、原生消费、文件现值 | draft、Composer、plain-text/URL/file-reference/selection-insert |
| `execution` | App 提交收据与交接、执行准入协调、停止/继续、待答交互、当前执行镜像 | OMP 原生队列/执行引擎、阅读历史的权威数据 | submission、runtime、control 中执行相关内容 |
| `conversation` | 实时阅读投影、快照/增量水位、原生历史查询适配、工具结果证据 | 启动/停止 Agent、重新执行历史 | conversation、history、native-history 与对应视图 |
| `files` | 授权文件读取、文件版本和选择来源描述、只读代码视图 | 草稿持久化、Git 差异来源、编辑功能 | files、project-files、文件查询与视图 |
| `changes` | Git 当前差异及各侧来源/覆盖；消费已有工具证据用于展示 | 推断全部改动作者、虚构 Run/Revert | changes、project-git、Git/Diff 业务视图 |
| `preferences` | App 主题/密度/语言偏好及保存 | OMP 配置/凭据、Agent 模型参数 | preferences、LocaleBridge、语言偏好协调 |

技术设施不冒充业务域：SQLite 连接/schema 迁移、Electron 传输、进程资源、诊断落盘、共享 Intl formatter、通用 UI/Icon/Monaco 适配。schema 迁移可以包含版本必需的数据变换；每次启动对执行状态作恢复判断不属于 schema 迁移。

`execution` 内保留 `submission`、`session`、`control` 子能力名称。把原来互相耦合的三个 feature 放入一个清楚的能力边界，不是把它们并成一个大文件或统一状态对象。

将来 configuration/auth、terminal、browser、side-chat 沿已有模块文档建模块；本轮只保留导航，不预创建空目录或接口。App preferences 与 OMP configuration 必须分开。

### 所有权与生命周期保持不变

- OMP 拥有原生执行、队列、工具与原生历史；d-pi 只保存 App 收据和必要镜像。
- Main 拥有数据库连接、持久事务及 utility Host 监督；Host 拥有当前实例的原生连接、订阅与交互资源。
- Thread 切换/视图卸载只解除相应订阅与编辑器资源，不自动停止后台执行。
- 文件/Git 来源与原文保持；选区是所见版本的冻结快照。
- 结果 `unknown` 不自动重发；没有恢复单写证据仍只读。
- 改目录不改 SQLite schema、持久身份、IPC 外部行为和 SDK 版本；确实需要行为变化时单独说明与验收。

## 5. 目标目录与放置规则

```text
src/
  app/                         # 应用组装、跨域用例、进程入口
    main/
      index.ts                 # 启动/装配调用
      bootstrap.ts
      lifecycle/               # 窗口关闭、退出协调
      ipc/                     # 发送方校验、按能力注册 handler
      wiring/                  # 仓储、服务和跨域事务组合
    host/
      index.ts                 # utility 入口
      bootstrap.ts             # 原生连接、execution/conversation 组合
    preload/
      index.ts
      bridge.ts                # 受限 API 暴露
    renderer/
      index.html
      main.tsx
      shell/                   # App、布局、启动/错误状态
      workbench/               # 文件/Git/输入等跨域视图组合
      wiring/                  # 创建客户端模型、连接订阅
    contracts/
      desktop-bridge.ts        # 仅聚合公开合同
      host-channel.ts          # 跨域传输 envelope；不放业务规则
  modules/
    workspace/
    input/
    execution/
    conversation/
    files/
    changes/
    preferences/
  platform/
    main/
      storage/                 # 单一 database、schema/migrations、事务原语
      diagnostics/             # 日志设施
    node/
      filesystem/              # 通用真实路径/句柄辅助
      process/                 # 通用进程/资源路径能力
    omp/
      protocol/                # 与固定官方版本有关的原生帧/schema
      resources/               # SDK/Bun 资源定位与校验
    renderer/
      ui/                      # 现有 Button 等基础组件
      icons/                   # 供应商图标唯一入口
      styles/                  # token 与全局 reset/基础样式
  shared/
    identity.ts                # 稳定身份类型/schema
    messages/                  # 无头消息 DTO/code；不带格式化副作用
    i18n/                      # 沿用共享 create-i18n、catalog、locales、locale
                               # Main/Renderer 共用 formatter，无 React/DOM/Node
    text/                      # 有明确语义的纯文本原语
    build-info.ts
runtime/                       # 已登记的 omp 环境官方 SDK 薄宿主源码
    host.mjs
    BUN-LICENSE.md
tests/
  integration/                 # 跨模块、跨进程、事务组合
  architecture/                # 规则正/反例，不运行产品副作用
  support/                     # 被多个测试实际复用的 fixture 工厂
scripts/
  architecture/                # 最小边界检查起步；按试迁移结果增加报告
  runtime/                     # fetch/prepare SDK
architecture/
  modules.json                 # 机器规则单源
  exceptions.json              # 仅实际需要的结构例外；区分临时迁移与长期设计
docs/architecture/
  source-layout.md             # 经确认后的目录/依赖规范
  modules/                     # 沿用并更新已有领域说明
.agents/skills/
  d-pi-architecture/            # 导航、放置判断、检查流程
```

这是目标导航，不要求一次生成所有子目录、配置或文档生成器。P0 只建立试迁移所需的规则数据和检查；全面覆盖按第 9 节逐波完成。已有 `validation/` 中可复用检查迁到合适位置；历史实验继续保留，不按新目录重写历史证据。`docs/archive/pre-reset/` 不动。

### 一个模块怎样长大

以输入模块为例，只创建已有责任需要的目录：

```text
modules/input/
  AGENTS.md                    # 简短适用规则和文档入口
  contracts/
    public.ts                  # 显式公开导出
    draft.ts
    frozen-input.ts
  core/
    public.ts
    draft-controller.ts
    draft-controller.test.ts
    references/                # 冻结引用解析/序列化
  main/
    public.ts
    draft-service.ts
    draft-repository.ts
  renderer/
    public.ts
    composer.tsx
    editor/                    # Tiptap 节点、粘贴、链接、选择插入
    composer.css
```

- `contracts` 是可跨进程的数据合同/窄接口，允许 Zod schema；不能导出 React/Electron/SQLite/OMP 供应商类型。
- `core` 是不依赖平台和 React 的规则、控制器、投影或客户端模型；不是要求所有模块都有它。
- `main`、`host`、`renderer` 分别装本模块在该环境中的实现。同模块也不能跨进程直接 import 实现。
- `public.ts` 按面提供入口；一个模块没有某环境实现就没有对应目录/入口。**不建同时导出 main/host/renderer 的总 barrel**。
- 只有跨模块或 app 装配需要的符号才公开，使用显式导出；内部 import 相对路径，不回绕自己的 public 入口。
- 文件统一 kebab-case，组件导出用 PascalCase；避免 `utils.ts`、`helpers.ts`、泛称 `service.ts`、`model.ts` 聚合不相关职责。
- 单一职责小模块不强制再分 controller/service/repository/types 四层；抽取须有独立责任、资源或协作边界。
- 目录难以浏览时按独立责任分组，不设置目录文件数硬门槛，不为了计数建 `misc/`。

### 当前热点的具体去向

| 当前文件/集合 | 目标与需要的拆分 |
| --- | --- |
| `main/index.ts` | `app/main/index.ts` + bootstrap/lifecycle/ipc/wiring；各 handler 调公开能力，sender/frame 校验保留共同入口 |
| `main/draft-service.ts` | 保存草稿留 input/main；选项目归 workspace；偏好归 preferences；启动恢复聚合回复由 app 用例组合；不得顺手改变 S1 单前台草稿行为 |
| `main/runtime-service.ts` | execution/main 的 session-controller、submission-dispatch、control-service；app 组装 HostConnection 与仓储，不把所有原字段复制到三个对象 |
| `main/host-connection.ts` | execution/main 的 Host 连接适配；通用 utility 创建能力可留 platform，实例身份/启动许可仍由 execution 管 |
| `host/session-host.ts` | `app/host` 组装；execution/host 管派发/交互/控制，通过 `SessionHostOptions` 交出原生帧、端口附着和释放；conversation/host 管阅读订阅/投影。退出由单一 Host 组合按顺序释放资源 |
| `host/native-session.ts`、frame-decoder | execution/host 原生 session 适配与 platform/omp/protocol 解码；业务投影不直读未经归一的供应商帧 |
| `features/submission`、runtime、control | execution 内按 submission/session/control 收拢；`control/quit` 迁 app/main/lifecycle，不把 App 退出归为 Agent 控制 |
| `features/conversation`、history、native-history | conversation/core、contracts、main、renderer；实时/历史保持独立来源和覆盖标识 |
| `features/files/reference.ts`、selection 与 renderer file-reference-node | 文件版本/坐标 DTO 和准确选区计算归 files；引用编码/还原和 Tiptap 原子节点归 input，避免 files 反向依赖输入 |
| `renderer/file-workspace.tsx` | 跨域组合留 app/renderer/workbench；文件浏览/请求代次归 files；Git 列表/查询归 changes；视图仅订阅与发意图 |
| `main/project-git.ts` | changes/main 内拆 git-command、status-parser、list-changes、read-diff；安全执行策略保持集中，禁止每个查询重新拼外部程序开关 |
| `renderer/monaco-viewer.tsx` | 当前同时消费文件选区与 i18n，整体先归 files/renderer/editor；changes 通过 files 的公开 Renderer 能力复用。只有出现独立技术消费者才提取无业务依赖的 Monaco 适配到 platform，不为预定目录额外造包装 |
| `renderer/runtime-panel.tsx` | execution/renderer 中 session-status、queue-summary、interaction-dialog；不把表单焦点/临时输入搬到后台业务状态 |
| `renderer/conversation.tsx` | conversation/renderer 的实时阅读、历史、工具结果；收据列表归 execution/renderer，由 app 组合 |
| `renderer/model.ts` | app/renderer/wiring 的组合用例；RuntimeModel 不再自行创建阅读模型，重连联动在组合层保持原行为 |
| `main/storage/*` | database/schema migrations 留 platform/main/storage；业务仓储随模块迁移；AppStorage 组装归 app/main/wiring；database.ts 内 dispatching→unknown 的业务恢复转入 execution/main，由 app 显式调用，详见下文启动顺序 |
| `shared/i18n/*`、localization 合同、Renderer provider | formatter/catalog/locales/locale 留 shared/i18n；语义消息 DTO/code 归 shared/messages；LocaleBridge 归 preferences/contracts；provider 连同偏好同步留 preferences/renderer，不复制 formatter，也不引入 platform→业务的反向依赖 |
| `shared/desktop-bridge.ts` | app/contracts 聚合；draft/preferences/workspace 等命令归各自合同。先保持现有 IPC envelope 和回复语义，内部拆分不等于协议升级 |
| `renderer/styles/app.css` | 布局归 shell/workbench，能力样式跟模块，通用组件样式跟 ui；token 保持唯一源 |
| `runtime/host.mjs`、prepare-sdk | runtime 作为 `omp` 环境模块登记并保留独立 SDK 启动环境；脚本更新 consumption-gate 构建源、资源复制/哈希路径；官方 SDK 文件不改 |

**跨域事务特例不能丢：**App 收据与草稿消费标记必须仍由同一 SQLite 连接、同一事务提交。execution 的提交持久端口表达这项原子操作，`app/main/wiring` 组合 execution/input 仓储实现；input 仓储提供参与已有事务的窄接口，不另开事务/连接。禁止迁成两个先后独立提交的服务调用。现有相关测试随迁移保留并验证写失败的回滚。

### 共享 i18n 的完整调用路径

沿用现有 `createI18n`，不新增通用翻译服务：

```text
shared/messages             语义消息 DTO/code，供无头能力传递
shared/i18n                 createI18n + catalog + locales + locale
  ↑ Main 菜单/系统对话框       使用 Main 解析的 resolvedLocale
  ↑ preferences/renderer     I18nProvider/useI18n、偏好同步、DOM lang/dir
```

formatter 可以依赖 `@formatjs/intl` 与标准 ECMAScript Intl，不能依赖 React、DOM、Node 或 Electron；共享不等于零第三方依赖。当前 `import.meta.env.DEV` 为构建注入，迁移时保留或给出窄 ambient 声明，不因此开放 DOM/Node 类型。Main 和 Renderer 共用相同 key、参数与 fallback 逻辑；Main 仍负责系统语言解析，Host/OMP 只传语义数据，不消费 UI formatter。现有 provider 包含 LocaleBridge 订阅/保存和 DOM 设置，是 preferences 的 Renderer 实现，不是纯 platform 基建。

验收复用既有 formatter/catalog/locale 测试，补或保留 Main 菜单/对话框与 Renderer 对相同 locale/key/参数的结果一致、偏好保存失败和语言同步检查。源码门禁拦住 Main→Renderer 与 formatter→平台依赖；行为测试证明没有复制或改变格式化语义。

### 启动恢复必须从数据库构造副作用变成显式业务步骤

当前事实：`AppDatabase` 在 v1–v3 升级后、WAL 设置后，将残留 `dispatching` 收据的 `state/outcome` 改为 `unknown` 并更新 `updatedAt`，然后执行必要的 v4/v5 备份与 schema 升级。`AppStorage` 构造成功后，Main 才创建 DraftService/RuntimeService。错误会关闭数据库并向外抛出，Main 显示启动失败并保留原库供后续显式重试。

目标分工：

- platform 仅提供连接、PRAGMA、schema/备份迁移和事务原语，不决定收据业务状态。
- execution/main 拥有 `recoverInterruptedSubmissions` 及恢复 SQL/仓储操作；只更新残留 dispatching，保留其他收据、冻结内容及消费标记，不派发 OMP。
- app/main/wiring 显式调用初始化序列，全部完成后才发布可用服务。没有第二个数据库连接、恢复后台任务或绕过初始化的业务查询入口。

**第一轮保持现有恢复与备份顺序**：打开连接与基础设置 → 按需迁到 v3（已是 v4/v5 则跳过）→ WAL 设置 → execution 恢复 → 按需完成 v4/v5 迁移 → 组装并发布业务服务。将现有 schema 操作暴露为有限的具名初始化步骤，由 app 排序即可，不建通用迁移插件/回调框架。这样旧版本升级备份中的收据状态、失败前已提交的效果保持原顺序；不能简单把恢复挪到全部迁移之后并声称等价。

当前版本正常重开时，所有 schema 步骤都是 no-op，恢复仍在首次相关查询和派发前完成。恢复失败或后续迁移失败时，不发布半初始化的 store/service/runtime，关闭本轮连接，沿既有失败反馈保留数据库；显式重试重新经过序列，不自动重发任何提交。恢复本身按原条件更新，重复执行不会再次改写已经 unknown 的记录；这不代表跨 schema/恢复步骤新增一个总事务。

针对性验收：重开后 dispatching→unknown，其余状态/内容/消费标记不变；同一次初始化恢复先于业务查询/派发；恢复失败不暴露可用服务且连接被释放；旧 schema 的升级备份与迁移失败后重试顺序保持。复用 `submission-storage.test.ts` 的重开场景，并将调用对象改成正式初始化入口，不能留下只依赖构造副作用的测试。import 门禁不能发现 SQL 所表达的业务归属，需在迁移映射及这些行为测试中明确验证。

## 6. 可执行依赖边界

### 6.1 领域依赖

`A → B` 表示 A 可以消费 B 的指定公开面；不代表可以 import B 的任意实现。下表列出起始合同依赖，纯函数或同环境公开能力的实际复用按本节登记，不以 app 注入作为默认替代。

| 模块 | 初始允许依赖的其他模块 |
| --- | --- |
| workspace | 无 |
| preferences | 无 |
| files | workspace/contracts |
| input | workspace/contracts、files/contracts（必要纯选择函数通过声明的 core 入口） |
| execution | workspace/contracts、input/contracts |
| conversation | workspace/contracts |
| changes | workspace/contracts、files/contracts、conversation/contracts |

Renderer 面补充两条已知正常复用：各业务视图可通过 preferences/renderer 的明确公开入口消费 `useI18n`；changes/renderer 可消费 files/renderer 的公开代码/Diff 视图。这些依赖在清单中按环境登记，不开放 preferences 或 files 的内部文件。平台 UI 不反向引用 provider；需要文案时从调用方传入格式化文字。

这个矩阵是本次迁移的起始版本，不是永久分类。模块拆分/合并或增加合法依赖时，依据新能力的状态拥有者、生命周期和消费者更新清单与导航，不需要为不改变产品语义的常规调整另行请示。现有 runtime/conversation 相互引用通过 app 的生命周期组合，以及各自拥有的适配层解除；不把旧图直接写入无限制白名单。

同环境公开能力可以直接 import：依赖已登记、无循环、资源所有权不转移即可。这是正常依赖，不是例外，不逐调用点申请、不套纯转发端口。只有需要替换外部副作用、协调生命周期或反转依赖时才引入窄端口；app 负责跨域用例与创建/释放组合，不为每次普通复用增加组装代码。若新的直接依赖形成循环，先重新审视归属和数据流，再选择归一合同或组合层，不能把所有耦合机械改成注入。

例：阅读投影消费 conversation 自有归一事件；原生帧转换在 conversation/host 的 OMP 适配器完成。execution/host 和 conversation/host 分别接受 app 提供的连接能力，不相互构造对方。不会新建一套重复 OMP 事件总线。

### 6.2 环境与层次

| 来源 | 允许 | 禁止 |
| --- | --- | --- |
| shared | 已登记无环境依赖的基础库；i18n formatter 允许 FormatJS/Intl | modules、app、platform、React、DOM、Node、Electron |
| modules/*/contracts | shared、矩阵允许的其他 contracts、Zod | core、平台/进程实现、供应商类型 |
| modules/*/core | 自己 contracts、shared、已登记纯公共入口 | Node/Electron/React/DOM、main/host/renderer、原生 SDK |
| modules/*/main 或 host | 本模块 core/contracts、对应环境 platform、已登记同环境公开能力/必要端口 | Renderer 实现、另一个进程实现、app |
| modules/*/renderer | 本模块 core/contracts、Renderer platform、已登记同环境公开能力 | Node、Electron、main/host、原生 SDK、数据库 |
| platform | shared、同环境技术设施 | 业务 modules/app；业务专用适配必须退回所属模块 |
| app 各环境 | 同环境公开实现、公开合同、对应 platform | 跨环境实现；业务规则/SQL/原生协议解析堆入入口 |
| app/contracts | shared、modules 的公开合同 | 环境实现或业务执行 |
| runtime（omp 环境） | 官方 SDK 和显式列出的无头控制入口 | Electron、React、应用数据库/窗口生命周期 |

shared 子能力仍有使用边界：Host、runtime、core/contracts 只使用无头消息 DTO 等必要基础，不引入 UI formatter/catalog；Main 和 Renderer 可调用 formatter。把文件放入 shared 不表示每种环境都应该消费它。

app/contracts 仅供 app 的 Main/Host/Preload/Renderer 组合使用。模块客户端使用自己的窄 bridge 接口，由 app 把 DesktopBridge 对应部分传入，避免模块反向依赖 app。

双重检查运行时边与 type-only 边；禁止跨域和文件级循环。测试可读本模块内部，但跨模块测试默认走公开面；只有 `tests/integration/` 可承担跨模块组装。生产代码禁止导入测试/support/validation。测试不成为绕过规则的后门。

### 6.3 结构数据只维护一次，覆盖逐步扩展

起步用 `architecture/modules.json` 记录正在迁移的模块根、公开面、环境与允许依赖，驱动依赖检查。领域解释和生命周期继续链接现有模块文档，不在 JSON 再写业务规格。内部文件按目录继承归属，日常修改/新增内部文件不需改清单。

P0 不要求先登记所有历史文件和生成地图。试点以外旧树沿用现有检查，已迁移模块不得新增对旧实现的依赖；必要过渡边只精确登记，关联清除波次。每波扩大覆盖，P4 达到生产源码全归属，含 runtime 与构建入口。旧树未覆盖部分必须在报告中可见，不能宣称全仓完成。

P1 先用人工模块地图与真实迁移验证路径是否易找、清单是否稳定。只有路径数据确实重复维护并带来失同步时，才从清单生成地图路径区块并加新鲜度检查；否则保留手工说明和轻量链接校验。生成器不作为迁移的前置条件，也不为了完整性生成第二套文档系统。

公开面变化/新跨模块依赖才改清单。没有用途的新目录不创建；未知环境面/未登记模块在启用范围内应失败。环境与业务归属两种分类可以重叠，但业务责任必须唯一。

## 7. 文件规模：审查信号与已知热点

**首轮所有长度检查只提示，不使 `pnpm check` 失败，也不要求为每个长文件建票或写豁免。** 明确越界可以机械拒绝，长文件是否内聚则需要维护证据。先报告新增跨线/明显增长的文件，保留完整报告供检查，不在每次任务重复打印全部历史长文件。

建议初始提示线：生产逻辑 TS/TSX/MJS 300 行、进程入口 150 行、测试 800 行、业务 CSS 500 行。它们只是触发阅读的参考值；不设公开导出行数、函数长度或目录文件数限制。统计 LF 归一后的物理行（含注释/空行，末尾换行不额外计数），fixture 数据、静态语言资源、生成文件单列，不和业务逻辑混排。

已查明的混合职责热点仍安排拆分：Main 入口、RuntimeService、SessionHost、runtime-panel、file-workspace、project-git。拆分完成看责任/状态/消费者是否清楚，不用“全部低于某行数”判定。877 行的 runtime-service 测试可以按场景拆，但若场景共同依赖同一 fixture、拆分只增加重复，则允许保留。

区分三种情况：

| 情况 | 处理 | 是否要求删除期限 |
| --- | --- | --- |
| 临时迁移桥接、明确禁止依赖尚未清理 | 精确规则/路径、原因、关联波次或票；过期/残留检查失败 | 是，迁移债务必须收口 |
| 经确认合理的长期结构关系 | 优先把它作为正常公开依赖登记；确需特殊结构规则时在所属模块记理由、适用条件与验证 | 否；条件变化时复核，不定期续期 |
| 内聚的长测试、协议/schema、长文件 | 检查是否混合职责；有必要时在任务或模块说明记录保留理由 | 否，无需长度豁免清单 |

长期结构决定不能放宽 Renderer→Node、跨进程直接实现引用、unknown 不重发或原子事务等既有约束。临时结构例外禁止 `src/**` 宽泛放行和自动刷新基线；过期或不再使用的记录应失败。长度报告本身没有“必须清零”的目标。

P1 记录提示命中是否带来有用拆分、误报或无意义包装。只有后续反复出现可量化的维护问题，且局部上限能有效拦截时，才在明确范围新增硬规则并附正/负例；不预先承诺最终启用全仓长度硬门槛。不切 `part1/part2`、不压缩行、不删有用注释、不造纯转发层达标。

## 8. 让后续 AI Coding 必须经过的机制

### 8.1 工具职责与命令

保留 Biome、现有 Oxlint 设计检查和 i18n 检查。推荐新增 `dependency-cruiser` 承担成熟的 TS 依赖图分析，薄脚本只做必要清单校验和报告；不把现有正则膨胀成自研 import 解析器。

其官方文档支持循环/路径限制及 TypeScript 编译前依赖；必须开启 type-only 依赖检查，不能接受默认漏掉类型边。[规则](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md)、[TS 依赖说明](https://github.com/sverweij/dependency-cruiser/blob/main/doc/faq.md)。实施首票锁定与当前 TS 7、Node、别名和 Vite `?worker` 导入兼容的版本；本次没有安装或声称已验证兼容。

拟提供：

```text
pnpm check:architecture   # P0：试点公开入口、环境/禁止依赖、循环与必要过渡边
pnpm test:architecture    # P0：已启用规则的正/负例
pnpm check               # P0：保留既有检查，接入上述门禁及规则测试
pnpm report:structure     # P1 起按收益提供：规模提示、覆盖范围、过渡边
pnpm check:docs           # 后续有实际需要才增加：链接/生成区新鲜度
```

依赖扫描必须解析相对路径、别名、re-export、静态动态 import 和 Node 内置包的两种写法；非字面量动态加载在应用自有源码中要求精确登记，不能悄悄跳过。CSS/worker/资源导入按明确分类处理。不要 `exclude` 整个 runtime 或整个测试树消除报错。

已提供 `tsconfig.core.json`（无 DOM/Node）、`tsconfig.renderer.json`（DOM、无 Node ambient）、`tsconfig.main.json`、`tsconfig.host.json`、`tsconfig.preload.json`，并由 `pnpm typecheck` 串联；核心类型能力按现有需要显式提供，不用全开 `@types/node` 解决计时器/crypto 报错。TS 环境隔离不是安全沙箱；import 门禁仍需拦住显式 Node 引用。

现有 token/Icon/i18n 规则迁移路径时必须同步。`@/components/ui`、electron-vite 入口、Vitest include、Biome includes、Monaco worker、SDK 复制/构建路径都纳入迁移清单。稳定设计规则从 `validation/s1` 转为正式检查，历史实验保留引用。

### 8.2 规则本身也要有拒绝测试

P0 的最小反例集合覆盖已启用边界，并有相邻合法正例：

1. core 通过别名、重导出或 type-only 引入 Renderer/Node；Renderer 引入数据库，Host 导入 Main。
2. 试点模块 A 引入 B 私有文件、形成循环或新增未登记的跨模块边；已登记同环境公开函数复用应通过。
3. 生产代码导入测试工具；例外路径超出批准范围或过期；统一 check 实际运行门禁。

随能力迁移增加相应反例：共享 formatter 引入 Renderer/Node；runtime 误引 Electron；迁入目录未归属；构建仍引用迁移前资源。文档生成器仅在采用时补“清单变化而生成区未更新”的失败样本。

规模提示的测试验证报告，不要求超限返回失败；长期正常依赖不因为没有到期时间被拒绝。初始化恢复与 ACK 事务等用业务测试验证，不假装静态依赖图能理解 SQL 或提交顺序。

门禁测试运行真实检查入口并核对退出码和规则 ID，不能只测内部正则。fixture 不参与生产编译；规则和 fixture 纳入显式测试范围。新门禁先写能暴露缺口的测试、再实现；不为未启用的规则提前建设完整测试平台。

### 8.3 AGENTS、skill、任务模板各负其责

| 载体 | 内容 | 避免 |
| --- | --- | --- |
| 根 AGENTS | 项目短地图、当前状态入口、必须遵守的所有权/门禁、按任务读 skill | 继续追加阶段交接全文、重复所有详细标准 |
| `src/modules/AGENTS.md` 与必要模块 AGENTS | 公共入口、环境面、相关领域文档、特殊资源约束 | 每个子目录复制整套根规则 |
| `d-pi-architecture` skill | 选择归属→检查邻接依赖→写入任务→实现→验证→更新导航的操作流程 | 再写一份领域真相或给每次常规移动设用户审批 |
| 现有 headless/typescript/design skills | 指向唯一目录/依赖标准，保留各自专业规则 | 新旧路径并存、相互矛盾或三处复制同一矩阵 |
| 任务模板 | Owner module、运行环境/生命周期、公开面/依赖变化、受影响行为、验证命令、例外 | 为每个按钮另开 ADR 或固定三张票 |
| CI 必需检查 | 执行同一 check，保存失败日志与提交身份 | 只写“请遵守”或存在但不执行的脚本 |

skill 中的放置决策：先判断业务拥有者；再选 contracts/core/环境实现；纯技术设施才进 platform；两个模块都用不等于自动进 shared；只有应用级跨域用例才进 app。新增领域必须给出独立职责和依赖理由，不能只因旧目录不好放就造模块；同环境公开能力的正常复用不要求改为 app 注入。

任务收尾交付结构变化、行为是否改变、实际检查和未覆盖项。模块图/公开面改变才更新结构资料；普通内部函数修改不制造文档仪式。

规范中把一项规则标为硬门禁时，同一交付必须包含规则实现、拒绝样本、统一命令接线；规模提示等观察项只承诺报告，不冒称硬保障。暂不可机械判断的规则标为人工审查项，例如一个函数是否承担过多职责，不伪称 lint 已保障。

### 8.4 本地与 CI 闭环

- P0 即把最小结构检查接入日常交付；本地 hook 和 CI 在试点校准后接入，不阻塞 P1。启用 hook 后，提交前运行快速结构检查与 staged 格式检查；整图依赖分析按完整工作树进行，CI 再对提交树检查。避免检查未暂存修复却误称提交本身合规。
- hook 推荐用简单受版本管理的安装脚本，不自动覆盖已有 hooksPath/hook；hook 是提前反馈，可被跳过，不当成强制保证。
- CI 建立 macOS 必需 job，使用固定 pnpm/依赖锁，运行结构检查、现有 check 与 build。按当前 Electron/macOS 运行环境选择 runner；不以 Linux CI 宣称跨平台支持。
- CI 工作流落盘与远端 required check/禁止绕过是两件事。后续实施若获外部配置授权，再核实保护规则；没有时准确写“本地/CI 检查已提供，合并保护未配置”。
- 新增或放宽 `modules.json`、exceptions、门禁实现、AGENTS 核心条款须在变更说明列明；有维护者时可配 CODEOWNERS 复核这些文件。单人 AI Coding 也不能在业务修复里静默关闭规则。
- 日常不重复跑完整包/性能矩阵；代码波次交付前完成现有完整 check 与受影响构建，开发中先跑相关测试。纯方案/规则文字修改只做文档或受影响规则检查，不把文档提交也变成全套应用验收。

任何仓库规则都不能绝对阻止有权限者改规则或绕过流程。这套机制能让违规可检测、普通交付失败、例外可追踪，而不是承诺 AI 永不犯错。

## 9. 分波迁移计划与验收

推荐 **P0 最小门禁 → P1 一个完整切片 → 校准后继续 P2–P4**。P1 是工程方法的验证点，不是每波都等待用户批准的关卡；只需因重要产品取舍暂停相关部分。下表是原定工作包；本次实施结果见 §12。原方案中的“本轮只提交方案”已被用户后续明确开发指令覆盖。

| 波次 | 交付 | 退出条件 |
| --- | --- | --- |
| P0：最小边界 | 读取现状；配置试点公开入口、环境禁止依赖、循环与必要过渡边；少量正/负例、check 接线；简短 AI 路由 | 已启用规则真实拒绝越界，合法同环境复用通过；旧树检查仍运行；不前置地图生成/全仓例外/长度治理 |
| P1：文件→选区→输入试迁移 | files/input/changes 的实际能力及 Renderer 组合迁移；相关 core/Renderer 环境检查；地图人工更新；以实际任务评估结构成本 | 文件/Git 来源、Unicode/CRLF 选区、引用往返保持；已迁模块无新增旧实现依赖；下表开发成本检查完成，无纯转发层用于迎合规则 |
| P2：骨架、偏好与持久化 | app/workspace/preferences、共享 formatter/provider、数据库基础与业务仓储；execution 恢复入口和初始化顺序本波一并落实；拆 DraftService | sender 校验、语言/主题/密度、关窗保存不变；恢复/备份/失败释放顺序通过；ACK 跨域事务保持；不以行数判通过 |
| P3：执行与阅读解耦 | 拆 RuntimeService/SessionHost；conversation 独立；必要生命周期组装；迁 runtime SDK 资源 | unknown 不重发、ACK/消费原子性、旧代次拒绝、停止/继续、交互超时、后台继续/重连、冷恢复只读通过 |
| P4：收口 | 完成源码归属与环境检查；删除临时桥接；同步当前地图/skills；按实际收益补文档检查和结构报告；接 CI，按授权核实远端保护 | 无未处理禁止依赖/循环/到期迁移例外；长期合理结构不被强制清零；完整 check/build 和受影响包/GUI 证据通过 |

P1 可以迁移一个完整用户路径而暂留未参与该路径的内部文件；过渡映射应明确，迁入能力不得建立平行实现。P2 的恢复拆分虽属于 execution，也必须与 database 拆分同波完成，不能留到 P3 让 platform 暂时继续承担业务恢复。

### P1 开发成本验收

在试迁移的真实工作中记录简短前后对照，不额外开发“验证用新功能”：

| 检查点 | 取样方式 | 合格表现与纠偏 |
| --- | --- | --- |
| 定位能力更直接 | 从地图定位文件选区的合同、规则、视图和测试，并核对一次故障追踪 | 路径能按模块找到，不依赖全仓搜索猜文件名；若需多份文档跳转，合并导航 |
| 普通内部修改不用维护治理数据 | 在此次迁移中挑一个真实内部调整/补测 | 无需改清单/规则/多份地图；否则简化清单粒度 |
| 合法复用成本合理 | input 消费 files 的公开选区能力 | 登记一次依赖即可多处复用，不逐调用点申请，不为复用造接口/工厂 |
| 没有纯转发层 | 检查此次新增 public、适配器、组合代码 | public 显式导出允许；新增函数/类须承担转换、策略或生命周期；只转发则合并 |
| 门禁反馈可用 | 运行合法/非法样本及真实检查，记录耗时/误报 | 错误指出来源、目标和规则；合法代码不需反复豁免，规模提示不阻断；耗时失衡先缩小自有脚本而不削弱边界 |
| 文档同步负担可接受 | 列出本次实际修改的治理文件 | 每类事实只有一个维护位置；有重复再决定是否生成，不为计划中的收益预建工具 |

P1 不满足时先修改规则或结构，完成同一切片的重新核对再扩到核心链路；不得为了守住第一版方案而增加包装或静默放宽安全/数据约束。将结果与调整记录在切片交接即可，不新建长期指标平台。

每波先核对文件迁移映射，然后完成一个可运行的变更集。纯移动与行为重构分开呈现；迁移期间如必须有临时 re-export，只允许明确路径、禁止新消费者，并关联最晚删除波次。禁止同时维护两套实现或长期 `legacy/`。

### 必须保护的行为库存

- **输入/提交**：revision 冲突保留原稿、冻结原文不变、ACK 与消费标记的持久顺序、自由追问不消费草稿、unknown 不自动重发。
- **执行/恢复**：Thread/实例/代次验证；Host 崩溃与 Renderer 重连的差别；停止/继续语义；待答交互默认回答与显式回答的竞争；冷恢复单写限制。
- **文件/Git**：真实路径/句柄授权、symlink/FIFO 拒绝、Git filter/external 程序策略、无 HEAD/冲突/二进制/超限/并发变化、两侧空白和来源准确。
- **GUI/生命周期**：输入引用还原、Monaco 模型和 worker 释放、焦点/选择、主题/密度/locale 一致；视图卸载不杀后台任务。
- **交付/诊断**：资源复制和 hash、包内入口、跨进程 traceId 和失败归属不丢失。

不因搬目录故意制造业务红灯。既有行为先保留测试，缺覆盖补特征测试；新增门禁和实际缺陷按 TDD。不要把旧测试数作为唯一验收，要核对以上路径仍有有效断言。

测试默认与本模块代码就近；跨进程/跨域事务的 integration 测试迁 `tests/integration/`，更新 Vitest include，防止“测试移动后不再运行而全绿”。编辑器/样式文件移动触及视觉和资源时，补必要 GUI 证据；不逐步重演已被自动化证明的全部逻辑。

回退以各波次变更集为单位，保留数据格式和持久文件位置不变；不删除用户 SQLite/OMP 数据，不把代码回退等同数据恢复。原方案阶段仅授权本地文档 commit；本次 review follow-up 的实施提交与推送以用户当前明确指令为准。

## 10. 完成标准与决定关系

本次建议细化 D-02、D-17、D-21/D-22、D-24、D-28–D-36，不改变 OMP 选择、无头顺序、SQLite、UI/图标/i18n 技术方向。`shared` 与模块公开合同重新分工、单应用目录重组属于有成本的架构调整；本轮实施以 §12 的本地提交和验证为准，不代表用户已认可产品体验。

实施完成不能只看树形目录，必须同时满足：

1. 新人或 AI 从模块地图能找到任一当前能力的合同、规则、进程实现与测试；地图不再停在 S2。
2. 三个热点入口/协调器不再承载混杂职责；状态/资源拥有者唯一，跨域事务仍原子。
3. 每个生产源码有归属，跨域只能走公开面；新的越界/循环可以由真实 check 拒绝；规模提示用于审查，合理长文件不会因计数阻断。
4. 没有为目录引入新产品行为、第二套 OMP 执行模型、通用 DI/插件框架或包发布负担。
5. 新功能票有归属和验证依据，AI 入口指向相同规则；已启用门禁的失败可见；普通内部修改不要求重复修改治理文件。
6. 已迁移行为完成必要回归与构建/GUI证据，用户试用状态独立记录；不宣称组织重构证明了产品体验认可。

本方案的稳定部分是所有权、环境隔离和行为库存；模块数量、合法依赖、提示阈值及导航工具可随实际维护收益调整。具体移动、命名和普通实现细节由实施阶段自主落实，不要求用户逐文件审批。

## 11. 本轮复核与交付范围

已依据现有 formatter/provider、数据库初始化、Main 启动、重开收据测试及国际化/持久化合同复核关键落点。确认四项反馈均有依据，并进一步明确 provider 的偏好归属、恢复与旧 schema 备份顺序、P2 恢复拆分不得延期、同环境公开能力可直接复用；MonacoViewer 当前有业务依赖，先随 files 迁移，不整文件强塞 platform。

外部参考沿用第 3 节固定提交，未把其规则作为本仓库指令。交付检查仅覆盖方案一致性、引用与 Git 差异；未运行应用或业务测试，未声称迁移已验证。实施授权、远端保护、产品试用状态均不由文档提交自动改变。

## 12. 实施跟踪（2026-09-29）

本节记录后续开发指令覆盖原方案后的实际结果；第 2 节调查基线、第 9 节原始计划和第 11 节“本轮复核”保留其当时语境，不作为当前工程状态。

### 12.1 分波结果

- **P0**：`fa2f34a chore: add domain architecture gates`。建立 TypeScript 7 scanner、公开入口/环境/循环/生产测试引用/动态加载等最小门禁、真实 CLI 正负例、结构报告、架构 skill 与 AI 路由。
- **P1**：`de48359 feat: migrate files input and changes domains`。完成 `files → input`、`files → changes` 的文件/选区/输入完整路径迁移，保留 Renderer 跨域组合，不创建平行实现。
- **P2**：`2f81069 refactor: make execution recovery explicit`。将 `dispatching → unknown` 恢复从 `AppDatabase` 构造副作用移到 execution 仓储的显式步骤；AppStorage 仍按 `v3 + WAL → execution recovery → v4/v5 → publish` 顺序调用。
- **P2/P3**：`06b5031 refactor: complete domain module migration`。完成 `app`、`workspace`、`preferences`、`conversation`、`execution`、`platform`、`shared` 与 `runtime` 的实际归位、公开入口和应用组合接线；官方 SDK 保持薄宿主，OMP 仍拥有原生执行、队列、工具与历史。
- **P4**：本次收口提交完成机器配置、全量源码归属、环境/依赖门禁、例外清理、结构报告、模块文档、根 `AGENTS.md`、模块 AI 规则和交接同步；当前 HEAD 即为该收口波次。

### 12.2 以实际成本校准后的规则

- P1 实际迁移证明：机器清单只需登记模块根、公开面、环境和跨模块依赖；普通内部移动不改清单，合法复用不按调用点申请例外。
- P2–P4 扩展门禁覆盖 `src` 与 `runtime`：所有生产源码（含 runtime）由 `architecture/modules.json` 登记；环境门禁按 source environment 校验跨模块公开入口，报告以 `checked=all-source-files`、`unowned=0` 为全量覆盖证据，例外清单为空。
- 文件规模只保留报告提示。`RuntimeService`、`SessionHost` 仍是具有紧密执行生命周期状态的协调器；阅读投影由 `conversation/host` 独立持有，Renderer 对话模型由 `AppModel` 持有，app Host 负责组合，不为目录或行数制造 `part`/通用 Manager。
- 恢复、跨域事务和 OMP 所有权没有因迁移改变：`DraftConsumptionWriter` 由 input 持有，execution 在既有 SQLite 事务内调用；`unknown` 不自动重发；官方 SDK 文件未改。

### 12.3 当前验证和交付边界

- 自动化：架构检查及正负例、环境专用 `typecheck`、完整 Vitest、`build`、Biome、覆盖模块 Renderer 的设计 lint/i18n/Tailwind source、设计检查和 source-boundaries 均在 review closeout 验证；具体最新数字以交接文档为准。
- GUI：已对受影响的 Editor 验证页做 macOS 原生窗口检查，覆盖输入、多行渲染、Undo/Redo、主题和密度切换；这只证明 Agent 可观察到的路径，不替代用户试用。
- 构建中的既有 Zod 注释位置和 Renderer chunk 体积 warning 不影响成功结论，未新增为本次门禁例外。
- 本次 review closeout 按用户明确授权 commit 并 push；S5/M2 未启动。用户试用、体验认可及 S3 冷恢复单写结论保持原状态。
