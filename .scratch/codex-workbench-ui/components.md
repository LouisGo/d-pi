# 按功能职责拆分组件

2026-10-06。以下是目标组件地图，不是本轮创建的文件或已经发布的任务。[范围](spec.md)；[布局](layout.md)；[源码依据](research.md)。

## 1. 拆分策略

先确认用户操作、唯一事实拥有者和资源生命周期，再拆视图。一个组件值得独立通常因为至少一个理由：独立交互协议、独立订阅/更新节奏、独立资源创建/释放、可在两个真实场景复用、可单独说明错误和可用操作。不要按 JSX 行数、截图矩形或每个图标机械拆文件。

“业务组件”不是业务事实所有者。Composer 展示提交准入，提交准入仍由 execution/input 的原有协调器核验；ModelPicker 展示目录和选择，实际模型仍由 OMP/configuration 负责；Git 页展示采样，Git/文件系统是真相。

本文的技术组件、工作台组合、业务组件是职责标签，不是新依赖层或三个 packages。多数状态在无头功能/原有模型，React 只负责订阅与视图资源。以下条目能先在同一功能文件中作为局部组件，等真实复用或复杂度出现再独立文件。

标记：**存量**＝当前源码已有相关能力/组件，仍需组合和视觉调整，不表示全体验验收；**新增外壳**＝需要新的交互或布局组合；**后续**＝M3/远期，或尚无相应产品/原生合同。截图中的名字是参照，d-pi 自有文案继续沿用产品术语。

## 2. 技术交互组件

| 单元 | 对应功能 | 自有状态/边界 | 出现位置 |
| --- | --- | --- | --- |
| Button / IconButton | 点击、焦点、加载/禁用呈现、可访问名称 | 沿用现有 Button variant/size；禁用不能替代执行方核验 | 全部工具栏/动作 |
| Tooltip | 补充图标名称、快捷键提示 | 不承载关键错误、权限解释或可点击内容 | 一级栏、分隔条、操作按钮 |
| Menu | 菜单项、分组、子菜单、勾选与键盘移动 | 只发出动作；目标身份由调用者冻结 | 头像、加号、更多操作 |
| ContextMenu | 右键/键盘菜单入口 | 固定打开时的目标 ID/版本，不读取后来变更的选中项替代目标 | Thread、页签、文件、消息 |
| Popover | 锚定控件的复杂说明/选择面 | 可含交互，负责定位与焦点；不当作无焦点 Tooltip | 模型、权限说明、引用预览 |
| Dialog | 专注的一段编辑/预览/选择流程 | 焦点约束、遮罩、Escape、返回触发器、滚动预算 | 重命名、附件详情、短表单 |
| AlertDialog / ConfirmDialog | 明确后果的二次确认 | 传入动作/原因；不能内置“所有删除都如何做”的政策 | 真正不可逆操作；原生 confirm 的承载 |
| NavigationOverlay | 窄工作台临时打开导航 | 可用 positioned Dialog 组合；管理模态与返回；不引入手机手势承诺 | 窄窗口左侧导航 |
| Listbox / Combobox 交互 | 搜索、键盘候选、选中与无结果 | 主动输入焦点规则；不会替业务服务建索引 | 模型/项目搜索，文件补全的适配基础 |
| TabStrip / TabItem | 激活、关闭、重排、溢出入口、键盘移动 | 接收稳定 tab ID；不拥有文件/PTY/browser 生命周期 | 右工作区、底部、内容页内部 |
| ResizeSeparator | 横向/纵向调宽、吸附预览、键盘调节 | 手势瞬态、可访问方向/尺寸；折叠动作由区域拥有者提供 | 左导航、右工作区、底部、文件内树 |
| ScrollViewport | 明确滚动方向和边界 | 优先原生滚动；无需每个区域自建滚动引擎 | 列表、阅读、附件行、页内容 |
| StatusIndicator / Badge | 状态、数量、未读等视觉标记 | 只映射已知状态，unknown 不变 ready | Thread、队列、附件、子 Agent |
| InlineNotice / Toast | 说明、反馈、可重试入口 | 重要错误留在上下文；Toast 不成为唯一可找回证据 | 提交/保存/读取/通知失败 |
| EmptyState / LoadingState / ErrorState | 无数据、加载、失败与下一步 | 通用结构，小文案与动作由功能提供 | 导航、各页签、首次启动 |
| OverlayHost | Portal 作用域、层级和焦点组合约定 | 不是万能弹窗 store；业务分别控制开关 | 菜单→Dialog、附件预览、补全 |

