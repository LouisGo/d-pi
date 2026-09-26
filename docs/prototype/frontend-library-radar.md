# OMP Desktop 前端选型记录

本页从清理前记录恢复并结合当前需求整理。旧稿来源为 `6fab3ef`，不是本轮重新发明的候选；[逐字原稿](../archive/pre-reset/docs/prototype/frontend-library-radar.md)保留完整出处。外部库的历史版本、许可证与状态需在实际接入时复核，本次没有重跑所有候选 PoC。

2026-09-26：用户确认 [D-32–D-35](../decisions.md)，采用 Base UI、最小 Tiptap、SQLite，ts-pattern 升为应用范式，Zod 明确为 v4 标准版。取代此前相关否定/待定结论；[技术审议](../architecture/technology-selection-review.md)保留理由与其他候选，已选库的接入验收仍待对应功能完成。

## 当前状态与变化

- React + TypeScript + Tailwind CSS、自有组件 API 与设计变量继续沿用；Base UI 为默认基础交互，积极复用 shadcn/ui 源码。React Aria 是复杂交互对照，Radix 仅在具体适配需要时局部评估。
- 保留 Beautiful UI 的重要视觉参考地位，以及 Tool UI 的工具结果表达参考；两者都不替换 OMP 状态所有权。
- 当前修订：Biome 取代 ESLint + Prettier；只有 @shadcn/lint 才引入 Oxlint。Streamdown + Shiki 统一内容渲染，不额外维护业务 react-markdown 入口。
- 继续保留 Virtua / React Virtuoso / TanStack Virtual、Motion、Pacer、birpc、LiveStore 等候选及采用条件；保留候选不等于预装依赖。
- Monaco 已定；Composer 由 D-33 确认最小 Tiptap 与业务扩展。SQLite 用于 App 结构化存储，ts-pattern/Zod v4 按[TypeScript 合同](../architecture/typescript.md)执行。Git Panel、内置浏览器与终端的范围不变，见[增量技术评估](../../.scratch/product-requirements/technical-evaluation.md)。选型确认不等于集成通过。
- 当前没有产品依赖清单；历史实现链接指向固定 Git 提交，不意味着被引用代码仍在工作区。旧 M1 范围只作历史依据，当前产品范围以[需求文档](../../.scratch/product-requirements/spec.md)为准。

2026-09-25 D-28–D-30：组件化不限于以下 UI 候选，功能模块/契约先于正式 GUI。Zustand/Query/hooks 的职责与生命周期见[无头功能合同](../architecture/headless-features.md)；不引入 XState，不因追求无头架构新增全局框架。

## 先读：组件与 Runtime 的边界

