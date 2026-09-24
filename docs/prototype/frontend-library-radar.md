# OMP Desktop 前端选型记录

更新：2026-09-24。记录已对齐的选择理由、候选入口与采用条件，供后续实现任务查找。完整 V1 边界见 [架构与阶段计划](v1-architecture-draft.md)，阶段 1 的可观察要求见 [规格](../../.scratch/omp-gui-m1/spec.md)。本页列入候选不表示已经安装、已经通过 PoC，或要求立即接入；实际依赖以 [package.json](../../package.json) 和锁文件为准。

## 先读：组件与 Runtime 的边界

1. **组件库由本项目自己写。**React + TypeScript + Tailwind CSS 是基础；我们定义自己的设计变量、视觉语言、组件 API 和状态展示规则。`src/renderer/src/components/ui/` 是自有组件层，不以外部组件库的 API 作为应用契约。shadcn/ui 提供可参考的源码与组织方式；Radix 可按需提供焦点、弹层、键盘等底层交互。复杂控件可对照 React Aria，不因选了某种 primitive 而采用它的视觉样式。
2. **Beautiful UI 是重要的视觉与交互参考。**允许在核对依赖和许可证后选取、改造部分源码或素材，统一纳入自有组件 API 与设计变量。Tool UI 主要用于学习工具结果的结构化表达、校验和操作回执。两者都不拥有 OMP 执行状态。
3. **OMP 拥有 Agent 执行、工具、排队、干预、停止和原生会话。**SessionHost 维护[会话镜像](../../CONTEXT.md)与同步；Renderer 负责展示和提交用户操作。任何 UI 组件都必须以真实 OMP 事件和交互请求为输入，按请求 ID、连接世代及过期状态回传回答，不以动画计时器推断任务进度。详见 [ADR-0001](../adr/0001-omp-session-client.md)。
4. **Base UI 不作为后续默认组件底座。**当前 [Button](../../src/renderer/src/components/ui/button.tsx) 仍引用 `@base-ui/react`，[components.json](../../components.json) 仍是 `base-nova`；这是现有代码状态，不代表新的视觉和组件决策。后续触及该组件时按自有组件策略收敛，无须为本选型文档立即改界面。

候选分为“内容与性能”“Agent 交互与视觉”“组件质量与动效”“代码与进程通信”“长期数据层”。前两类与产品体验最接近，也仍需真实样本。采用某项候选时，查阅当天的上游文档与许可、在对应层做小范围验证、提交精确版本及锁文件，并将本页状态更新为“已采用”或记录放弃原因。选型记录已授权后续任务按条件使用候选；只有改变 OMP 所有权、产品行为或引入商业许可承诺等实质差异需要再次对齐。

## 内容与性能

### Streamdown · 流式 Markdown 候选

