# d-pi 技术选型：现代 TypeScript 生态中的复用与取舍

日期：2026-09-26。性质：经再次核对项目合同与上游资料的技术选型审议稿。本文提出推荐及理由，不新增已确认决定，也不代表依赖已安装或集成已通过。现行约束仍见[决定登记](../decisions.md)、[首版方案](../../.scratch/product-requirements/foundation-plan.md)和[基础契约](foundation-contracts.md)。

d-pi 的基础方向是合理的：Electron 承载桌面应用，OMP 拥有 Agent 执行，React 和 TypeScript 组织交互，Tailwind 控制视觉，Zustand 与 TanStack Query 分担展示状态和异步查询。值得重新审视的部分，集中在如何复用成熟能力：自有组件是否需要大量自写，深度定制是否必须直接使用最底层引擎，减少依赖是否反而导致维护一套自己的基础设施。

本文倾向于保留这套基础，提高成熟库的实际复用程度，并把影响面较大的选择限制在有明确收益的范围内。UI、校验、存储、异步执行和进程通信，都遵循同一原则：**一个依赖应当减少项目需要长期理解和维护的机制。**

## 1. 什么样的技术口味适合这个项目

用户希望采用符合 AI 时代开发方式、TypeScript 友好、生态足够成熟的库。落实到工程选择，可以看四件事。

首先，类型能否贯穿真实操作。参数、返回值、事件分支和错误应当能被编辑器与编译器理解，少依赖字符串约定和类型断言。AI 生成代码之后，类型系统能提供具体反馈，比一套需要反复提醒的隐含约定更有价值。

其次，局部修改是否容易理解。函数、显式数据、可组合组件和清楚的副作用入口，适合持续迭代。装饰器、全局注册、隐式注入或多层配置并非一概不可用，但在本项目中应有足够收益才引入。

再次，生态是否能持续支撑开发。官方文档、类型声明、维护情况、周边集成和真实使用范围，应一起判断。新库可以做范围有限的工具；承担编辑、持久化或整个执行模型的基础，则需要更强的理由。上游声称适合 AI、提供 `llms.txt`，都不能单独证明项目适配性。

最后，库是否帮助产品形成自己的体验。Tailwind、无样式交互基础和可修改的组件源码，很适合桌面工作区的密度与定制需求；视觉自主权不要求我们重新实现焦点管理、编辑器历史和数据库事务。SQLite、ProseMirror 这样的成熟技术，依然可以成为现代应用的好基础。

## 2. 推荐组合与当前状态

以下是推荐顺序，不是需要一次安装的依赖清单。“建议调整”明确表示与当前基线或提议存在差异；相关决定的对应关系列在文末。

| 层面 | 推荐方向 | 本文态度 |
| --- | --- | --- |
| 桌面与工程 | Electron、React、TypeScript、electron-vite、pnpm | 沿用基础，不增加第二套应用后端 |
| 视觉与基础控件 | Tailwind、shadcn/ui 源码、Base UI、自有设计变量 | 建议调整 B-02 的复用程度与默认底座倾向 |
| 客户端状态与查询 | Zustand、TanStack Query | 保留，按数据拥有者分工 |
| 数据校验 | Zod 4 标准版 | 保留，并优先统一真实数据边界 |
| Composer | 最小 Tiptap，加项目业务扩展 | 建议调整 P-02 的验证顺序；直接 ProseMirror 保留为替代路线 |
| 内容与代码 | Streamdown + Shiki；Monaco 文件与 Diff | 沿用；内容阅读与编辑各用适合的工具 |
| 图标与质量工具 | Hugeicons、自有 Icon Layer；Biome、Vitest、RTL、Playwright | 遵守既有决定，随功能使用 |
| 复杂联合类型分支 | ts-pattern | 提高候选优先级，局部使用 |
| 短生命周期命令 | Execa | Git 与辅助命令的优先候选 |
| 日志输出 | Pino | 优先评估结构化输出与异步落盘，尚未锁定整套设施 |
| App 自有结构化数据 | SQLite；需要类型化 schema、查询和迁移时配合 Drizzle | 提前评估事务收益，尚未替换文件方案 |
| 命令面板与区域尺寸 | cmdk、react-resizable-panels | 对应功能进入实现时优先考虑 |
| 内部 RPC | birpc | 只在请求关联代码明显重复时引入 |
| 异步与资源管理 | 原生 Promise / AbortSignal 起步；Effect 为 Host 候选 | 按可替代的自写机制决定，不设为全项目默认 |

