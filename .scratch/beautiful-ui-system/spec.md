# Beautiful UI 基础视觉体系升级

日期：2026-10-07。基点：7906f2553746801fddc892290b38b4269a69bd6e。

## 推进与交接

用户已确认跟随 Beautiful UI，授权完成基础组件视觉/布局/交互升级、补齐实际缺少的控件及必要实机测试。采用项目级 impeccable 的 Operate 指导；视觉方向已由用户固定，不再进行方案竞赛。工作分支 codex/beautiful-ui-system，隔离 worktree。主 Agent 串行实现，收尾独立评审。

D-31/D-32 延续 Base UI、自有公开 API、Hugeicons、light/dark 和唯一紧凑布局。2026-10-07 新确认：Beautiful UI 为直接视觉与动效对照，常规主操作改用中性深浅对比，蓝色保留给强调动作，取代此前默认蓝色按钮配方。共享 token 为唯一权威源，文档只引用来源。

范围：表面/边界/阴影/文字/尺寸/圆角/动效；Button、输入/表单、选择、导航/浮层及配置组合；新增并接入真实使用的 Checkbox、TextArea、Slider、Disclosure。补全看板，已有业务入口消费公开组件。保留提交/unknown/恢复、权限、编辑器和持久化合同。不引入整套 Beautiful UI、演示计时器或新业务状态。无重要产品待决。

验收：控件组合协调、light/dark 和窄窗可用、hover/active/selected/disabled/invalid 与 focus-visible 区分；鼠标无 outline，键盘可见；Select 搜索不改值、Esc 返回焦点；Checkbox/Slider/Disclosure 保留原生键盘及表单语义。实机验证仅覆盖本轮变化；不请求真实 provider、不打包、不远端发布。

工程：完成。试用：源码 Dev 已交付，见[交接](handoff.md)。用户认可：pending。65 项定向测试、Renderer 类型检查、构建与相关门禁通过；隔离 Electron 完成本轮必要的视觉和键盘交互观测。评审与证据边界见[评审记录](review.md)。

```project-status
[{"id":"beautiful-ui-system","title":"Beautiful UI 基础视觉体系升级","phase":"基建","engineering":"complete","trial":"delivered","acceptance":"pending","evidence":["spec.md","evidence/custom-answer-verification.json","evidence/custom-answer-browser.json","evidence/detail-browser.json"],"next":"用户在 Dev 试用支持预设选项和手动输入的紧凑问答卡；认可 pending","constraints":"源码 Dev 交付；最新视觉证据为隔离 Renderer 浏览器 fixture，回答帧与代次检查另有 Host 测试；未证明真实扩展业务结果、provider 或原生完整索引；pnpm 启动器环境门禁未通过。"}]
```

任务：[01](issues/01-foundation-upgrade.md)、[02](issues/02-list-and-choice-feedback.md)。

## 2026-10-07 追加反馈

用户最初授权 ChoiceGroup 跟随图 2 的整体胶囊轨道与内嵌选中块，并尝试视频所示列表连续背景；随后明确分组标题/导航切换触发过多移动，要求没有良好优化依据时完全删除视频参考的动效，只保留 ChoiceGroup。最终采用删除：撤销共享跟随背景、列表包装及所有场景接入，恢复原列表反馈；本次追加交付只保留 ChoiceGroup（至少两项互斥、保留受控值/Radio 语义），取代原二值无外框配方。见[02](issues/02-list-and-choice-feedback.md)。首轮交付证据不冒称证明追加改动。

追加工程完成，最终代码 `cdd7f5d`；14 项相关测试、最终代码构建、类型/设计/交互及相关门禁通过，light/dark 与禁用项方向键跳过经隔离 Electron 观测。源码 Dev 已交付，用户认可 pending。

## 本地 main 集成

2026-10-07 用户明确要求“本地 pr 进 main”，授权将本地 `codex/beautiful-ui-system` 整段交付合入 main；不扩展为远端 push/PR/发布或产品认可。基点 `7906f25`，已验证交付 head `58f3330`；本地说明见[pr.md](pr.md)。

