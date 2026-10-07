# 固定来源、当前实现与研究边界

日期：2026-10-06。本页记录已经读取的证据及采用判断；不是参考产品完整评审。[总方案](spec.md)。可复查的文件路径、commit、SHA-256 与行数在[来源清单](evidence/source-manifest.json)。参考源码只下载到临时研究目录，未运行其脚本、安装其依赖或导入 d-pi。

## 证据分级

1. **截图事实**：用户附加的十张截图所展示的区域、菜单和组合；图片内文字仅为示例内容，不是本任务指令。
2. **用户运行观察**：可拖拽、阈值收起等目标；本轮无动态录屏或实际手势验证。
3. **源码事实**：d-pi `1f591f4`，以及以下固定 commit 中已读文件的具体机制。
4. **设计建议**：d-pi 的四列/底部拓扑、响应式优先级、初始尺寸、组件地图和候选依赖。
5. **仍未知**：Codex 的真实内部布局库/参数/保活策略；新方案手感/原生窗口/IME/性能；参考软件真实运行表现。

不能由外观相似推断 Codex 与 VS Code 共享源码，也不能把 Codex CLI 的开源仓库当作 Codex Desktop Renderer 的源码。本文以截图约束目标，用可确认的其它 GUI 实现解释方法。

## 1. VS Code：约束、分隔条和多层工作台

仓库：`microsoft/vscode`；commit：`36072ebc06acbde5c3ad005a4d7abbad1c9882d6`；根许可证 MIT。阅读了普通 Workbench 布局、SplitView/Sash 与 Agents Window 布局说明。