modal 是交互行为，Dialog 是组件，confirm 是业务意图；不为三个词各造一套实现。Select 与带搜索的模型目录也不必共用一个巨型配置组件。

基础交互优先已定 Base UI + 自有 API。TabStrip 的可关闭/可拖拽工作页签行为需要工作台组合，不能假定基础 Tabs 已提供文件关闭和资源处置。长列表只在真实规模需要时接入虚拟化；虚拟化必须保留键盘目标和滚动锚点。

### 2.1 基础、配套与业务组合的写法

2026-10-06 用户澄清：应用只使用 d-pi 自有组件库；外部 UI 能力至少有一层自有封装。实现方式与导入边界以[设计系统合同](../../docs/architecture/design-system.md#自有组件库与实现选择2026-10-06)为单源，本节将其落实到组件地图，不授权安装依赖或开始迁移。

技术组件进一步区分基础交互与配套表达。Button/Menu/Dialog/Popover 等采用自有薄封装；配套组件把多种基础能力组成一个可复用功能，但不拥有 OMP/持久化事实。业务组件接入真实投影及命令，继续留在所属功能。三者都是 d-pi 自有组件，不强制建设三个 packages，也不增加无职责的转发层。

| d-pi 单元 | 重要参考 | 优先写法 / 必要适配 |
| --- | --- | --- |
| Button、Field、Menu、Popover、Dialog、Tooltip | Base UI + shadcn 官方 Base UI；Beautiful UI Button 作视觉对照 | 复用/扩展自有基础封装；统一 variant/size/ref/焦点和样式覆盖范围，不并存两套按钮 |
| ComposerFrame、ComposerToolbar、ContextChip | Beautiful UI PromptBar、输入周边结构 | 用自有基础/配套组件组合；只借鉴结构，编辑器仍是唯一 Tiptap，提交不进入通用框架 |
| ToolCallSummary、ToolResultFrame、StatusRow | Beautiful UI ToolChips/TaskRows；Tool UI 结果卡片 | 数据驱动的配套呈现；消费实际状态，支持展开详情，不按计时器推进执行；合适时改造部分源码 |
| ActionGroup、InteractionFormFrame、ResultReceiptView | Tool UI ActionButtons、ApprovalCard 的数据/回调/结果分工 | 自有按钮/表单组合；局部防重复不替代请求身份和执行方核验，完成回调不冒充已接受 |
| AttachmentPreview、InlineNotice、EmptyState | 两库的部件组合/反馈层次与 Codex 截图 | 先查存量，以显式 props/slots 组合；资源预览由适配负责，文案/重试意图由所属功能提供 |
| AgentInteractionDock、QueueDock、SubagentPanel、Composer | 上述配套表达 + d-pi 原生合同 | 自有业务组合对接既有模型与协调器；不导入 Tool UI runtime 或 Beautiful UI 演示 harness |
| TabStrip、ResizeSeparator、CodeView | 原布局研究、面板候选、Monaco | 专用能力在自有组件/适配内部；页面不直接导入库原语绕过公开接口 |

表中名字是职责候选，不要求现在创建所有文件。PromptBar 等参考组件不与 d-pi 业务组件一对一照搬：提取适用部件，删除无关示例状态，再决定是自主组合还是源码改造。[固定源码比较](../../docs/architecture/design-system-references.md#ai-组件的写法与配套组织2026-10-06)记录了这项判断的依据。

基础、配套与业务组合的视觉角色必须连续：同类控件共用圆角/高度/文字/状态，容器与浮层按有限语义角色区别，不拼接参考库的原样风格。统一角色、light/dark 颜色联动与默认紧凑布局见[设计合同](../../docs/architecture/design-system.md#同一视觉体系与颜色联动2026-10-06)。

每个将要实现的单元应留下简短组件契约：用途/类型、自有公开入口、props/部件/ref、状态与动作来源、参考及采用方式、样式/主题/密度/焦点边界、来源许可、关键验证。借用代码放在自有实现内部；页面、功能视图和配套组件都从对应 d-pi 公开入口使用，不从 vendor 目录或上游 registry 路径使用。

## 3. 工作台与导航组合

| 单元 | 功能与角色 | 状态/依赖 | 覆盖与边界 |
| --- | --- | --- | --- |
| WindowFrame | 固定工作台区域与窗口内容盒，输出几何轨道 | 窗口展示状态、tokens | 新增外壳；不订阅全部消息 |
| WindowHeader | 对齐窗口控制、导航、标题与工作页签 | 同一组有效尺寸；Main 窗口能力适配 | 新增外壳；可点击区域与窗口 drag 分开 |
| NavigationControls | 前进/后退、左侧开关 | 现有 Router 准入 + layout 意图 | 前进后退存量；IME/保存失败仍可阻止导航 |
| ActivityRail | 首页/聊天、后续功能入口和底部个人入口 | 应用路由/可用功能定义 | 新增外壳；无能力时不展示能点开的假页面 |
| PersonalMenu | 个人/连接配置入口、设置/帮助 | 实际 App 账户或配置摘要 | 新增外壳；不复制 Codex Pro/Usage/Logout 等未有语义 |
| PrimarySidebar | 当前应用功能的第二级导航容器 | 左栏偏好/可见性，当前导航类型 | 新增外壳；内容可以是 Thread 或设置分类 |
| ThreadNavigationHeader | 搜索、创建会话、选项目、过滤入口 | threads 的查询/命令，应用导航 | 部分存量；创建先取得真实身份再导航 |
| ProjectPicker / NewThreadSetup | 选择项目/实际目录、配置新会话目标，表达已有worktree关联 | threads/configuration原有命令；明确用户选择 | 存量选择入口重组；成功后显示真实Thread，不由Dialog自行造临时身份 |
| ProjectSection | 按真实项目/工作目录分组，折叠与更多 | 同一 Thread 列表的派生视图 | 新增组合；同名目录保留真实身份，worktree 不混同 |
| RecentSection | 按最近维度呈现 Thread，可分页/显示更多 | 同一实体与提醒投影，时间排序 | 新增组合；不能独立维护另一份 Thread 状态 |
| ThreadNavigationItem | 标题、目录/隔离状态、运行/待答/失败/未读、更多 | 按 Thread ID 细粒度订阅 | 存量入口扩展；不把正文 token 推到全部导航行 |
| NavigationSearch | 统一搜索入口和搜索结果范围说明 | 项目/会话搜索服务，查询取消与过期保护 | 新增；不混用 Composer 的 @ 项目路径索引 |
| AttentionCenterPopover | 汇总待答/失败与未读，点击定位所属Thread，管理提醒入口 | Main attention快照与原有通知导航 | AttentionCenter存量换承载；通知显示不等于已读，过期请求不能直接回答 |
| ConversationSurface | 一个 Thread 的标题、阅读、交互与输入组合 | ThreadModel，原有选择准入 | 由 ThreadWorkbench 演进；业务不归此组件挂载 |
| AuxiliaryWorkspace | 右工作区的页签/内容/关闭/聚焦 | workspace tab metadata，实际内容适配器 | 新增外壳；内容类型边界见第6节 |
| BottomPanel | 底部页签、内容、高度和收起入口 | 底部展示状态；未来 terminal 的受限接口 | 新增外壳；没有终端时不展示伪终端 |
| SettingsSurface / SettingsNavigation | 设置分类路由、搜索、表单与长内容滚动 | preferences/configuration；App 路由 | 改为独立页面是建议，现有折叠设置迁入时保留语义 |

设置业务按实际功能分面：AppearanceSettings（light/dark 与阅读角色；当前不提供密度切换）、InputSettings（发送快捷键）、NotificationSettings（现有提醒政策）、ConfigurationSettings/AuthenticationFlow（原生配置摘要与两条新增认证入口）、ProjectAccessSettings（执行信任与App读取范围）。这些表单复用各自已有合同，不整合为一份可写“全局设置对象”。插件/技能管理、Schedule/Space页面只保留一级导航的扩展位置，等实际需求和能力确定再细拆。

首页空态与活动会话共用 Composer 能力，位置不同：空态围绕主要输入居中，活动会话贴在阅读区域底部。位置变化不创建第二个可独立编辑的草稿或 editor；采用稳定宿主的布局变化，或经适配器保持同一编辑资源。不能只把两个条件渲染分支看作“同一个组件名”就宣称撤销连续。

设置替换第二栏和中央路由内容，不把几十项设置永久堆在主会话头部。重要执行/提交状态留在会话上下文，低频配置从明确入口进入；窗口 shell 和原有业务资源继续存活。

## 4. Composer 的功能拆分

### 组合关系

```text
ComposerSurface                 只做区域组合与高度/展开策略
├── ComposerContextBar          新会话的项目/工作目录/执行目标
├── AttachmentTray             可处理状态、预览、删除、重排
├── ComposerEditor             唯一 Tiptap 接入，正文/选区/撤销/IME
│   └── InlineReferenceView     引用的类型、来源与展示
├── ComposerFeedback           保存/冲突/附件失败/准入原因
└── ComposerToolbar
    ├── AddContextMenu         加号入口
    ├── PermissionSummary      执行信任与 App 读取范围
    ├── ModeControls           经能力核实的模式
    ├── ModelPicker / EffortPicker
    ├── ExpandEditorAction
    └── SubmissionActions      发送/排队/干预；停止独立

MentionSuggestions             锚定编辑器，浮层放到合适作用域
AttachmentPreviewDialog        详情/缩放；未来图片编辑另接派生内容
AgentInteractionDock            待回答区域，不冒充主草稿
QueueDock / RunStatusStrip      可在 Composer 上方组合，不归 editor
```

“Composer 上方的块”不必成为 Composer 私有业务状态；它们可以是 ConversationSurface 的相邻区域，视觉上组合为一个工作单元。

| 单元 | 单独负责的功能 | 真正数据/资源拥有者与输出 | 覆盖和必须处理的状态 |
| --- | --- | --- | --- |
| ComposerSurface | 输入区结构、展开/收起、空态/活动位置 | 应用布局展示状态；消费下面的功能 | 存量重组；不跨位置重置内容 |
| ComposerContextBar | 当前项目、真实工作目录/已有 worktree、执行目标摘要 | threads/configuration 的实际身份；发出选择意图 | 新增组合；不能用项目标题冒充真实目录，不自动创建 worktree |
| ComposerEditor | 输入、粘贴、选区、撤销、IME、键盘优先级与快照接入 | input 的 Tiptap/editor 适配、DraftController | 存量提取；候选确认优先发送；正文没有 React 双写副本 |
| InlineReferenceView | 文件/目录/选区/URL 的标签、图标、完整来源入口 | editor 持引用 ID；input 提供业务 DTO | 存量继续拆；路径/行号/URL 不因展示被改写 |
| MentionSuggestions | @ 查询、候选类型、选择、键盘导航、无结果/刷新 | 项目索引/查询，input 创建引用意图 | 存量提取；`@@virtualList` 路径字符、迟到结果、目录优先及 Enter 行为 |
| AttachmentTray | 按当前草稿顺序显示附件、删除、重排和处理进度 | input/附件服务；editor/草稿持引用关联 | 存量提取；准备中/失败/不兼容/未使用附件不混同 |
| AttachmentPreviewItem | 类型对应的缩略图/文件摘要、移除与打开入口 | 附件 ID/派生版本；释放预览 URL 由视图适配管理 | 存量拆分；PDF/二进制不能假装是图片；失败可定位 |
| AttachmentPreviewDialog | 查看详情、图片缩放、附件顺序相关操作 | 已准备内容/只读预览；操作走 input 意图 | 存量扩展；图片裁剪/旋转/标注后续，预览和送出版本必须一致 |
| AddContextMenu | 集中附件导入、项目引用和真实可用的扩展入口 | 技术 Menu + 各功能命令 | 新增组合；Goal/Plan/技能不是通用文件附件，不能共用虚假提交 DTO |
| PermissionSummary | 展示项目执行信任与 App 文件访问范围，打开解释/设置 | threads/Main 权限与授权合同 | 新增呈现；不照抄单一 Full access，不声称 OMP 工具沙箱 |
| ModelPicker | 模型搜索、供应商分组、选择、管理入口 | configuration 原生能力目录/命令，当前目标 scope | 存量迁入；配置缺失/读取失败/目标失效、不支持附件 |
| EffortPicker | 当前模型支持的档位与原生默认 | configuration 的真实能力，不能固定 GUI 枚举 | 存量组合；模型切换后旧选择无效/未知/未生效 |
| ModeControls | 当前模式摘要与显式切换 | 对应经过核实的原生功能合同 | Goal/Plan 是后续候选；视觉布尔值不等于真实模式切换 |
| ExpandEditorAction | 放大编辑、恢复布局、展示有效发送快捷键 | 输入视图状态和发送偏好 | 存量；展开临时覆盖 Enter 规则，不修改持久偏好，保留撤销/选区 |
| DraftStatus / ComposerFeedback | 保存中/已保存/失败/冲突、内容处理和准入原因 | DraftController、准备结果、提交准入投影 | 存量提取；本地保存不等于发送成功；冲突比较/恢复入口可达 |
| SubmissionActions | 发送/排队/干预、提交中/不可用以及原因呈现 | execution 的提交协调器及收据；点击/键盘共用意图 | 存量 SendButton 演进；ACK不等于accepted，unknown不自动重发，队列上限20 |
| StopAction / ContinueQueueAction | 中断当前执行和明确继续队列 | 原有 runtime/execution 控制合同 | 存量重新组合；停止与普通发送/干预分开，不用 busy 布尔值一键猜动作 |
| VoiceInputAction | 语音转写/录音/取消的入口 | 未来独立输入能力；转写进入草稿规则 | 后续，截图有麦克风不授权本轮接入录音 |

### 不合成一个巨型 Composer 状态机

编辑组合、附件准备、模型准入、草稿保存、提交收据和 Runtime 是不同事实。用已有状态的派生选择器计算“当前允许哪些动作及为何阻断”，动作最终由所属协调器再核验；不把六组状态枚举做笛卡尔积，也不只给按钮一个 `disabled`。

| 实际情况 | 输入与操作的推荐呈现 | 业务合同 |
| --- | --- | --- |
| 空/可编辑/可发送 | 正文可编辑，空稿发送不可用且不伪显示提交中 | input 冻结与 execution 准入 |
| 附件准备中或失败 | 对应项显示原因/重试/移除；草稿保留，不能漏发 | 附件服务与内容预检 |
| 模型变化/能力不明 | 保留材料；当前目标重新预检，原因可查 | 原生能力，不静默丢附件 |
| Runtime 忙 | 普通发送为排队；干预和停止为独立明确动作 | D-11，原生队列单源 |
| 队列满20条 | 按既定政策禁用输入/发送，保留当前内容和恢复条件 | D-11/D-24，不自行变更策略 |
| 发送/清稿关联中 | 防止同版本重复；新输入与旧提交冻结内容分别保留 | ACK与草稿消费事务，原收据合同 |
| 收据 unknown | 定位对应提交记录与显式核对，不把发送按钮变成自动重试 | D-24 |
| 保存冲突/保存结果不明 | 显式比较/只读核对；不盖回新草稿 | DraftController |
| 冷只读 Thread | 内容与草稿可读，执行不可用原因清楚，提供新会话入口 | 缺单写证据不恢复执行，不伪造 ready |

## 5. 阅读、待答、队列和子 Agent

| 单元 | 单独功能 | 事实/操作来源 | 覆盖与边界 |
| --- | --- | --- | --- |
| ConversationViewport | 阅读流、尾部跟随/用户离开尾部、定位与恢复 | conversation 投影；Thread 的阅读坐标 | 存量；流式更新不反复推到用户正在看的段落 |
| ConversationItem | 按消息/工具/交互/子 Agent 类型选择呈现 | 有身份与版本的投影实体 | 存量；按 item 订阅，不每 token 重算全部列表 |
| UserMessage | 用户内容、引用/附件与复制 | 冻结/原生可得内容，注明来源 | 存量；不拿后来编辑的草稿回填旧输入 |
| AssistantMessage / MarkdownBody | 回复、代码、图片、链接与复制 | 原生正文，Markdown 适配 | 存量；长文有界 DOM、保留链接目标，不把全文进诊断 |
| ToolCallCard / ToolResultBody | 工具名称、阶段、参数/结果、错误/截断、展开 | 原生 toolCallId/事件与可得结果 | 存量演进；参数不是成功证据；OMP shell 卡不等于用户终端 |
| ArtifactLink / ReferencePreview | 可点击文件/来源/成果，以及引用摘要浮层 | 实际 resource ID/路径/权限；正文引用 | 新增组合；预览失败与资源缺失不伪造内容 |
| MessageActions | 复制、引用到输入、后续旁路问答/导出等 | 已选内容快照，所属能力 | 复制存量；Side Chat/PNG后续，菜单只显示可用功能 |
| SubmissionRecord | prepared/dispatching/ACK/accepted/unknown/failed 原文与核对 | execution 的持久收据 | 存量；不能把全部收据塞进临时 Toast |
| HistoryBrowser | 原生记录目录/分页/冷阅读、可得范围说明 | conversation/history 的只读查询 | 存量；不是第二套原生历史或自动恢复入口 |
| RunStatusStrip | 当前实际运行、待答/停止/不可用的简要状态与详情入口 | runtime/Host 投影 | 存量 RuntimePanel 演进；把详细诊断留到可展开位置 |
| AgentInteractionDock | 待回答入口、来源、截止/默认/过期信息 | execution 的原生交互身份与状态 | 存量 NativeDialog 重组；与主 Composer 草稿隔离，不任意抢焦点 |
| QuestionForm / ChoiceForm / ConfirmPrompt | 文本、选择、多题和原生确认的具体回答 UI | 受支持的实际交互类型；发出一次回答意图 | 存量选择/输入/confirm；多题形式需按实际协议支持，不假定有通用多选 |
| QueueDock / QueueItem | 数量、冻结输入、编辑/删除/重排、暂停与继续 | execution/OMP 的原生队列镜像/命令 | 存量 QueueControls 拆分；编辑暂缓消费，unknown不能自动重答/重发 |
| SubagentList / SubagentRow | 按 active/done/failed 等真实状态列出原生子 Agent | conversation/execution 的原生身份与可得观察 | 存量观察能力；未观测到不宣称不存在，不变第二套调度器 |
| SubagentDetails / SubagentConfiguration | 任务来源、可得结果/日志范围；当前 Thread 后续创建配置 | 原生观察；configuration 覆盖命令 | 存量组合；模型/档位默认与覆盖不改变 OMP 调度所有权 |

原生 confirm 不能被 App 超时默认同意。现行 select/input/editor 默认作答政策继续如实呈现，超时后的后答按照已有 steer 合同处理。本布局提议不改变这些业务规则。

待答可以占据输入上方 Dock，也可在专注回答模式呈现；主草稿保持。后台 Thread 的请求进入导航标记与已有提醒流程，不能直接抢当前 Composer 焦点。队列编辑用自己的冻结内容适配，不把正在编辑的主草稿当作队列消息正文。

## 6. 辅助工作区内容组件

| 单元 | 功能 | 数据/资源来源 | 覆盖与边界 |
| --- | --- | --- | --- |
| WorkspaceTabHeader | 页签图标/标题/状态、关闭、更多、溢出入口 | 稳定 tab metadata；技术 TabStrip | 新增；右键固定目标，最后一个页签关闭与区域收起区别明确 |
| WorkspaceContentHost | 按内容类型装配视图、焦点/尺寸通知 | 各能力的窄适配；不收全部业务 state | 新增；少量显式类型分支，不预建插件注册平台 |
| FileWorkspace | 文件正文与可选树、当前位置/打开目标/引用动作 | files 的授权读取与 Monaco 适配 | FilePanel 存量分工；先只读，编辑/语言服务后续 |
| FileTree / FileTreeItem | 目录展开、过滤、选中、右键、文件/目录类型 | files 的目录读取/索引，真实资源 ID | 存量列表演进；左侧 Thread 树和此树共用视觉原语，不共用数据模型 |
| FileBreadcrumb / FileActions | 路径定位、外部打开、引用选区、刷新 | 真实路径/许可，files 意图 | 存量扩展；省略路径仍能读完整，外部目标不冒称内置编辑 |
| CodeViewerAdapter | Monaco model、选区、滚动、尺寸/主题更新 | files renderer 已有适配 | 存量；几何变才 layout，不每次主题/流式变化 layout |
| ChangesWorkspace | 当前 Git 状态、比较范围、未跟踪/冲突/二进制等 | changes 的只读采样，真实 scope/source/time | 存量分离；不推断修改作者，不写 Git index |
| ChangeFileList / ChangeSummary | 变化文件筛选与数量、定位 Diff | 实际 Git 或工具证据列表，分别标来源 | 存量组合；Agent Changes/Run Changes不是简单重命名 |
| DiffViewer / DiffSourceHeader | 两侧内容/版本/来源；窄时内联对比；选区引用 | 明确左右输入 + files 的 Monaco Diff 适配 | 存量；缺基线、截断、非文本不能假装完整差异 |
| ToolEvidenceDetails | 原生工具报告的修改结果与范围 | toolCallId/原生内容；可靠前后文本才画 Diff | 存量阅读能力组合；不能用 HEAD冒充工具执行前内容 |
| SubagentWorkspace | 子 Agent 列表与详情/配置的组合位置 | 第5节的组件；原生观察 | 新增页签宿主，业务能力存量；收起不结束子 Agent |
| SubmissionWorkspace / HistoryWorkspace | 需要详情时承载提交原文/历史 | 第5节的读取组件 | 存量入口可迁入；主会话仍能定位相关状态 |
| DiagnosticsWorkspace | trace/问题摘要、受限导出和核对入口 | 现有 diagnostics 窄接口 | 存量诊断；不把异常全文/秘密/所有 stdout 永久复制 |
| BrowserWorkspace / BrowserToolbar | 页面、地址/导航/刷新/加载/崩溃、外部打开 | 未来 Main 浏览资源；共享持久登录 | 后续；外部页面不拿 App preload，源/权限隔离 |
| TerminalWorkspace / TerminalTabs / TerminalViewAdapter | 用户 shell、会话选择、输入、输出、resize/fit、退出 | 未来 Main PTY + Renderer 显示适配 | 后续；收起≠终止，不接管 OMP shell 工具；默认底部 |
| SideChatWorkspace | 原文关联、独立问答、独立模型、显式同步/回送 | 后续独立身份与真实只读能力 | 后续；关闭保留历史，回送进入主草稿/提交，不直接注入主队列 |
| FutureDocumentPreview | 非代码内容预览或独立成果展示 | 未来对应文件/内容适配器 | 后续；只按实际文件类型接入，不因 Codex有Page就搭云文档平台 |

文件树在一个文件页签内部时，其宽度/收起只影响文件阅读，不得关掉外层工作区。Diff 内部对比布局也不会创建两个顶级工作页签。

同一资源重复打开默认定位已有页签；需要两个比较范围的 Diff 以来源和版本区分。跨 Thread 的同路径文件不是同身份；未来编辑的脏标记/关闭确认也不能由文件名判断。

## 7. 各类菜单和浮层如何落地

| 业务入口 | 技术承载 | 操作合同 |
| --- | --- | --- |
| 头像 | Menu；必要摘要可在菜单顶部呈现 | 进入实际设置/帮助/配置，不绑定不存在的账户/计费 |
| 加号 | Menu，搜索型扩展入口可用独立 Popover | 导入、引用、模式分别调用自己的意图 |
| @文件/目录 | 编辑器补全 + 候选列表 + 定位浮层 | 保持 editor 焦点；按候选优先处理 Enter，不误发送 |
| 模型/档位 | 可搜索 Popover/Combobox，简单档位用 Select/Menu | scoped 原生选择、成功/未知/失败状态，不预先乐观当已生效 |
| 引用悬停 | 预览 Popover；纯路径提示可用 Tooltip | 来源与状态可读、失败可重试，不自动抓取 URL 正文 |
| Thread 右键 | ContextMenu | 打开/重命名/实际支持的归档或其它操作；固定 Thread ID |
| 页签右键 | ContextMenu | 关闭/关闭其它/重开/后续移动位置；只对真正支持的动作开放 |
| 文件右键 | ContextMenu | 打开、附加引用、复制路径等；不因入口存在获得文件读取权限 |
| 消息右键/选择工具条 | ContextMenu / 非模态工具条 | 捕获选中文本与版本；复制/引用，旁路/导出按阶段接入 |
| 附件查看 | Dialog | 内容详情/缩放；取消不删除附件，删除走明确草稿关联操作 |
| 保存冲突/内容恢复 | 上下文持久提示 + 必要的比较 Dialog | 原文可找回、版本前置检查，不靠短暂提示处理 |
| 原生提问/确认 | InteractionDock + 专属回答表单；确有必要才Dialog | 实际 request ID/代次/过期，后台不抢当前焦点 |

统一的是视觉/焦点/定位协议，业务不合并成一个全局“modalType + payload”的万能 store。浮层关闭通常只结束视觉交互；真正取消任务、删除内容、结束进程必须是明确业务意图。

Portal 挂在继承主题/密度/语言且不被区域 overflow 裁切的位置。菜单打开 Dialog 时焦点交接一次；关闭回到仍存在的触发器，否则回到对应可见区域入口。窗口收缩/原生页面覆盖时重新核对位置，不能靠不断增大 z-index。

## 8. 所有权与更新边界

| 事实 | 唯一拥有者 | 组件如何使用 |
| --- | --- | --- |
| 用户布局偏好/页签展示信息 | 应用 Renderer 的工作台展示模型；持久策略经 preferences 明确 | WindowFrame/工作区选择性订阅，不发原生业务命令 |
| Thread 选择/项目身份/授权 | Main threads 与 AppModel 原有合同 | 导航发出意图，Router在确认后反映位置 |
| 正文/选区/撤销/IME | 单一 Tiptap editor | ComposerEditor 绑定；Toolbar不复制正文 |
| 持久草稿/附件处理/冻结 | input 的 Main/草稿与内容协调 | 状态呈现与意图；附件 preview 仅视图资源 |
| 提交/队列/待答/执行 | execution 的收据/Host适配；OMP原生执行 | 按 scope/身份投影，命令复核，不由Query重试 |
| 模型能力/配置 | OMP原生能力；configuration适配 | Query读取目录、命令改实际目标，过期保护 |
| 文件/差异内容 | 文件系统/Git；files/changes读取 | 只读Query与Monaco适配，明确源/版本 |
| 未来网页/终端资源 | Main相关功能 | Renderer发尺寸/导航/输入意图，hide不杀业务 |

三个高频方向分别隔离：正文 token 更新只影响对应阅读项；编辑事务不重算全部 shell；指针尺寸更新只影响几何及实际受影响的内容适配。模型目录、菜单开关和主题更新也不重建 editor。

Query 与 Zustand 不双写同一事实；只读查询按现有 key/scope/失效合同，App 本地 IPC沿用 `networkMode: 'always'`。新增 geometry store 可作为 app Renderer 内部展示模型，但不是无头业务核心，也不把 DOM测量带入 domain/core。

## 9. 拟议目录落点

这是职责地图，不是要求立即生成全部目录或 public 入口。

```text
src/app/renderer/
├── shell/
│   ├── layout/                  窗口区域/约束/拖拽接入/偏好投影
│   ├── navigation/              一级栏、上下文侧栏、项目/最近列表
│   └── settings/                低频设置页面的应用组合
├── workbench/
│   ├── composer/                输入组合、编辑绑定、附件/模型/动作
│   ├── workspace/               右工作页签、内容宿主和焦点接入
│   └── interaction/             待答、队列、运行摘要的应用组合
├── reading/                     消息/工具/历史/提交记录的呈现
├── components/ui/               当前app内自有基础组件及明确公开入口
├── components/                  按实际复用形成的配套呈现组件及入口
├── wiring/                      App/Thread资源及跨功能装配
├── routes/ + routing/           薄路由与导航准入
└── styles/                      token入口和适当全局样式

src/modules/input/               草稿、附件、冻结、编辑能力，继续原所有权
src/modules/configuration/       原生模型/认证/配置能力
src/modules/conversation/        投影、历史、阅读能力
src/modules/execution/           收据、准入、队列、交互、宿主
src/modules/files/ + changes/    授权读取、Monaco、Git来源
src/modules/preferences/        App偏好合同与存储
```

目录按最近切片逐步建立；不用本轮迁移现有文件。共享组件不 import AppModel 来获取一切，应用组合通过显式输入接各能力；跨领域只使用既有公开入口。真实新增公开面/模块依赖才修改 `architecture/modules.json`。

上述 components 仍是 app 内落点，不授权模块反向 import app。模块需要共享基础/配套组件时，先按架构合同确定可被依赖的公共 renderer UI 归属，再迁移/开放入口；不能复制第二套组件或把所有功能重新导出到单一入口解决依赖问题。应用只消费自有组件是已确认要求，具体跨模块公共路径仍待实际切片落实。

最近落地应选择一个闭环，例如“打开文件→右页签显示→拖宽/收起→恢复→引用选区→主草稿连续”，同时实现它需要的外壳/技术/业务接入。不要将上述地图排成“所有基础组件、再所有store、再所有hooks、最后GUI”的横向大工程。