本地 main 已通过 merge commit `82afd091ab1aad40cab635272e30d9ccffe46188` 合入来源 head `cdcddcf`，无冲突。合并提交的树与来源分支完全一致；合并后重新生成看板并核对文档/状态/结构门禁。工程与试用状态保持，用户认可仍 pending。

## 2026-10-09 组件梳理与组合 Polish

本次授权：用户要求梳理当前基础/业务组件并按 impeccable polish，随后明确要求对照本地 t3 code 查漏补缺。基点为 main `70443c4d67b579e31fb786662914d90f52cd0089`，当前目录串行实现；不沿用历史切片的分支或独立评审流程。延续 D-31/D-32、Beautiful UI 中性主操作、系统字体、唯一紧凑布局、light/dark、共享 token 与 Base UI。没有新的产品方向待决。

### 当前组件分层与缺口

看板原有 20 项，加 App 注入的 HoverMenu 为 21 项；这不是整个仓库的组件总数。实际实现分为共享 UI、App 配套组合和业务绑定，部分能力已经存在但没有独立看板示例。不能用 TSX 文件数等同于组件能力。

| 层级 | 当前已实现的主要组件及入口 | 本次处理 |
| --- | --- | --- |
| 共享操作、输入与配置 | `modules/ui/renderer/public.ts`：Button、TextInput、TextArea、FormField、Select（含搜索组合）、ChoiceGroup、Switch、Checkbox、Slider、Disclosure/Trigger、SettingsPage/Group/SettingRow、Popover/Trigger/Content 与 Icon Layer | 保留真实受控值和原生语义；修正长 Select、description-only 分组、窄父容器配置行及输入文字角色；Disclosure 增加 framed variant |
| 共享展示组合 | 之前没有统一的状态标签、动作组、提示、空态和键帽 | 新增 Badge、ActionGroup、InlineNotice、EmptyState、Kbd，统一 token/data-slot；状态含义仍由调用者提供 |
| App 配套 | `components/ui/`：IconButton、Tooltip、HoverMenu、ActionMenu、Modal、SettingsModal、NavigationOverlay、ResizableSplit、TabStrip、StatusPreview | 弹层宽高服从可用空间，长文案换行；标签栏只滚自身并响应尺寸变化；新增 CopyButton 与 PathLabel |
| 输入与执行 | `workbench/`：Composer、ComposerToolbar、ComposerModelPicker、AttachmentControls/Strip/PreviewDialog、QueueControls/Editor、RuntimePanel、SubagentControls、FilePanel；`configuration/renderer/`：ModelPickerPanel、ProviderConnectionSummary | 修正窄输入周边换行、模型区收缩、附件按钮尺寸边界、队列动作分组、文件/变更列表行；抽出 NativeInteraction，保持正式回答/后续收据及 unknown 合同 |
| 阅读 | `reading/`：ReadingPane、ReadingBody、Conversation/ItemView、Submissions/Record、History、SubagentMessage | 新增 MessageHeader、ToolResultFrame 并接入；统一复制反馈、状态层次、工具展开与正文节奏，限制宽屏阅读行宽 |
| 设置与工作台 | `shell/settings/`：Preferences/Appearance/Connections 等页；`configuration/renderer/settings/`：ProvidersSettings、ProviderAccounts、ProviderModels、CustomModelForm、ModelRoles、ModelMetadata、AuthenticationProgress/SnapshotSummary；EmptyWorkbench、ThreadNotice | 使用统一空态、提示与 Kbd；提供商详情/角色选择器长文本与宽度约束，继续使用现有查询/写入所有权 |

本轮看板增加 10 项到 30 项，含 App HoverMenu 为 31 项。五个共享展示组件、两个配套组件和三个业务组合都有实际消费者，不是单纯增加目录文件。NativeInteraction 从既有实现提取，并非新增 OMP 交互能力。看板中的原生回答只修改明确标注的本地示例，不发送 OMP 命令。

### t3 code 对照与采用判断