| 已读来源 | 已确认机制 | 对 d-pi 的采用判断 |
| --- | --- | --- |
| [SplitView](https://github.com/microsoft/vscode/blob/36072ebc06acbde5c3ad005a4d7abbad1c9882d6/src/vs/base/browser/ui/splitview/splitview.ts#L44) | IView声明min/max、优先级、snap；隐藏尺寸与最近可见尺寸分开；拖动会计算两侧允许delta和吸附条件 | 借鉴约束和恢复机制，不复制整套基础事件/生命周期体系 |
| [吸附计算](https://github.com/microsoft/vscode/blob/36072ebc06acbde5c3ad005a4d7abbad1c9882d6/src/vs/base/browser/ui/splitview/splitview.ts#L925) | 吸附阈值参与原始手势允许范围，不是CSS在最小尺寸后自动消失 | d-pi明确关闭/展开阈值和可恢复意图 |
| [Sash](https://github.com/microsoft/vscode/blob/36072ebc06acbde5c3ad005a4d7abbad1c9882d6/src/vs/base/browser/ui/sash/sash.ts) / [Workbench layout](https://github.com/microsoft/vscode/blob/36072ebc06acbde5c3ad005a4d7abbad1c9882d6/src/vs/workbench/browser/layout.ts) | 分隔条手势与Workbench区域控制分工；布局不是一个CSS media query集合 | 借鉴区域职责，保留React/应用自己的资源拥有者 |
| [Agents Window LAYOUT](https://github.com/microsoft/vscode/blob/36072ebc06acbde5c3ad005a4d7abbad1c9882d6/src/vs/sessions/LAYOUT.md) | Sidebar、Sessions、Editor、Auxiliary Bar、Panel分别归属，内部再有嵌套Grid；该窗口省略普通Activity Bar | 证明Agent工作台有多层区域；d-pi的一级栏来自用户Codex目标，不照抄VSCode的所有部件 |
| [官方布局说明](https://code.visualstudio.com/docs/configure/custom-layout) | 普通VSCode区分主/次侧栏、编辑区和底部Panel | 名称和交互参照，不引入自由分屏、任意视图搬移的全部范围 |

结论：适合作为约束和分区参考，不适合作为本项目新工作台运行时。只读 Monaco 适配已在 d-pi，加载编辑器不等于加载 VS Code 全部服务。

## 2. DeepSeek Harness：最接近本轮的 Grid 与几何分工

已确认官方仓库：`deepseek-ai/deepseek-harness`；commit：`5badb15009ae1756c3afe0ae0cef1faafc290ccc`；根许可证 MIT。官方 [Desktop README](https://github.com/deepseek-ai/deepseek-harness/blob/5badb15009ae1756c3afe0ae0cef1faafc290ccc/apps/desktop/README.md) 有 Electron Desktop 开发入口；不把社区包装器当官方实现。

| 已读来源 | 源码事实 | 借鉴与限制 |
| --- | --- | --- |
| [columns.ts](https://github.com/deepseek-ai/deepseek-harness/blob/5badb15009ae1756c3afe0ae0cef1faafc290ccc/packages/client/ui-layout/src/client/columns.ts) | 纯函数算sidebar/center/rightbar；CENTER_MIN=400；左264–420；右最小300、比例上限0.7；不足时右轨道退让 | 借鉴预算计算；数字是DeepSeek自己的合同，不是Codex或d-pi的参数 |
| [AppFrame.tsx](https://github.com/deepseek-ai/deepseek-harness/blob/5badb15009ae1756c3afe0ae0cef1faafc290ccc/packages/client/ui-layout/src/client/AppFrame.tsx) | Grid轨道、slot与分隔条组合；测自身frame；pointer capture+rAF；拖动从呈现尺寸起步；窗口连续resize不做轨道过渡 | 可直接解释轻量布局方法；d-pi不引入其Cordis/slot平台 |
| [AppFrame.module.css](https://github.com/deepseek-ai/deepseek-harness/blob/5badb15009ae1756c3afe0ae0cef1faafc290ccc/packages/client/ui-layout/src/client/AppFrame.module.css) | min-width/overflow各区域明确；命中区跨分界；分离开关动画和拖拽；platform窗口区域与portal安全inset | 借鉴样式作用域和边界，不复制渐变、色值或平台专属外观 |
| [stores.ts](https://github.com/deepseek-ai/deepseek-harness/blob/5badb15009ae1756c3afe0ae0cef1faafc290ccc/packages/client/ui-layout/src/client/stores.ts) | 响应式退让不改尺寸偏好；右关闭保留宽度；左手动关闭写0、重开默认宽度 | d-pi建议左右都保留最近展开尺寸；不能把DeepSeek说成已完整符合用户所有目标 |
| [TabLayout.tsx](https://github.com/deepseek-ai/deepseek-harness/blob/5badb15009ae1756c3afe0ae0cef1faafc290ccc/packages/client/ui-dockkit/src/components/TabLayout.tsx) | stable tab宿主、visited/keepMounted、隐藏inert与焦点处理 | 借鉴页签身份和按类型保留，不全部页签永久常驻 |
| [constraints.ts](https://github.com/deepseek-ai/deepseek-harness/blob/5badb15009ae1756c3afe0ae0cef1faafc290ccc/packages/client/ui-dockkit/src/engine/constraints.ts) | dock pane数限制、分割比例、浮动尺寸与dock边缘规则 | 可参考其职责分开；自由dock/floating超出d-pi D-16当前范围 |
| [control-row-layout.ts](https://github.com/deepseek-ai/deepseek-harness/blob/5badb15009ae1756c3afe0ae0cef1faafc290ccc/packages/client/ui-conversation/src/client/skeleton/control-row-layout.ts) | 按控件真实宽度折叠模型文字，观察字体/内容变化 | 借鉴内容预算；不直接照抄同步测量和写属性造成的成本 |

特别限制：所读左sidebar拖拽实现钳制到最小值，并未在这个handle上提供用户所需的“拖过阈值直接关闭”。它是几何分工的证据，不能据此称拖拽关闭已被该实现证明。响应式轨道消失也不自动等于内容被关闭，其rightbar可以覆盖中央区域。

## 3. ZCode：工作台与业务输入分工

已确认官方仓库：`zai-org/ZCode`；commit：`29628c9acdb81b703bbd4080c207a0e7ce5e276e`；根许可证 Apache-2.0。本轮只读参考文件，未使用其后端或账户能力。

| 已读来源 | 源码事实 | 采用判断 |
| --- | --- | --- |
| [WorkspaceShellLayout](https://github.com/zai-org/ZCode/blob/29628c9acdb81b703bbd4080c207a0e7ce5e276e/packages/ui/src/app-shell/WorkspaceShellLayout.tsx) | sidebar/chat/terminal/side pane集中编排；sidebar像素偏好与最大比例0.5；观察主内容宽度决定辅助退让；已有终端资源关闭归属 | 借鉴组合与主内容预算；并不照搬超大shell文件或其阈值 |
| [resizable.tsx](https://github.com/zai-org/ZCode/blob/29628c9acdb81b703bbd4080c207a0e7ce5e276e/packages/ui/src/components/ui/resizable.tsx) / [package.json](https://github.com/zai-org/ZCode/blob/29628c9acdb81b703bbd4080c207a0e7ce5e276e/packages/ui/package.json) | React `react-resizable-panels`封装；库声明`^4.8.0`；条件panel ID、持久化与separator样式有专门处理 | 证明React候选有相近应用采用；不能推出d-pi真实Electron验收已通过 |
| [sidePaneLayout](https://github.com/zai-org/ZCode/blob/29628c9acdb81b703bbd4080c207a0e7ce5e276e/packages/ui/src/app-shell/sidePaneLayout.ts) | 45%初始化；按页签最小需求与新增按钮计算溢出 | 页签不无限挤小；超出时提供列表/搜索入口 |
| [useComposerToolbarFit](https://github.com/zai-org/ZCode/blob/29628c9acdb81b703bbd4080c207a0e7ce5e276e/packages/ui/src/prompt-editor/useComposerToolbarFit.ts) | 按优先级减少工具栏文字；测量与业务状态分开，临时不可见副本避免移动真实按钮 | 借鉴优先级和聚合决策，不先建复杂DOM克隆测量框架 |
| [ConversationComposer](https://github.com/zai-org/ZCode/blob/29628c9acdb81b703bbd4080c207a0e7ce5e276e/packages/ui/src/v4/ConversationComposer.tsx) / [V4ComposerToolbar](https://github.com/zai-org/ZCode/blob/29628c9acdb81b703bbd4080c207a0e7ce5e276e/packages/ui/src/v4/composer/V4ComposerToolbar.tsx) | 顶层组合与模型/模式/上下文相关控件分工；附件/选择引用也有独立组件文件 | 支持按功能拆输入，不按图标各建无头模块；其业务模式不能直接移植到OMP |

本轮没有对ZCode的执行、网络或数据政策作产品安全评价；布局参照不表示采纳这些政策。真正复制源码前仍需逐文件核对许可和第三方声明。

## 4. OpenCode：简洁ResizeHandle与会话作用域

仓库：`anomalyco/opencode`；commit：`3f393d78bfc3f0826b2c7080e57964c235704695`；根许可证 MIT。

- [resize-handle.tsx](https://github.com/anomalyco/opencode/blob/3f393d78bfc3f0826b2c7080e57964c235704695/packages/ui/src/components/resize-handle.tsx)：接收size/min/max/collapseThreshold，原始手势跨阈值后通知收起，再约束展开尺寸；证明拖拽关闭不只是一段CSS。
- [layout.tsx](https://github.com/anomalyco/opencode/blob/3f393d78bfc3f0826b2c7080e57964c235704695/packages/app/src/context/layout.tsx)：sidebar宽度、terminal高度、fileTree、session tabs/view有作用域与持久信息；适合参考“尺寸与会话内容分开”。
- [sidebar-shell.tsx](https://github.com/anomalyco/opencode/blob/3f393d78bfc3f0826b2c7080e57964c235704695/packages/app/src/pages/layout/sidebar-shell.tsx)：窄图标栏与可展开的导航内容；[session-composer-region](https://github.com/anomalyco/opencode/blob/3f393d78bfc3f0826b2c7080e57964c235704695/packages/app/src/pages/session/composer/session-composer-region.tsx) 将会话输入区域组织为功能组合。

已读实现使用SolidJS，ResizeHandle所读片段采用document mouse事件；不直接复制进React/Pointer/键盘合同。仅用于说明职责和最小机制，不据此评价整个应用的可访问性。

## 5. Kimi Code：来源身份校正

2026-10-06实际读取 `MoonshotAI/kimi-code` commit `21406fb4c805cc8c715e6d1f16ad3fb5f25f4fe3`；根许可证 MIT。

- [README](https://github.com/MoonshotAI/kimi-code/blob/21406fb4c805cc8c715e6d1f16ad3fb5f25f4fe3/README.md) 当前描述CLI；所读树中可确认的相关Web UI是`apps/vis/web`与其它检查/扩展入口。
- [AppShell](https://github.com/MoonshotAI/kimi-code/blob/21406fb4c805cc8c715e6d1f16ad3fb5f25f4fe3/apps/vis/web/src/components/layout/AppShell.tsx) 标识为本地会话debug工具；明确使用Flex及`min-h-0`/`min-w-0`以防内容撑开。
- [TabBar](https://github.com/MoonshotAI/kimi-code/blob/21406fb4c805cc8c715e6d1f16ad3fb5f25f4fe3/apps/vis/web/src/components/layout/TabBar.tsx) 可参考读取型会话详情的tab结构，不证明实时Composer或桌面分隔面板行为。

搜索还能返回旧`kimi-cli` Web UI文档和多个第三方`kimi-code-desktop`。当前读取的仓库树与旧Web文档不能直接拼成同一版本。尝试的`v1.26.0`引用未解析，不能写作固定证据。因此本轮不把Kimi列为与Codex等价的当前桌面聊天GUI实装；不在非必要历史追索上继续扩大调查。此限制不表示Kimi从未有Web UI，也不表示第三方桌面项目没有可借鉴内容。

## 6. 面板依赖候选与基础交互

`bvaughn/react-resizable-panels` commit `8c0573b7938b50c868ae837813fda8945e36b596`，源码package.json自报`4.14.2`，根许可证 MIT。本轮没有核验该版本的npm发布或打包行为，不能把它叫作已选择的生产版本。

[固定README](https://github.com/bvaughn/react-resizable-panels/blob/8c0573b7938b50c868ae837813fda8945e36b596/README.md) 已读：Group/Panel/Separator；min/max、像素/百分比等单位、collapsible与collapsedThreshold；layout完成回调与requestedLayout、separator可访问性。当前API与旧版PanelGroup/PanelResizeHandle不同，数字单位也不能按旧教程猜。

| 路线 | 适合性 | 推荐 |
| --- | --- | --- |
| 仅CSS Grid/Flex | 排版充足，不具备拖拽/吸附/偏好完整行为 | 保留为排版层，不能单独完成用户目标 |
| Grid/Flex + 成熟React面板原语 | 与固定左右/底部拓扑匹配，键盘/折叠机制可复用 | 优先；薄接入、固定版本后验证，约束不要双写 |
| 自写Pointer分隔条与纯尺寸规则 | 面板很少时可行，但需自行承担捕获、取消、键盘、吸附和嵌入边界 | 仅候选库在关键行为上不适用且有证据时再选 |
| VSCode Grid/Workbench整套接入 | 服务、生命周期、DOM假设与d-pi不匹配 | 不推荐 |
| 通用dock/floating平台 | 适合自由拆屏/跨窗搬移，需要更大状态和资源合同 | 当前不推荐，超出D-16 |

即使使用面板库，d-pi仍需定义区域优先级、手动关闭与响应式暂藏区别、页签身份/资源合同；不另自研与库重叠的完整拖拽引擎。

基础交互沿用 [Base UI Dialog](https://base-ui.com/react/components/dialog)、[Menu](https://base-ui.com/react/components/menu)、[Popover](https://base-ui.com/react/components/popover)、[Tooltip](https://base-ui.com/react/components/tooltip) 的公开组合方式。菜单/提示/交互浮层的用途不同，Dialog不应用于所有短说明；不新增另一套组件库。

[CSS Container Queries](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Containment/Container_queries) 支持以实际容器而非窗口宽度进行局部适配；宏观区域是否可并排仍由约束负责。[Electron窗口交互](https://www.electronjs.org/docs/latest/tutorial/custom-window-interactions)说明可拖区域和可点击区域的几何边界，供后续顶栏实现核对。官方网页是访问当天资料，没有本轮固定到特定文档发布版本。

## 7. Beautiful UI / Tool UI：组件写法与自有封装

2026-10-06 按用户补充要求，将这两个既有重要参考纳入本轮组件方案。它们用于判断基础/配套组件最合适的写法，不代表直接安装或采用整套库。应用只使用 d-pi 公开组件 API，借用能力至少有一层自有封装；权威要求见[设计系统合同](../../docs/architecture/design-system.md#自有组件库与实现选择2026-10-06)。

只读抓取 Beautiful UI `44a274e598395ab61e7c96c26fda2758780253b7`、Tool UI `49a870286facdbf28160cd647f0d337ebdc9b275` 的代表源码，核对两份根 MIT 许可；未运行上游应用或复制生产代码。[补充来源清单](evidence/component-source-manifest.json)独立于初轮六仓库清单，保留文件哈希及探索中未成功的路径，不将未抓取项作为证据。[固定比较](../../docs/architecture/design-system-references.md#ai-组件的写法与配套组织2026-10-06)列出实际所读文件与适配判断。

观察到的写法支持三种选择：

1. 基础交互沿用 Base UI/shadcn 的自有薄封装。Beautiful UI 自有按钮的 cva/variant 值得对照，但无需复制另一套基础按钮或其色板。
2. 配套组件参考 Beautiful UI 的输入周边和过程表达，以及 Tool UI 的数据、视图、动作、底层适配分工。优先用 d-pi 基础组件组合；源码适用且改造有收益时再选择性取用。
3. 业务组合接入 d-pi 原有事实投影/协调器。上游演示步骤、本地 loading、防重复及确认结果都不能取代 OMP 执行/请求生命周期。

Tool UI 的 `_adapter` 显示基础依赖可以替换，但仅换 import 不等于完成封装：公开 props/事件、图标、样式覆盖、键盘和状态语义仍需归 d-pi。其 ActionButtons 调用方直接改 Button padding/圆角的写法需转为自有共享 variant；Beautiful UI 演示计时器与全局样式也需逐件适配。图标与源码许可按原有合同处理。

具体对应的基础/配套/业务单元见[组件地图](components.md#21-基础配套与业务组合的写法)。跨模块共享 UI 的公共归属与导入门禁要随实际切片落实，本轮不宣称现有组件全部符合这条边界。

## 当前 d-pi 证据

基点 `1f591f4`，调查开始工作区干净。以下路径按当前源码确认，不依赖历史记忆的旧目录快照。

| 当前路径 | 核实的事实 | 设计影响 |
| --- | --- | --- |
| [ApplicationLayout](../../src/app/renderer/shell/application-layout.tsx) | sidebar/workbench两块；偏好、提醒、配置在workbench上方组合 | 新四列外壳落app/shell，不新建领域执行模块 |
| [app.css](../../src/app/renderer/styles/app.css) / [tokens.css](../../src/app/renderer/styles/tokens.css) | 根Flex；sidebar固定token宽度；work-content有整体max-width；主题/密度单源 | 宽度限制下沉到阅读/输入内部，保留统一视觉值 |
| [ThreadWorkbench](../../src/app/renderer/workbench/thread-workbench.tsx) / [reading search](../../src/app/renderer/routing/search.ts) | conversation/files/submissions/history四个阅读视图，保持挂载与阅读坐标 | 新辅助页签迁入能力，不能丢原阅读/输入连续性 |
| [Composer](../../src/app/renderer/workbench/composer.tsx) | Tiptap接入、附件控件、SendButton、准入、展开、保存冲突/失败已有 | 主要任务是拆组合与订阅，避免重建另一Composer |
| [AttachmentControls](../../src/app/renderer/workbench/attachment-controls.tsx) / [ModelControls](../../src/app/renderer/workbench/model-controls.tsx) | 附件与模型入口已有，分别接input/configuration | 改呈现位置不改内容处理/原生模型事实 |
| [FilePanel](../../src/app/renderer/workbench/file-panel.tsx) | 文件/Git查询与CodeView组合；区分file/diff | 分为File/Changes工作页，Monaco继续所属适配 |
| [RuntimePanel](../../src/app/renderer/workbench/runtime-panel.tsx) / [QueueControls](../../src/app/renderer/workbench/queue-controls.tsx) | 原生交互与队列操作已有 | 运行摘要、待答Dock、队列Dock分工，不复制native状态 |
| [ProjectThreads](../../src/app/renderer/shell/project-threads.tsx) | 当前Thread导航与提醒行已有；并非截图式项目和最近两维的完整组合 | 共享同一Thread实体，建立分组/排序呈现 |
| [application.ts](../../src/app/main/lifecycle/application.ts) | 当前窗口最低720×540 | 新布局适配此基线，不能通过提高最小窗宽绕过需求 |
| [navigation合同](../../docs/architecture/navigation.md) | Router投影确认后身份，草稿/IME/unknown准入保持；现行设置新路由未接 | 新shell导航不得绕开选择准入；设置页面是后续实施建议 |
| [模块地图](../../docs/architecture/modules/README.md) | 现有input/files/changes/execution/conversation/configuration等；browser/terminal/side-chat仍是M3设计 | 新页签宿主不能被写成M3业务已实现 |

已查看[存量UI交接](../ui-first-polish/spec.md)及其两张fixture截图：[浅色工作区](../ui-first-polish/evidence/ready-light-compact-zh.png)、[最小只读窗口](../ui-first-polish/evidence/readonly-light-minimum.png)。它们是2026-10-01隔离样本的视觉证据，不是本轮重新启动当前真实供应商GUI；本文只用来理解已有空间分配，不把旧截图当当前全部行为实测。

## 本轮停止条件与后续关键验证

已有资料足以回答布局机制和组件职责，没有为确认库名而反编译Codex Desktop、启动第三方应用或搭原型。之后的关键未知应放进最近实现切片：

- 固定候选版本与d-pi React/Electron兼容性，折叠阈值、条件面板ID、偏好恢复、键盘和取消手势。
- 主输入/阅读与页签切换保留状态，流式更新与拖拽不扩大重渲染；Monaco有效尺寸通知。
- 原生标题栏、全屏、浮层与后续浏览器嵌入的层级/命中边界。
- 当前最小窗口、语言/密度/缩放与真实内容预算；推荐尺寸不能代替测量。

本轮成果是有来源的设计方案；不是代码完成、参考产品运行通过或用户认可。