## 3. 前端：提高复用程度，保留产品表达

### Tailwind + shadcn/ui + Base UI

当前[库雷达](../prototype/frontend-library-radar.md)将 shadcn/ui 定位为源码参考，允许 Radix 按需使用，同时明确 Base UI 不作为默认底座。本文建议重审这项组合。

shadcn/ui 在 2026 年 7 月将 Base UI 设为新项目默认，并继续支持 Radix；这说明 Base UI 已进入主流组件生态，但不构成它全面优于 Radix 的证明。Base UI 自身无样式、可组合，允许直接控制组件各部分，与 Tailwind 的路线相容。[shadcn 公告](https://ui.shadcn.com/docs/changelog/2026-07-base-ui-default)、[Base UI 介绍](https://base-ui.com/react/overview/about)

d-pi 目前没有需要迁移的正式组件实现。此时采用上游完整组件源码，再调整设计变量、密度和业务组合，比把所有控件都降为“参考后自己写”更有吸引力。建议将 Base UI 作为基础交互的优先候选，并保留 Radix 解决具体组件适配问题的空间。

自有组件层应拥有视觉语言、必要的语义 API 和业务组合。普通按钮、菜单、弹层可以直接基于上游源码修改；Composer、工具结果和待回答交互则体现自己的产品模型。没有项目语义或统一样式需求时，不必再加一层只转发 props 的包装。

源码归项目维护，也意味着上游修复需要主动吸收。接入时保留来源与版本，尽量减少与产品无关的改写。选择一个主要交互底座，避免在同类控件中长期混用多套焦点和弹层行为。外部示例中的图标按 D-31 接入 Hugeicons Icon Layer。

Beautiful UI 与 Tool UI 继续作为视觉和工具结果表达的参考。AI Elements 也可以参考具体组件，但其默认接入文档围绕 Next.js 和 AI SDK；只有能独立复用的呈现部分值得带入本项目，不为组件示例增加第二套 Agent 状态模型。[AI Elements 接入说明](https://elements.ai-sdk.dev/docs/setup)

### Composer：优先验证最小 Tiptap

当前 P-02 优先直接 ProseMirror，再在具体问题出现时对照最小 Tiptap。本文建议交换这一验证顺序。

Tiptap 建立在 ProseMirror 上，提供扩展组织与框架接入，也允许访问底层能力。它的无头和模块化设计支持专用输入器，不要求使用完整富文本文档产品。[Tiptap 介绍](https://tiptap.dev/docs/editor/getting-started/overview)、[ProseMirror 接入](https://tiptap.dev/docs/editor/core-concepts/prosemirror)

d-pi 的独特工作主要是引用节点、附件交互、草稿与提交衔接。可以优先复用 React 集成和扩展机制，把自己的代码集中在这些业务上。最小路线只组合实际需要的文档、文本、换行、历史与业务节点，不因 StarterKit 或商业套件存在就整体采用。

Tiptap 的成本也应计入：需要理解两层 API，扩展默认行为可能与专用输入冲突，React NodeView 的使用方式会影响更新成本。如果实现主要是在绕过这些抽象，直接 ProseMirror 就可能更清楚。当前推荐是维护成本上的判断，尚无本项目实测支持任何一方在性能或输入法行为上胜出。

后续只做一套优先路线，用中文 IME、引用节点边界、混合粘贴、撤销和 Thread 切换这些真实行为判断；不为选库先建两套完整 Composer。编辑器状态和历史由编辑器管理，附件任务与提交记录仍由 App 功能负责。

### 内容阅读继续采用已有方向

Streamdown + Shiki 适合流式 Markdown 和代码阅读。`@streamdown/code` 已使用 Shiki，应优先共享其高亮链路，而不是再建第二个业务 Markdown 入口。Monaco 继续承担文件查看、Diff 和后续编辑，不把每个消息代码块都变成 Monaco 实例。[Streamdown 代码插件](https://streamdown.ai/docs/plugins/code)

长列表仍保留现有 Virtua、React Virtuoso、TanStack Virtual 候选。选择由动态高度、向上加载和阅读锚点这些实际行为决定，不因已经使用 TanStack Query 就顺带采用整个 TanStack 家族。

## 4. 数据与类型：让库减少重复表达

### Zod 负责数据边界

建议保留 Zod 4 标准版。它以 TypeScript 类型系统为设计基础，提供完整的 schema 组合、推导和解析体验；当前桌面应用没有需要优先改用 Mini 的明确体积约束。[Zod 文档](https://zod.dev/packages/zod)

Zod 适合配置、持久记录、跨进程消息和外部 OMP 数据。能够从 schema 推导的类型，不再手写一份平行 interface。内部已经校验并明确归属的数据，直接使用类型，不因经过一个 service 或 hook 就再次解析。

“内部不重复校验”也不能取消可信宿主对 Renderer 请求的校验与授权。前端类型帮助开发，宿主检查负责实际边界；检查请求形状和检查资源访问权是两件事。对高频增量定义窄 schema，避免每次更新重新解析整个会话。

### Zustand 与 Query 分担拥有权

| 数据 | 拥有者与接入方式 |
| --- | --- |
| OMP 执行、队列和原生会话 | OMP；Host 维护客户端会话镜像 |
| Renderer 的实时展示镜像、当前选中项和面板状态 | Zustand，按 Thread / 连接和订阅范围组织 |
| 文件内容、Git 状态、配置摘要、历史目录 | TanStack Query，调用已有功能查询接口 |
| 输入正文、选区和撤销历史 | 编辑器；通过业务 DTO 保存草稿 |
| 提交回执与持久草稿 | 宿主存储，Renderer 只消费结果 |

同一份可变消息正文不在 Query、Zustand 和组件 state 中分别维护。View 卸载只取消视图订阅，不能借 Query 或 hook 的生命周期停止后台任务；这一点延续 D-29。

Query 的查询函数可以直接使用 IPC Promise，无需增加 HTTP 服务。还有一个容易遗漏的桌面适配：默认网络模式是 `online`；纯本地文件、配置和 Git 查询应按需使用 `networkMode: 'always'`，避免 Query 判断离线时连本地读取也暂停。真正依赖远端的查询仍按其网络语义处理。[Query Functions](https://tanstack.com/query/latest/docs/framework/react/guides/query-functions)、[Network Mode](https://tanstack.com/query/latest/docs/framework/react/guides/network-mode)

缓存新鲜度、窗口恢复时刷新和错误重试，都应按数据来源设置。文件变化事件可以驱动对应缓存失效，不必把所有桌面读取都做成轮询。发送输入是业务命令，其未知结果继续遵守 D-24，不能交给通用自动重试。[Query 默认行为](https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults)

### ts-pattern 与错误表达

[ts-pattern](https://github.com/gvergnaud/ts-pattern) 值得提高优先级。OMP 事件、工具结果、提交状态都存在有意义的联合类型；穷尽匹配可以让新增分支时的遗漏变得明显。简单判断继续使用 `if` 或 `switch`，不追求所有代码统一成某种语法。

预期业务失败可以由明确的联合类型表达；本地意外异常保留 Error 与 cause，跨 IPC 转成已有的可序列化错误合同。不为了“类型化错误”先增加一套全局 Result 框架、异常继承树或插件式处理器。若后续采用 Effect，则应重新统一对应模块的错误处理方式。

## 5. 宿主基础：优先购买通用能力

### SQLite 与 Drizzle 分别判断

当前 D-24 的工程方案以 Main 集中写文件为起点，已经要求复核跨文件原子更新。这个要求本身合理；值得调整的是评估 SQLite 的时机。

少量偏好设置可以继续使用文件。但草稿 revision、提交回执和内容引用如果需要一起更新，SQLite 的事务就是直接收益。应在设计持久化操作时比较它与文件实现的代码量和恢复流程，而不是先写出复杂的文件协调逻辑，再因为维护困难迁移。

Drizzle 是这一方向下的优先候选：用 TypeScript 定义 schema、组织查询和迁移，并通过 SQLite 驱动实际访问数据库。**选择 SQLite 不自动等于必须采用 ORM。** 如果只是少量稳定 SQL，驱动与清楚的类型也可能足够；当表结构和查询持续增长，Drizzle 的价值会更明显。[Drizzle SQLite 接入](https://orm.drizzle.team/docs/sqlite/get-started-sqlite)、[事务 API](https://orm.drizzle.team/docs/transactions)

建议边界是 App 结构化元数据进入数据库，附件原件仍放文件，OMP 原生记录仍由 OMP 管理。数据库由既定宿主集中拥有；同步驱动不应让长查询阻塞 Main 的窗口与生命周期处理。驱动选择要和实际 Electron 内置 Node、打包产物一起确定，不能把开发机 Node 的能力直接当成 Electron 能力。本次查阅的 Drizzle SQLite 指南含 `@rc` 安装示例，本文不据此推荐预发布版本。

SQLite 只能处理数据库事务。附件文件落盘、数据库更新和 OMP 接收仍有不同的成功时点，提交结果未知的行为继续保留。当前没有明确的跨设备同步需求，因此 LiveStore 不进入近期优先项，也不为采用本地数据库增加第二份 Agent 执行历史。

### Execa 用在能直接获益的命令调用

[Execa](https://github.com/sindresorhus/execa) 适合 Git、环境探测和短生命周期辅助命令，能够复用结果、错误、流和取消处理，减少重复的 `child_process` 胶水。它的 [TypeScript API](https://github.com/sindresorhus/execa/blob/main/docs/typescript.md) 也是选择理由。

OMP 是长期运行的 stdio RPC 进程，直接 `spawn` 仍可能最清楚。不要仅为了统一风格迁移；如果使用 Execa，应选择流式接口并明确缓冲策略。操作系统进程取消也不能代替 OMP 的业务停止协议。

调用 Git 时传递参数数组，明确 cwd 和环境；Finder 启动的环境差异仍是 App 的责任。进程树终止行为依赖具体配置和平台，不能假定库默认就结束所有后代。[Execa 终止说明](https://github.com/sindresorhus/execa/blob/main/docs/termination.md)

### Pino 是日志基础候选，不能代替诊断设计

Pino 的结构化输出与带上下文的 logger 适合 D-21 / D-22，但“采用 Pino”不能直接推出已经满足 Electron 的集中落盘、轮转、有界队列和退出收尾。再次审查后，本文把它定位为优先候选，而不是已确定的完整设施。[Pino](https://github.com/pinojs/pino)

优先考察 Main 管理的异步 destination，复用 Pino 的缓冲写入能力；只有格式变换或实测成本需要时再使用 worker transport。worker 与 transport 带来额外打包文件，必须计入 Electron 交付成本。[异步日志](https://github.com/pinojs/pino/blob/main/docs/asynchronous.md)、[打包说明](https://github.com/pinojs/pino/blob/main/docs/bundling.md)

[electron-log](https://github.com/megahertz/electron-log) 提供现成的 Electron 进程接入和文件输出，是有价值的桌面对照。如果为了接入 Pino 需要维护大量桌面胶水，应比较两者满足现有合同的总成本；不按 Node 服务端的习惯直接定胜负，也不在同一路径叠加两套日志后端。

跨进程 traceId、Thread 身份和错误处理归属属于 App 合同。库帮助记录这些信息，不会自动理解它们；Renderer 继续通过受限接口上报，Main 管理设施生命周期。

### birpc 只替换重复的调用机制

[birpc](https://github.com/antfu-collective/birpc) 支持消息通道上的双向类型化调用，适合减少请求 ID、pending Promise 和响应回传的重复实现。它比本节其他基础库更专门，因此保留为有明确触发条件的候选。

如果现有 MessagePort 调用层很小，就直接保留。引入 birpc 也只影响 App 内部调用，不改变 OMP stdio 协议，不替代边界校验、连接代次、事件顺序与重同步。一次 Promise 完成不能自动代表 OMP 已接受或完成业务操作。

## 6. Effect：按替代价值决定使用范围

Effect 将结果、预期错误和运行依赖纳入类型，并提供结构化并发、资源管理、流与观测能力。它带来的是一套执行模型，影响明显大于普通工具库。[Effect 官方介绍](https://effect.website/docs/v4/onboarding)

SessionHost 最可能从中获益：长期 OMP 连接、并发子任务、超时、取消传播和资源清理，都可能出现重复的协调逻辑。如果代码已经散布大量 AbortController、清理栈、重试循环和任务登记，Effect 有机会用成熟机制替换这些自写设施。

当前仍以普通 `async/await`、`AbortSignal`、明确作用域与少量协调函数起步。OMP 已承担 Agent 循环、工具与大量执行语义，App 不需要再复制一套。采用 Effect 的具体信号，是一个边界清楚的 Host 功能能够因此删除多类重复机制，而不只是代码看起来更函数式。

若进入该阶段，应让一个功能内部使用连贯的 Effect 执行与资源模型，在模块边界转换为普通数据或 Promise；避免每一步都在两种模型之间往返。边界转换仍需保留明确的失败结果和取消入口，不能把内部类型化错误全部压成字符串。现有外部 Zod 合同可以保留，内部也不必把同一结构再定义成第二份 schema。错误、日志、调度等能力有重叠时，应减少重复工具，而不是把整个生态叠加上去。

Effect 的学习成本真实存在，但不能因此先自研一套不完整的替代品。同样，它不接管 OMP 执行所有权，不改变未知提交禁止自动重发的合同，也不要求 Renderer 放弃 Zustand 与 Query。

## 7. 把选择落到近期功能

两个额外组件与已知产品方向直接对应：[cmdk](https://github.com/dip/cmdk) 可以支撑命令面板、项目与 Thread 搜索入口；[react-resizable-panels](https://github.com/bvaughn/react-resizable-panels) 可以处理现有侧栏和底部区域的尺寸、折叠。后者并不引入自由分屏需求。两者在对应功能进入实现时接入即可，不作为首个功能的前置工程。

近期最有价值的工作顺序是：沿用 TypeScript、Tailwind、Zod、Zustand、Query 的基础；在首个 GUI 切片中提高基础控件的源码复用；为 Composer 重新选择优先验证路线；在持久化设计中直接比较 SQLite 的收益；随 Git、诊断和事件处理功能引入能删除重复代码的工具。

每个新增依赖都应能说明：它替代哪段工作，在哪个进程使用，会把什么成本带进构建与维护。小范围工具按实际功能决定，影响组件底座、持久化或整个执行模型的选择再记录取舍。无需先建立一个容纳所有库的通用平台。

## 8. 与现有决定的对应关系

本文的文档交付不自动变更以下状态；接受具体调整后，再同步对应的基线或合同，保留旧理由与取代关系。

| 决定 | 当前有效内容 | 本文建议及影响 |
| --- | --- | --- |
| B-01 | React / TS / Tailwind / Zustand / Query / Zod 等工程基线 | 保留；补充校验、状态归属与本地查询的使用建议 |
| B-02 | shadcn 源码参考、Radix 按需，Base UI 非默认 | 建议提高源码复用程度并优先评估 Base UI；若采纳，需要更新库雷达和架构基线 |
| P-02 | 提议优先直接 ProseMirror，最小 Tiptap 有条件对照 | 建议优先最小 Tiptap；若采纳，需要同步首版方案和 Composer 研究，不声称已有性能胜者 |
| D-24 | 提交、冻结内容与恢复合同；文件方案为工程起点 | 提前比较 SQLite；若切换，只调整 App 持久化实现及恢复顺序，不改变接受证据与 unknown 语义 |
| D-21 / D-22 | 轻量结构化诊断、跨进程关联、错误归属 | Pino 为优先候选，electron-log 为桌面对照；不新增观测平台或默认远程服务 |
| D-28 / D-29 / D-30 | 无头功能、独立业务生命周期、不引入 XState | 保留；Effect 仅为有收益时的 Host 候选，不重建 Agent Runtime |
| D-02 / D-03、D-07、D-16 / D-31、D-17、B-03 | 进程与配置归属、Monaco、布局与图标、Biome、内容渲染方向 | 保留，不因推荐其他库而重开已确认范围 |

审查依据为当前仓库文档与文中上游一手资料，资料核对日期为 2026-09-26。本次没有安装候选依赖、编写产品原型或运行集成基准。与上轮讨论相比，明确收紧了 Pino 的承诺、拆开了 SQLite 与 Drizzle 的选择，并补充了 Query 在本地离线场景中的配置要求。