1. **项目拥有组件表达，成熟基础能力优先复用。**React + TypeScript + Tailwind CSS 是基础；我们定义设计变量、视觉语言、稳定组件 API 和状态展示规则，优先改造 shadcn/ui 源码并使用 Base UI 交互能力。自有组件层不要求从零重写控件或给每个 primitive 机械加壳；外部 API 不进入无头业务合同。复杂控件可对照 React Aria。
2. **Beautiful UI 是重要的视觉与交互参考。**允许在核对依赖和许可证后选取、改造部分源码或素材，统一纳入自有组件 API 与设计变量。Tool UI 主要用于学习工具结果的结构化表达、校验和操作回执。两者都不拥有 OMP 执行状态。
3. **OMP 拥有 Agent 执行、工具、排队、干预、停止和原生会话。**SessionHost 维护[会话镜像](../../CONTEXT.md)与同步；Renderer 负责展示和提交用户操作。任何 UI 组件都必须以真实 OMP 事件和交互请求为输入，按请求 ID、连接世代及过期状态回传回答，不以动画计时器推断任务进度。详见 [ADR-0001](../adr/0001-omp-session-client.md)。
4. **D-32 确认 Base UI 为默认交互基础。**取代先前“不作为默认底座”的结论。历史 [Button](https://github.com/LouisGo/d-pi/blob/6fab3efd0526d2d716d7939b75202a88f857078a/src/renderer/src/components/ui/button.tsx) 与 [components.json](https://github.com/LouisGo/d-pi/blob/6fab3efd0526d2d716d7939b75202a88f857078a/components.json)仍只证明旧依赖；当前采用依据是 09-26 用户确认，不直接恢复旧主题、旧组件或旧锁文件。引入 UI 源码时继续按 D-31 迁移 Hugeicons 并验收交互。

候选分为“内容与性能”“Agent 交互与视觉”“组件质量与动效”“代码与进程通信”“长期数据层”。前两类与产品体验最接近，也仍需真实样本。采用某项候选时，查阅当天的上游文档与许可、在对应层做小范围验证、提交精确版本及锁文件，并将本页状态更新为“已采用”或记录放弃原因。这些采用条件指导后续评估，不额外扩大任务授权；与当前需求或既有决策发生无法确定的冲突时，必须先向用户确认。

## 内容与性能

### Streamdown · 当前推荐的 Markdown 统一入口

- **入口：**[官方用法](https://streamdown.ai/docs/usage)、[安装与 Tailwind 配置](https://streamdown.ai/docs/getting-started)、[源码](https://github.com/vercel/streamdown)；包为 `streamdown`，组件入口为 `Streamdown`。
- **接入位置与理由：**[历史对话渲染](https://github.com/LouisGo/d-pi/blob/6fab3efd0526d2d716d7939b75202a88f857078a/src/renderer/src/main.tsx)曾在流式阶段显示纯文本，完成后用 `react-markdown`。需要在生成过程中稳定显示 Markdown 时，评估 Streamdown 对未闭合代码围栏、列表、表格和增量更新的处理。
- **采用条件：**用真实 OMP 输出对照当前方案，检查不可信链接、中文、长代码块、CPU／内存、阅读旧消息时的滚动稳定性和终态内容一致性。它解决内容渲染；Host 的积压上限与消息顺序仍由本项目负责。

### Shiki · 沿用的代码高亮方向，独立接入按需

- **入口：**[Shiki 安装与 API](https://shiki.style/guide/install)、[性能建议](https://shiki.style/guide/best-performance)；独立包为 `shiki`。[`@streamdown/code`](https://streamdown.ai/docs/plugins/code) 已用 Shiki 实现 Streamdown 代码块高亮。
- **接入位置与理由：**代码块阅读、复制与主题适配。优先评估与 Streamdown 共用的高亮链路；只有独立代码／Diff 视图确有需要时再直接引入 Shiki。
- **采用条件：**用长代码块和多语言样本检查主题、加载与增量渲染成本；复用高亮器，避免每次文本更新重新初始化。

### Virtua · 长会话虚拟列表候选

- **入口：**[源码和 React `VList` 示例](https://github.com/inokawa/virtua)；包为 `virtua`，React 入口为 `VList`。
- **接入位置与理由：**[对话列表](https://github.com/LouisGo/d-pi/blob/6fab3efd0526d2d716d7939b75202a88f857078a/src/renderer/src/main.tsx)的长历史和动态高度消息。候选排序不是承诺采用；同时对照 [React Virtuoso](https://virtuoso.dev/) 与 [TanStack Virtual](https://tanstack.com/virtual/latest/docs/framework/react/react-virtual)。
- **采用条件：**用真实长会话测展开工具卡片、持续追加、向上加载、回到最新、刷新恢复滚动位置与键盘阅读。先区分列表 DOM 数量、单条超长输出和 Host→Renderer 传输积压三个瓶颈。React Virtuoso 普通列表为 MIT；专用 [Virtuoso Message List](https://virtuoso.dev/message-list/) 是商业许可，比较时不得混作同一方案。

## Agent 交互与视觉

### Tool UI · 结构化工具交互参考

- **入口：**[组件源码与 Gallery](https://github.com/assistant-ui/tool-ui)、[按组件接入说明](https://www.tool-ui.com/docs/quick-start)；例如 `@tool-ui/approval-card` 是 registry 组件名。接入说明以 assistant-ui／AI SDK 为示例，本项目只选取适用的组件源码和模式，不接管 OMP Runtime。
- **接入位置与理由：**[待回答交互与工具卡片](https://github.com/LouisGo/d-pi/blob/6fab3efd0526d2d716d7939b75202a88f857078a/src/renderer/src/main.tsx)可参考其 Zod schema、输入控件与操作回执。选择某个外观或模式后，映射到本项目的 [OMP 协议类型](https://github.com/LouisGo/d-pi/blob/6fab3efd0526d2d716d7939b75202a88f857078a/src/shared/protocol.ts)，再纳入自有组件库。
- **采用条件：**必须覆盖批准、拒绝、取消、超时、重复点击、刷新重连和 OMP 不支持的交互类型。Tool UI 的 schema 不能代替 OMP 的请求 ID、连接世代或协议校验。

### Beautiful UI · 重要视觉与交互参考

- **入口：**[官网 Gallery](https://www.beautifului.dev/)、[公开源码](https://github.com/slev12397/beautiful-ui)、[组件 registry 索引](https://www.beautifului.dev/r/registry.json)、[MIT 许可证](https://www.beautifului.dev/license)。可直接查看 [Tool Chips](https://www.beautifului.dev/r/tool-chips.json)、[Task Rows](https://www.beautifului.dev/r/task-rows.json)、[Prompt Bar](https://www.beautifului.dev/r/prompt-bar.json) 的组件包。这是逐件选择与改造的源码素材，并非需要整包接入的 npm 组件框架。
- **接入位置与理由：**Tool Chips、Task Rows、Prompt Bar、思考状态与卡片层次可启发自有组件的视觉和动效。优先选择能改善 OMP 工作过程可读性的部分，保持项目自己的信息密度、文案、键盘行为与主题。
- **采用条件：**其 [StreamingText](https://github.com/slev12397/beautiful-ui/blob/main/components/primitives/StreamingText.tsx) 和 [ToolChips](https://github.com/slev12397/beautiful-ui/blob/main/components/primitives/ToolChips.tsx)包含按计时器推进的演示行为；接入真实客户端时由 OMP 事件驱动。[ApprovalCard](https://github.com/slev12397/beautiful-ui/blob/main/components/primitives/ApprovalCard.tsx)现有问答形态也不能直接覆盖全部 `rpc-ui` 请求。逐件检查共享 CSS／主题依赖，保留复制源码所需的 MIT 声明；其仓库 README 提醒整仓安装涉及付费 `@central-icons-react`，选用相关组件时将应用自有图标迁为 D-31 的 Icon Layer，不安装该付费图标包。Beautiful UI 的逐词播放不替代 Streamdown 的 Markdown 处理。

## 组件质量与动效

### shadcn/lint · 自有设计系统的守护规则

- **入口：**[官方说明与设置](https://github.com/shadcn-ui/lint)；包为 `@shadcn/lint`，支持多种 lint 接入；本项目已确定 Biome 为主，仅在采用 @shadcn/lint 时搭配 Oxlint，不引入 ESLint，且可用于非 shadcn 的 Tailwind 组件。
- **接入位置与理由：**自有组件的设计变量、变体和可覆盖范围明确后，帮助后续 AI 生成的页面遵守这些约束。
- **采用条件：**先确定组件 API、主题变量与例外规则，再按规则逐条启用，避免把仍在探索的视觉选择误判为违规。它检查代码约束，不能替代可见 GUI 的视觉与可访问性验证。

### Motion · 有意义的状态过渡

- **入口：**[Motion for React](https://motion.dev/docs/react)；包为 `motion`，React 入口为 `motion/react`。
- **接入位置与理由：**待回答交互、工具详情和面板出现／退出的过渡，帮助用户辨认状态变化。
- **采用条件：**先有准确的运行／停止／完成状态；动画不得暗示尚未发生的 OMP 处理。验证键盘焦点与系统“减少动态效果”偏好，简单过渡可直接用 CSS。

## 代码与进程通信

### ts-pattern · 已确认的应用业务分支范式

- **入口：**[源码和 `.exhaustive()` 用法](https://github.com/gvergnaud/ts-pattern)；包为 `ts-pattern`。
- **接入位置与理由：**D-35 要求各应用层的事件、命令、结果、状态与视图映射优先使用判别联合和穷尽匹配，让新增分支暴露遗漏。
- **使用边界：**已经确认，不再先论证 switch 是否足够；封闭联合不用 catch-all 掩盖漏项，简单布尔/空值提前返回保持直接。Zod v4 先校验边界，ts-pattern 消费可信类型；细则见[TypeScript 合同](../architecture/typescript.md)。

### TanStack Pacer · 限速与批处理工具

- **入口：**[选择合适的 Pacer 工具](https://tanstack.com/pacer/latest/docs/guides/which-pacer-utility-should-i-choose)、[安装](https://tanstack.com/pacer/latest/docs/installation)；SessionHost 可使用无 React 依赖的 `@tanstack/pacer`，Renderer 如需 hooks 可用 `@tanstack/react-pacer`。
- **接入位置与理由：**[SessionHost](https://github.com/LouisGo/d-pi/blob/6fab3efd0526d2d716d7939b75202a88f857078a/src/host/index.ts)曾有文本增量合并逻辑；若后续需求使计时、批量刷新与取消逻辑复杂，Pacer 可减少通用控制代码。
- **采用条件：**终态／工具／交互前必须刷新待发文本，保持顺序、积压上限和断连后的重同步；Pacer 只负责调度工具，不定义这些会话语义。

### birpc · 内部双向调用的薄传输候选

- **入口：**[源码及 MessageChannel 示例](https://github.com/antfu-collective/birpc)；包为 `birpc`，入口为 `createBirpc`。
- **接入位置与理由：**仅在 Renderer／preload／SessionHost 间的请求关联代码明显重复时，评估包装内部 MessagePort 的调用层。
- **采用条件：**保留 [命令、事件与快照协议](https://github.com/LouisGo/d-pi/blob/6fab3efd0526d2d716d7939b75202a88f857078a/src/shared/protocol.ts)及 schema、连接世代、序号、积压控制；不让 RPC 方法名替代领域消息。OMP 的 stdio RPC 仍按其协议通信。

## 长期数据层

### LiveStore · App 自有数据的长期候选

- **入口：**[项目源码和架构介绍](https://github.com/livestorejs/livestore)、[React 入门](https://docs.livestore.dev/getting-started/react-web/)、[变更记录](https://docs.livestore.dev/changelog/)；相关包包括 `@livestore/livestore`、`@livestore/react` 及平台 adapter，须按同一版本的官方指南选择。
- **接入位置与理由：**App 结构化存储已按 D-34 采用 SQLite；LiveStore 只在后续确有响应式数据库/跨设备同步需求时再评估，不是采用 SQLite 的前置。
- **采用条件：**先划清 App 元数据和 OMP 原生会话的所有权，定义故障恢复、迁移及跨进程存取方式。旧记录评估时 LiveStore 处于 1.0 前，采用前须重新核实版本与破坏性变更；不为会话镜像建立第二份会话真相；当前产品最终支持多 Thread。

## 备选与未来接口

- **基础交互：**默认使用 D-32 的 Base UI；[Radix Primitives](https://www.radix-ui.com/primitives)保留具体适配/依赖需要时的选项，[React Aria Components](https://react-aria.adobe.com/)用于复杂交互对照。上游默认值不能代替本项目已记录的用户决定。
- **长列表：**[React Virtuoso](https://virtuoso.dev/) 和 [TanStack Virtual](https://tanstack.com/virtual/latest/docs/framework/react/react-virtual)与 Virtua 在同一真实样本上比较；记录专用 Message List 的商业许可。
- **工具自带 UI：**[MCP Apps](https://apps.extensions.modelcontextprotocol.io/api/documents/overview.html)值得保留兼容思路。只有 OMP 实际暴露相应 UI 资源、宿主能力与安全约束明确后才设计接入；普通 OMP 工具卡片不依赖它。
- **Agent UI 框架／协议：**[assistant-ui](https://www.assistant-ui.com/docs/runtimes/custom/external-store) 与 [AG-UI](https://docs.ag-ui.com/)可研究消息转换和事件词汇；目前的 OMP 会话与 SessionHost 同步边界继续作为事实来源。

## 后续任务的接入步骤

1. 从用户可见的问题和当前 [阶段计划](v1-architecture-draft.md)出发，定位本页候选及比较对象；核对 OMP 是否已提供该能力，确定是展示、交互、传输还是 App 自有数据问题。
2. 查看候选的官方文档、源码、当前版本和许可证。Beautiful UI／Tool UI 按组件审查源码、样式和传递依赖；不得将演示数据、计时器或第三方运行时所有权直接复制进正式流程。
3. 用真实 OMP 或保真协议样本验证上述采用条件，并记录相较现有实现的具体收益与代价。性能候选需要可复用的长输出／长历史样本。
4. 采用后写明包名、固定版本、实际入口文件、验证证据和剩余限制，更新本页状态与锁文件。尚未采用的候选保持可查，不预装依赖。

## 图标来源（D-31，2026-09-25）

Hugeicons 免费 Stroke Rounded 已由用户选定，替代 Lucide 候选；使用 `@hugeicons/react` + `@hugeicons/core-free-icons` 和自有语义封装。详见[图标合同与验收](../architecture/icon-system.md)。图标属于视图层，不进入无头功能、IPC 或持久数据；复制外部 UI 源码时同步适配图标，不延续示例的多库依赖。