- **入口：**[官方用法](https://streamdown.ai/docs/usage)、[安装与 Tailwind 配置](https://streamdown.ai/docs/getting-started)、[源码](https://github.com/vercel/streamdown)；包为 `streamdown`，组件入口为 `Streamdown`。
- **接入位置与理由：**[当前对话渲染](../../src/renderer/src/main.tsx)流式阶段显示纯文本，完成后用 `react-markdown`。需要在生成过程中稳定显示 Markdown 时，评估 Streamdown 对未闭合代码围栏、列表、表格和增量更新的处理。
- **采用条件：**用真实 OMP 输出对照当前方案，检查不可信链接、中文、长代码块、CPU／内存、阅读旧消息时的滚动稳定性和终态内容一致性。它解决内容渲染；Host 的积压上限与消息顺序仍由本项目负责。

### Shiki · 代码高亮候选

- **入口：**[Shiki 安装与 API](https://shiki.style/guide/install)、[性能建议](https://shiki.style/guide/best-performance)；独立包为 `shiki`。[`@streamdown/code`](https://streamdown.ai/docs/plugins/code) 已用 Shiki 实现 Streamdown 代码块高亮。
- **接入位置与理由：**代码块阅读、复制与主题适配。优先评估与 Streamdown 共用的高亮链路；只有独立代码／Diff 视图确有需要时再直接引入 Shiki。
- **采用条件：**用长代码块和多语言样本检查主题、加载与增量渲染成本；复用高亮器，避免每次文本更新重新初始化。

### Virtua · 长会话虚拟列表候选

- **入口：**[源码和 React `VList` 示例](https://github.com/inokawa/virtua)；包为 `virtua`，React 入口为 `VList`。
- **接入位置与理由：**[对话列表](../../src/renderer/src/main.tsx)的长历史和动态高度消息。候选排序不是承诺采用；同时对照 [React Virtuoso](https://virtuoso.dev/) 与 [TanStack Virtual](https://tanstack.com/virtual/latest/docs/framework/react/react-virtual)。
- **采用条件：**用真实长会话测展开工具卡片、持续追加、向上加载、回到最新、刷新恢复滚动位置与键盘阅读。先区分列表 DOM 数量、单条超长输出和 Host→Renderer 传输积压三个瓶颈。React Virtuoso 普通列表为 MIT；专用 [Virtuoso Message List](https://virtuoso.dev/message-list/) 是商业许可，比较时不得混作同一方案。

## Agent 交互与视觉

### Tool UI · 结构化工具交互参考

- **入口：**[组件源码与 Gallery](https://github.com/assistant-ui/tool-ui)、[按组件接入说明](https://www.tool-ui.com/docs/quick-start)；例如 `@tool-ui/approval-card` 是 registry 组件名。接入说明以 assistant-ui／AI SDK 为示例，本项目只选取适用的组件源码和模式，不接管 OMP Runtime。
- **接入位置与理由：**[待回答交互与工具卡片](../../src/renderer/src/main.tsx)可参考其 Zod schema、输入控件与操作回执。选择某个外观或模式后，映射到本项目的 [OMP 协议类型](../../src/shared/protocol.ts)，再纳入自有组件库。
- **采用条件：**必须覆盖批准、拒绝、取消、超时、重复点击、刷新重连和 OMP 不支持的交互类型。Tool UI 的 schema 不能代替 OMP 的请求 ID、连接世代或协议校验。

### Beautiful UI · 重要视觉与交互参考

- **入口：**[官网 Gallery](https://www.beautifului.dev/)、[公开源码](https://github.com/slev12397/beautiful-ui)、[组件 registry 索引](https://www.beautifului.dev/r/registry.json)、[MIT 许可证](https://www.beautifului.dev/license)。可直接查看 [Tool Chips](https://www.beautifului.dev/r/tool-chips.json)、[Task Rows](https://www.beautifului.dev/r/task-rows.json)、[Prompt Bar](https://www.beautifului.dev/r/prompt-bar.json) 的组件包。这是逐件选择与改造的源码素材，并非需要整包接入的 npm 组件框架。
- **接入位置与理由：**Tool Chips、Task Rows、Prompt Bar、思考状态与卡片层次可启发自有组件的视觉和动效。优先选择能改善 OMP 工作过程可读性的部分，保持项目自己的信息密度、文案、键盘行为与主题。
- **采用条件：**其 [StreamingText](https://github.com/slev12397/beautiful-ui/blob/main/components/primitives/StreamingText.tsx) 和 [ToolChips](https://github.com/slev12397/beautiful-ui/blob/main/components/primitives/ToolChips.tsx)包含按计时器推进的演示行为；接入真实客户端时由 OMP 事件驱动。[ApprovalCard](https://github.com/slev12397/beautiful-ui/blob/main/components/primitives/ApprovalCard.tsx)现有问答形态也不能直接覆盖全部 `rpc-ui` 请求。逐件检查共享 CSS／主题依赖，保留复制源码所需的 MIT 声明；其仓库 README 提醒整仓安装涉及付费 `@central-icons-react`，可在选用相关组件时替换图标。Beautiful UI 的逐词播放不替代 Streamdown 的 Markdown 处理。

## 组件质量与动效

### shadcn/lint · 自有设计系统的守护规则

- **入口：**[官方说明与设置](https://github.com/shadcn-ui/lint)；包为 `@shadcn/lint`，支持现有 ESLint，也可配 Oxlint，且能用于非 shadcn 的 Tailwind 组件。
- **接入位置与理由：**自有组件的设计变量、变体和可覆盖范围明确后，帮助后续 AI 生成的页面遵守这些约束。
- **采用条件：**先确定组件 API、主题变量与例外规则，再按规则逐条启用，避免把仍在探索的视觉选择误判为违规。它检查代码约束，不能替代可见 GUI 的视觉与可访问性验证。

### Motion · 有意义的状态过渡

- **入口：**[Motion for React](https://motion.dev/docs/react)；包为 `motion`，React 入口为 `motion/react`。
- **接入位置与理由：**待回答交互、工具详情和面板出现／退出的过渡，帮助用户辨认状态变化。
- **采用条件：**先有准确的运行／停止／完成状态；动画不得暗示尚未发生的 OMP 处理。验证键盘焦点与系统“减少动态效果”偏好，简单过渡可直接用 CSS。

## 代码与进程通信

### ts-pattern · 复杂联合状态的穷尽处理

- **入口：**[源码和 `.exhaustive()` 用法](https://github.com/gvergnaud/ts-pattern)；包为 `ts-pattern`。
- **接入位置与理由：**[共享协议](../../src/shared/protocol.ts)或 Host／Renderer 的状态组合变复杂时，编译期检查漏掉的分支。
- **采用条件：**先比较清楚的 TypeScript `switch` 与 `assertNever` 是否足够；只在模式匹配显著提高可读性时接入。

### TanStack Pacer · 限速与批处理工具

- **入口：**[选择合适的 Pacer 工具](https://tanstack.com/pacer/latest/docs/guides/which-pacer-utility-should-i-choose)、[安装](https://tanstack.com/pacer/latest/docs/installation)；SessionHost 可使用无 React 依赖的 `@tanstack/pacer`，Renderer 如需 hooks 可用 `@tanstack/react-pacer`。
- **接入位置与理由：**[SessionHost](../../src/host/index.ts)已有文本增量合并逻辑；若后续需求使计时、批量刷新与取消逻辑复杂，Pacer 可减少通用控制代码。
- **采用条件：**终态／工具／交互前必须刷新待发文本，保持顺序、积压上限和断连后的重同步；Pacer 只负责调度工具，不定义这些会话语义。

### birpc · 内部双向调用的薄传输候选

- **入口：**[源码及 MessageChannel 示例](https://github.com/antfu-collective/birpc)；包为 `birpc`，入口为 `createBirpc`。
- **接入位置与理由：**仅在 Renderer／preload／SessionHost 间的请求关联代码明显重复时，评估包装内部 MessagePort 的调用层。
- **采用条件：**保留 [命令、事件与快照协议](../../src/shared/protocol.ts)及 schema、连接世代、序号、积压控制；不让 RPC 方法名替代领域消息。OMP 的 stdio RPC 仍按其协议通信。

## 长期数据层

### LiveStore · App 自有数据的长期候选

- **入口：**[项目源码和架构介绍](https://github.com/livestorejs/livestore)、[React 入门](https://docs.livestore.dev/getting-started/react-web/)、[变更记录](https://docs.livestore.dev/changelog/)；相关包包括 `@livestore/livestore`、`@livestore/react` 及平台 adapter，须按同一版本的官方指南选择。
- **接入位置与理由：**将来若 App 自有的多会话元数据、草稿或跨设备同步发展到需要响应式本地数据库，再评估其 SQLite 与事件同步模型。
- **采用条件：**先划清 App 元数据和 OMP 原生会话的所有权，定义故障恢复、迁移及跨进程存取方式。LiveStore 仍在 1.0 前，官方变更记录提示可能有破坏性变更；当前不为单会话镜像建立第二份会话真相。

## 备选与未来接口

- **基础交互：**[Radix Primitives](https://www.radix-ui.com/primitives)用于自有组件的底层行为；[React Aria Components](https://react-aria.adobe.com/)是复杂选择、焦点与键盘体验的对照。shadcn/ui [同时支持 Radix 与 Base UI](https://ui.shadcn.com/docs/changelog/2026-07-base-ui-default)，其默认值不决定本项目组件底座。
- **长列表：**[React Virtuoso](https://virtuoso.dev/) 和 [TanStack Virtual](https://tanstack.com/virtual/latest/docs/framework/react/react-virtual)与 Virtua 在同一真实样本上比较；记录专用 Message List 的商业许可。
- **工具自带 UI：**[MCP Apps](https://apps.extensions.modelcontextprotocol.io/api/documents/overview.html)值得保留兼容思路。只有 OMP 实际暴露相应 UI 资源、宿主能力与安全约束明确后才设计接入；普通 OMP 工具卡片不依赖它。
- **Agent UI 框架／协议：**[assistant-ui](https://www.assistant-ui.com/docs/runtimes/custom/external-store) 与 [AG-UI](https://docs.ag-ui.com/)可研究消息转换和事件词汇；目前的 OMP 会话与 SessionHost 同步边界继续作为事实来源。

## 后续任务的接入步骤

1. 从用户可见的问题和当前 [阶段计划](v1-architecture-draft.md#四v1-分阶段交付计划)出发，定位本页候选及比较对象；核对 OMP 是否已提供该能力，确定是展示、交互、传输还是 App 自有数据问题。
2. 查看候选的官方文档、源码、当前版本和许可证。Beautiful UI／Tool UI 按组件审查源码、样式和传递依赖；不得将演示数据、计时器或第三方运行时所有权直接复制进正式流程。
3. 用真实 OMP 或保真协议样本验证上述采用条件，并记录相较现有实现的具体收益与代价。性能候选需要可复用的长输出／长历史样本。
4. 采用后写明包名、固定版本、实际入口文件、验证证据和剩余限制，更新本页状态与锁文件。尚未采用的候选保持可查，不预装依赖。
