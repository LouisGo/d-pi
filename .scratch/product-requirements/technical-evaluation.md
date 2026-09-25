# 技术选型初步评估

日期：2026-09-24；2026-09-25 增量更新。状态：除明确标记用户已选定项外，均为研究建议，未安装依赖、未实现产品、未完成集成验证。现有 Electron / utility SessionHost / 独立 OMP 与配置边界继续遵循 ADR；以下新候选不等于已接受的 ADR。上游文档基于本日读取，版本锁定需在接入前完成。OMP 源码核对固定 v18.3.0。

## 既有选型与证据的衔接

清理前已存在[前端库雷达](../../docs/prototype/frontend-library-radar.md)与[架构选择](../../docs/prototype/v1-architecture-draft.md)，本评估是增量补充，不能替代或清空它们。此前遗漏的 Beautiful UI、Tool UI、Virtua、Motion、Pacer、birpc、LiveStore 等候选及采用条件已恢复。原始实现和验证材料见[归档](../../docs/archive/pre-reset/README.md)。有冲突且无法确定取舍时必须与用户确认，不默默以新稿覆盖旧决定。

## 1. 前端基础与状态

已确认：使用 [Biome](https://biomejs.dev/guides/getting-started/)负责自有代码 lint 与格式化，不采用 ESLint + Prettier。仅在搭配 [@shadcn/lint](https://github.com/shadcn-ui/lint)时引入 Oxlint，用于设计系统规则，不重复开启通用 lint。使用 shadcn/ui 不等于必须采用 @shadcn/lint。TypeScript 类型检查仍独立执行；应用自己的格式化工具不覆盖用户打开项目的格式化配置。

延续旧稿已有的 TypeScript + React + electron-vite 工程方向。应用是本机交互客户端，目前不需要 SSR 或独立 Web 后端。React 用于组合复杂业务视图，electron-vite 管理 Main、preload、Renderer 的开发构建。该选择是针对当前产品的工程判断，不是对其他框架性能的排名。

- [React 文档](https://react.dev/learn/creating-a-react-app)允许特殊约束下使用 Vite 等构建工具；[electron-vite](https://electron-vite.org/guide/)面向 Electron 工程。
- 展示状态沿用旧方向 [Zustand](https://github.com/pmndrs/zustand)：采用按会话选择订阅的展示镜像，局部表单保留局部状态。OMP 仍是会话与执行事实的所有者，不把整个 Runtime 状态复制成第二份权威存储。
- 恢复旧稿 TanStack Query 的查询职责：模型列表、配置摘要、历史目录等请求缓存，与 Zustand 实时镜像分工，不复制第二份可写消息正文；Zod、pnpm、测试与打包工具的既有方向见架构页。
- App 偏好与草稿按现有 ADR 单独持久化；初期优先简单文件方案，是否需要数据库取决于实际查询与恢复要求，不因选用状态库就把全部历史序列化到它的持久化插件。
- 待验证：流式更新下输入响应、跨 Thread 状态隔离、重连恢复、打包后的资源与 worker 路径。Vue/Svelte 未做同条件性能对比，当前推荐基于组件组合与接入路径。

## 2. UI、输入与内容组件

- 恢复既有自有组件层方向：React + Tailwind CSS，自有设计变量与组件 API；[shadcn/ui](https://ui.shadcn.com/docs)提供源码与组织参考，Radix 按需提供底层交互，React Aria 用于复杂交互对照，Base UI 不作为默认底座。Beautiful UI 是重要视觉参考，Tool UI 是工具结果交互参考；入口及采用条件见库雷达。图标由 D-31 确认采用 Hugeicons 免费 Stroke Rounded，经自有 Icon Layer 接入，取代此前优先评估 Lucide 的提议；边界与验收见[图标方案](../../docs/architecture/icon-system.md)。不采用外部 UI 自带的 Agent 状态作为 OMP 协议。
- Composer 改为优先研究直接 ProseMirror 自建业务输入层，仅在具体集成问题触发后对照最小 Tiptap；Lexical 保留历史候选，未定案。详见下节。
- Markdown 推荐改为 [Streamdown](https://github.com/vercel/streamdown)与基于 Shiki 的 code 插件，统一主对话、Side Chat 与静态内容渲染入口，不再维护另一套业务直接使用的 react-markdown 渲染链。Streamdown 官方定位为面向 AI 流式内容的替代实现，支持不完整 Markdown 与代码高亮；内部是否依赖 react-markdown 随版本核实，不人为排除传递依赖。Shiki 负责高亮，不替代 Markdown 解析。仍需验收复制原文、选择稳定性及长消息体验。
- PNG 导出优先评估受控页面排版后使用 Electron [capturePage](https://www.electronjs.org/docs/latest/api/web-contents#contentscapturepagerect-opts)；长内容必须先分页或逐段渲染，不能假设一次截图捕获整个长页面。
- 附件只记录元数据与内容引用，预览和提交管线分开；PDF 被接受不等于模型已读取。具体提取/转换优先核实 OMP 原生能力，尚未选择 PDF 解析依赖。
- 待验证：中文输入法组合态、撤销/重做、粘贴多图、@ 引用编辑、失败后保留输入、草稿恢复，以及真实流式内容。技术选择不得只凭静态示例通过。

### Composer 能力与验收

2026-09-25 用户提出直接 ProseMirror 路线。补充[研究](composer-research.md)建议优先验证直接 ProseMirror 自建 Composer，仅在具体集成问题触发后对照最小 Tiptap，不从零写编辑引擎。Tiptap 基于 ProseMirror 且暴露底层 API，不能断言无法深度定制；Codex App 使用何种包装未找到可靠证据。尚未运行原型或最终选型。

保留验收要求：中文 IME、引用节点编辑、附件混合粘贴、撤销重做、Thread 草稿隔离与恢复、失败重试、长输入和可访问性。附件管线、引用快照时机和 OMP 提交转换是业务职责，不由编辑器框架自动解决。

## 3. 代码查看、编辑与 Diff

2026-09-25 用户已选定 [Monaco](https://github.com/microsoft/monaco-editor)。这一决定取代上一轮 VSCode 服务层/完整工作台并列选型，不再反复重开；先交付只读文件查看、选区引用与 Diff，后续编辑达到原有 B 档目标。

Monaco 是编辑器能力，不包含完整 VSCode 工作台；其官方 README 明确普通 VSCode 扩展不能直接运行。项目负责文件树、工作目录、缓冲与磁盘同步、语言服务接入；这不意味着从零实现语言服务。不能把基础 TS 支持当成真实项目 tsconfig、依赖和跨文件解析均已通过。

待验证：worker 与资源打包、只读加载、大文件、模型释放、Diff 两侧内容和来源标签、路径/行号引用；编辑阶段补充 TS/JS/Node 项目跨文件解析、补全/跳转/引用/诊断、项目格式化配置，以及用户与 Agent 同时改文件的冲突处理。原 B 档目标未降低。

历史替代路线继续可追溯：monaco-vscode-api 复用更多 VSCode 服务；Code-OSS / OpenVSCode 复用更完整工作台并增加集成成本。它们不再是当前实施候选；只有实际必要缺口出现且取舍明确后才重新讨论，不能悄悄恢复完整工作台路线。

## 4. 内置浏览器

建议采用 Electron [WebContentsView](https://www.electronjs.org/docs/latest/tutorial/web-embeds)，所有内置浏览页面使用同一个持久化 [Session](https://www.electronjs.org/docs/latest/api/session)，满足共享登录的产品要求。没有必要另打包一套 Chromium，也不增加按项目的浏览环境。

Electron 当前不建议使用 webview 标签；iframe 又会受目标网站嵌入限制。WebContentsView 的边界是主进程管理的原生视图，需要处理布局、焦点、弹窗和销毁，不是直接放进 DOM 的普通组件。浏览网页不接入应用自身的高权限 preload。

后续 computer use 的具体适配留在该阶段，当前不宣称已打通。待验证：本地预览、登录弹窗、重启后登录保持、下载、键盘焦点、面板遮挡与页面崩溃恢复。网站是否允许内嵌登录仍应实测，不能承诺任意站点完全等同外部 Chrome。

## 5. 终端与 Git

终端首选 [xterm.js](https://xtermjs.org/)提供显示与输入，配合 [node-pty](https://github.com/microsoft/node-pty)提供真实伪终端。node-pty 涉及原生构建与 Electron 兼容性，且官方说明并非线程安全；不能直接把它当成普通 JS 工作随意放到共享 worker 中。后续验证 shell 输入、resize、Ctrl-C、输出流控及随包运行。

2026-09-25 用户确认 Git Panel 自建 OMP 业务 GUI，底层 Git 复用成熟实现，不建设完整通用 Git 客户端。“20% / 80%”是职责划分，不是工时估算；撤回寻找完整可嵌入 Git GUI 的前置任务。

- 复用候选：OMP 已有 Git 数据/操作接口（先核实可接入边界），或 Git 可执行文件加 [simple-git](https://github.com/steveukx/git-js) 等成熟封装。后者是命令封装，不是 GUI；具体选择、Git 来源、凭据与并发处理仍待验证。
- 项目拥有文件/变更列表、Diff、操作反馈，以及 Agent Changes / Run Changes / Review / Revert 的 OMP 业务组织。Diff 使用 Monaco 能力；不自行实现 Git 存储、合并算法或协议。
- 初始设计保留上述四类能力的位置与数据来源扩展，未定义的功能不靠空按钮伪装可用。Run 范围、改动归属及基线必须有原生事件/快照等证据，不能把工作区所有变化归为 Agent。
- Revert 具体对象与语义尚待对应阶段确认，不默认绑定 git revert、restore、reset 或会话回退；Review 也不默认扩成远程 PR 平台。原 B 档操作清单逐项落地，C 档只保留可能性。
- 首阶段仍只实现只读差异所需路径；新方向不意味着现在开工完整 Git Panel。

## 6. OMP 接入与业务组件

保持已确认的 SessionHost 与独立 OMP 进程方向。首选现有结构化 RPC/事件，GUI 适配消息、工具调用、待回答交互和历史，不解析 TUI 屏幕，也不自建 Agent 执行引擎。

[v18.3.0 RPC 类型](https://github.com/can1357/oh-my-pi/blob/v18.3.0/packages/coding-agent/src/modes/rpc/rpc-types.ts)已有 prompt、steer、follow_up、abort、历史分页、branch、模型/档位、宿主工具与子 Agent 观察等接口。现有[能力矩阵](../../docs/validation/runtime-feasibility.md)记录限定范围实测；TUI-only 设置入口和子 Agent 控制等仍有缺口。

业务组件按当前阶段真实协议构建：输入、消息内容、工具执行、待回答交互、会话状态、代码与差异。长输出按需加载；未知事件应有可检查的降级呈现与诊断，不能静默丢失。Side Chat 的只读工具约束、独立模型、持久化及显式上下文同步仍需原生能力接入验证。

## 结论与下一步边界

2026-09-25 最新阶段约束：先完成[基础方案](foundation-plan.md)收敛，本轮不开始实现或交互原型；下文验证是未来工作，不构成开工授权。

四组产品问题已达到可开始选型的清晰度，首版先只读后编辑。六组技术工作已形成初步推荐与风险清单，未完成依赖锁定或集成验收。

首阶段应优先验证三项：实际 OMP 输入/流式输出/交互/恢复闭环；中文输入与附件/引用交互；Monaco 的打包、只读与 Diff。后续能力在对应阶段验证，不要求现在搭建完整浏览器、终端、Git 或语言服务后才交付。版本、依赖许可证与发行条件在实际采用前核对；本轮没有发现必须主动选择 macOS 独占功能的理由，也不代表其他平台已经通过验收。

## 7. 模型与初始化的新边界

首版新增认证按 D-23 限定 OpenAI 账户登录与 DeepSeek API key；已有可用配置不按品牌过滤；GUI 跟随随包兼容 OMP 及当前原生配置提供模型选择，包括原生支持的自定义入口。不硬编码名单，不伪造不可用模型的能力。主对话与 Side Chat 复用同一能力来源，但设置独立。

已有可用配置直接进入，新用户以 GUI 引导完成原生初始化；识别可用配置而非仅探测 CLI 安装。推荐分成“检查原生环境 → 选择供应商/完成对应认证或配置 → 选择模型与默认设置 → 验证并进入项目”等逻辑步骤，但这是待验证的 GUI 草案，不声称 TUI 原样存在这些步骤。首版分别验证 OpenAI 账户 OAuth 与 DeepSeek API key；其他新增认证分支后续逐项适配，已有配置复用不受这两条入口限制。

初始化流程、取消/重试、部分配置补齐和版本不兼容提示仍需原生接口验证；缺口如实记录，不因首版认证范围而屏蔽已有其他模型。不引入通用认证助手或第二套配置真相。