只读参考 `/Users/lou/Learn/t3code`，固定 HEAD `30cc788975500a8c00d32a50f348174d1ce578d1`，根许可 MIT。核对 `apps/web/src/components/ui/` 的目录覆盖及代表源码，未启动 t3、未安装依赖。未复制整套样式或生产组件；同类组合以 d-pi 自有 API 和 token 实现。出处另见[固定源码依据](../../docs/architecture/design-system-references.md#2026-10-09-t3-code-本地组件对照)。

| t3 代表源码/模式 | d-pi 的差距与本次采用 |
| --- | --- |
| `ui/badge.tsx`、`ui/alert.tsx`、`ui/empty.tsx`、`ui/kbd.tsx`、`ui/group.tsx` | 补齐状态、提示、空态、键帽与动作组的组合层；不引入上游全部变体、密度、品牌色或 glass 效果 |
| `ui/select.tsx`、`ui/combobox.tsx`、`ui/dialog.tsx` | 借鉴值/图标分工、可用宽高和滚动边界；缺失受控选项仍展示真实值，不自动替换为第一项 |
| `StartTruncatedPath.tsx` | 文件/变更行应优先保留末端文件名；PathLabel 用尾部截断，完整文本保留在 title 与可访问名称中 |
| `DiffFilePathCopyButton.tsx`、`hooks/useCopyToClipboard.ts` | 复制不能点击即成功；等待写入、局部 pending 防重复、成功复位、失败重试、忽略换源后的迟到完成。d-pi 使用本地反馈，不新建 Toast 系统或改富文本复制协议 |
| `ThreadStatusIndicators.tsx`、`ChatView.tsx`、`CommandBlock.tsx` | 消息状态和操作、工具输出框、原生交互应有可复用组合边界；不复制 t3 的会话事实、审批规则或执行状态机 |
| `ui/skeleton.tsx`、`ui/spinner.tsx`、`ui/input-group.tsx`、`ui/command.tsx`、`ui/table.tsx` | 仍是候选。现有读取/加载状态已有文字和重试；后续按真实页面补充加载占位、输入配套、命令检索、密集数据展示，不在本轮用空壳 API 虚增数量 |
| `ui/calendar.tsx`、`ui/wizard.tsx`、`ui/qr-code.tsx`、远程环境与 terminal 配套 | 当前没有对应已授权 GUI 场景；不为追齐目录覆盖引入新业务功能。集成终端仍是独立待授权规格 |

### 具体行为与边界

- Select 搜索模式在受控值不在 options 中时曾显示空白，现在与普通模式一致保留真实值；长标签截断在值区域，箭头不被挤出，弹层保留完整选项。
- SettingsGroup 曾在没有 title 时丢弃 description；现在保留并关联分组说明。SettingRow 跟随父容器宽度，嵌在宽窗口里的小面板也能换行。
- TabStrip 自动显露外部选中的标签，只调整自身横向滚动；不把祖先内容滚走或抢占焦点。看板索引同样限定在自身阅读区域。
- CopyButton 只在剪贴板 Promise 成功后显示“已复制”，pending 防重复，失败可重试；换文本/卸载清理计时器并忽略旧完成。
- 弹层/菜单/状态预览、原生长选项、配置提示与文件路径约束在实际分配的内容盒中；消息头、工具框、队列动作消费同一共享视觉语法。
- 本轮未修改 OMP 执行、持久化、权限、原生认证协议、unknown 自动重发策略或编辑器事实。

工程验证及本轮实机证据在本节收尾记录；历史 native-observations 不作为本轮证明。用户认可继续为 pending。

### 本轮验证与交付

2026-10-09 工程完成，源码工作区可按现有 Dev 流程试用，用户认可 pending。本次完成 91 项唯一相关行为测试（基础/组合 68 项，另 23 项阅读和线程绑定）；Renderer TypeScript、最终构建、Biome、设计/交互/i18n、架构/结构/文档/状态门禁通过。没有运行完整后端/provider 测试矩阵。

隔离 Electron 的组件看板 41 项、线程工作区 15 项检查通过，共 56 项。实机覆盖 light/dark、1440×900 / 1040×720 / 720×540、长 Select 值与弹层、嵌入宽窗口的小设置容器、索引滚动范围、工具结果展开/收起、本地原生选择、输入工具栏换行，以及返回会话后草稿/资源保留。主题明确指定并核对实际 color-scheme，不把三态切换当作二态。截图已目视核对，原生记录见 [polish-components.json](evidence/polish-components.json)、[polish-thread.json](evidence/polish-thread.json)，源文件指纹及边界见 [polish-verification.json](evidence/polish-verification.json)。

代表截图：[浅色业务组合](evidence/polish-business-light-1440.png)、[深色窄窗组合](evidence/polish-business-dark-720.png)、[长选择弹层](evidence/polish-settings-dark-wide.png)、[窄线程输入区](evidence/polish-thread-dark-720.png)。手工 impeccable detector 仅运行一次，0 findings；这是机械扫描，不替代视觉/行为判断。

环境限制：工具准备门禁未整体通过，当前 pnpm 启动器在隔离环境中尝试下载 11.24.0，而项目声明 12.8.1；本轮未改动工具链或安装依赖，使用已安装的直接命令完成相关测试、检查和构建。GUI 使用隔离 IPC 数据，不证明真实 provider、固定包、系统 IME、VoiceOver 或物理输入设备验收。品牌资产已有 content 回调的类型声明遗漏 id 参数，已按实际 useId 调用合同修正；模型选择的两项旧测试已对齐当前默认提供商过滤行为，没有改动选择策略。


## 2026-10-09 Beautiful UI 精致感升级

用户要求继续直接对照 [Beautiful UI](https://www.beautifului.dev/)，提升组件精致感并遵守现有设计规范。此轮在上一节源码基础上串行完成，不替换已确认的中性/蓝色体系、系统字体、紧凑尺寸、Base UI 和自有 API；未改变业务事实、执行许可或提交策略。

视觉对照采用页面实际展示的 Approval Card、Tool Chips、Task Rows、Chat、Prompt Bar。沿用固定源码参考 `44a274e598395ab61e7c96c26fda2758780253b7` / MIT，只借鉴表面、信息层次与组合，不复制上游生产源码或演示状态。与前轮相比：

- Button/Select/ChoiceGroup/Kbd 统一浅层深度与内边缘；Input 保留轻内凹表面。新增共享 `--surface-subtle` 和 `--shadow-surface`，数值仅在 tokens.css 定义，深浅主题联动。
- Badge 改为紧凑胶囊及语义细边界；Notice、设置组与空态整理层次和说明字号，保留原文和调用者给出的状态。
- 新增公开 OptionAction，将选项名称、说明及立即执行动作组合为完整操作行，使用 Button 的 option variant，不另建选中状态。NativeInteraction 真正接入；名称和说明分开关联，description 在点击区域内。看板现为 31 个目录项加 HoverMenu，共 32 项。
- Disclosure 使用细箭头、共享 hover 与 reduced-motion；ToolResultFrame 统一图标、标题、边界、代码正文和展开表面。Composer 使用轻表面边缘与控件级阴影，保持原有读写和工具栏合同。
- 看板增加展示留白，业务组合和设置组不再套重复的展示边框。WindowFrame 明确作为绝对定位的包含块，收住辅助文本的定位边界；完整索引的宿主滚动仍保留实机复核项。

验证：OptionAction 缺口测试先失败再通过，验证名称/说明关联、ref 焦点、点击和禁用排除。最终 8 文件、43 项相关测试通过；Renderer TypeScript、构建、Biome、设计 lint、交互/i18n、架构/结构/文档/状态检查通过。构建保留现有 Rollup 注释和分块体积警告，未修改打包策略。

按 impeccable 完成一轮集中视觉检查、一次修正及一次最终确认。当前截图确认 light/dark × 1440/720 宽度的业务组合、原生长选项和工具正文没有横向溢出；首轮还检查设置行、嵌入小容器、Select 完整值/Esc 焦点返回，以及实际线程输入栏。原生选项的本地即时回调已观测，反馈仍明确表示结果未确认，不借样式假造业务成功。

证据：[验证清单](evidence/finesse-verification.json)、[浏览器记录](evidence/finesse-browser.json)、[测试输出](evidence/finesse-tests.log)、[浅色窄窗](evidence/finesse-business-light-720.jpg)、[深色宽窗](evidence/finesse-business-dark-1440.jpg)。有效手工 detector 扫描一次，0 findings；前一次传入错误的输出参数未产生有效 JSON，纠正参数后才取得有效结果。机械扫描不替代视觉判断。

证据限制：本轮截图来自隔离的实际 Renderer/IPC fixture，在 Codex in-app browser 中检查；未将 Electron 启动等同于原生验证。完整看板索引检查时，IAB 的截图位置与 viewport/滚动读数互相矛盾，因此不声称原生窗口定位已验收；历史 56 项 Electron 记录保留，只证明前轮对应源码。本轮未重跑完整 Electron 自动化、真实 provider、系统 IME、VoiceOver 或固定包。工具链问题仍沿用前节记录，使用已安装的直接工具完成检查。

工程源码已交付，用户认可 pending；未 commit、push 或发布。

## 2026-10-09 截图反馈与细节重做

用户明确指出工具框 hover 越过圆角、原生问答卡过宽且导航式选项缺少审美，并提供 Beautiful UI 紧凑问答卡截图作为直接对照。此前精致感追加未达到用户要求，本节取代其问答配方与最新验收结论；不将旧测试或 detector 的通过视作用户认可。

本次改动：

- framed Disclosure 在真正的共享拥有者裁切背景和正文至圆角；键盘焦点改为内部 outline，保留鼠标无 outline 的中央合同。hover 使用可辨识的共享表面；工具图标收至 16，长代码路径在正文内换行。
- NativeInteraction 改成宽度上限 26rem、可随父容器收缩的问答卡，移除分割线、导航箭头及负边距。标题/关闭、单选项/说明、右下角低强调填充动作与蓝色提交形成三个明确区域；确认、输入及默认回答后的后续输入沿用相同动作位置。
- 新增真实接入的公开 RadioOptions：Base UI 负责 Radio/RadioGroup 语义，空选择、单个选项和方向键均可用，名称与说明分别关联；既有 ChoiceGroup 胶囊模式继续保留。OptionAction 仍用于立即执行的选项动作，原生问答不再使用它。
- 选择只更新 Renderer 临时呈现；用户提交后才发送原生选项原文。原生选项更新使旧选择失效，同一事件批次连续点击只发送一次。取消、不可信项目限制、超时、输入预填及确认响应继续保持正式合同。没有新增自定义原生选项、问题分页或执行能力。看板中文本地示例的动作语言与文案对齐。

验证：新的选择/提交缺口先失败再实现；最终 8 文件 51 项相关测试通过，含 9 项 NativeInteraction 测试（提交防重复、原生更新、取消/信任、超时、方向键、确认/拒绝、预填及单项）。Renderer TypeScript、最终构建、Biome、设计/交互/i18n、架构/结构/文档/状态门禁通过。初始测试中有一处旧超时文案预期写错，已按真实“请求已超时”纠正，不将其算作功能缺口。

按 impeccable 集中检查一轮、修正一批、最终确认一次。首轮发现标题关闭动作负边距使内部宽度多出几像素，已移除；最终 light/dark × 720/1440 下两组件及后代无横向溢出。展开/收起时 summary 确实处于 hover，圆角之外的命中测试排除内部元素，鼠标 outline 为 none；键盘 Radio/Disclosure 均为可见 2px outline，工具框内侧焦点未被裁掉。本地提交保留“结果尚未确认；不会自动重答”，不假造执行成功。

当前证据：[源码与验证](evidence/detail-verification.json)、[界面记录](evidence/detail-browser.json)、[深色问答卡](evidence/detail-final-question-dark-crop.jpg)、[浅色 hover](evidence/detail-final-hover-light-720.jpg)、[深色 hover](evidence/detail-final-hover-dark-720.jpg)、[键盘焦点](evidence/detail-final-keyboard-light-1440.jpg)。手工 detector 扫描一次，机械结果另存，不替代用户判断。

边界：本轮使用实际 Renderer 的隔离浏览器 fixture，只有本地模拟 IPC；没有把它说成 Electron、真实 provider、完整目录导航、VoiceOver、IME 或固定包验收。工具链准备限制沿用上一节，使用已安装的直接命令，不安装新依赖。工程完成、源码 Dev 可试用，用户认可 pending；未 commit、push 或发布。

## 2026-10-09 手动回答补齐

用户追问为何不能手动输入，随后明确要求直接修改。本节取代上一节“原生问答只提交选项原文、没有自定义回答”的限制；前轮只做单选样式而未补齐输入能力，不能以协议解释代替实施。此轮在同一工作区串行完成，不 commit、push 或安装依赖。

源码依据：已安装固定 SDK `@oh-my-pi/pi-coding-agent` 18.4.6 的 `src/modes/rpc/rpc-mode.ts`，`requestRpcSelect` 使用 `parseValueDialogResponse`，返回 value 字符串而不验证选项成员。此前非选项内容被拒绝来自 d-pi 的 PendingInteractions.validateAnswer，不是传输协议不能承载文本。用户明确扩展问答输入范围后，移除该成员校验；保留确认与字符串响应的类型区分、活连接代次、待答/超时/取消、防重复和 unknown 不重发。自定义回复的原生业务解释仍由扩展拥有，不将写出当作业务成功。决定连续性登记在[决定补充](../../docs/decisions.md#2026-10-09d-32-问答组件与原生回答的自由输入)。

共享 AnswerOptions 真正组合 RadioOptions 和 quiet TextArea，以判别联合传递单一答案。普通消费者可关闭 custom 入口；NativeInteraction 的 select 实际展示“其他回答”。输入取消预设项选择，重新选项清空手写内容，空白不能提交；文本、前后空格与换行按原样通过既有 value 帧发送。confirm 保留确认/拒绝，不开放文本；input/editor 延用输入能力。手写草稿在原生超时默认作答后仍保留，供已有正式追发路径使用，超时默认策略不变。16,384 字符上限沿用既有 AnswerSchema。共享主题/焦点和 Own API 不变，看板本地示例的说明同步包含手动输入。

按 TDD，5 个 Renderer 输入缺口与 1 个 Host 自定义回复缺口先失败，再实现并通过。最终 8 文件 94 项相关测试通过，含 14 项 NativeInteraction、13 项 PendingInteractions 和 36 项 SessionHost；新增 Host 集成样本确认旧代次不写出，当前代次发送准确帧，重复发送不二次写出。Renderer/Host TypeScript、构建、Biome、设计/交互/i18n、架构/结构/文档/状态门禁通过。

按 impeccable 做一轮集中检查、文案修正和一次确认。light/dark × 720/1440 下卡片及输入区域无横向溢出；鼠标输入无 outline，Tab 进入输入框为可见 2px outline。744 字符多行样本在限高输入区滚动，footer 保持正常布局；空白按钮禁用、本地自定义提交反馈实际观测。视觉来自隔离 Renderer 浏览器，不是 Electron、真实 OMP 扩展业务、provider、IME、VoiceOver 或固定包验收。

证据：[源码与验证](evidence/custom-answer-verification.json)、[界面记录](evidence/custom-answer-browser.json)、[深色手动回答](evidence/custom-answer-dark-crop.jpg)、[长回答](evidence/custom-answer-long-light.jpg)、[键盘焦点](evidence/custom-answer-keyboard-light.jpg)、[本地提交](evidence/custom-answer-submitted-light.jpg)。手工 detector 仅作机械补充，用户认可保持 pending。工程完成，源码 Dev 可试用；由于 Host 代码也有修改，已有 Dev/Host 进程需重启以采用更新，未主动中断用户运行中的真实会话。既有工具准备门禁限制保留。
