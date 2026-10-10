---
name: "d-pi"
description: "紧凑、清晰、浅层深度的桌面工作台；共享 CSS 角色驱动 light/dark。"
colors:
  background: "var(--background)"
  surface: "var(--surface)"
  sidebar: "var(--sidebar)"
  statusbar-background: "var(--statusbar-background)"
  foreground: "var(--foreground)"
  primary: "var(--primary)"
  primary-foreground: "var(--primary-foreground)"
  primary-hover: "var(--primary-hover)"
  primary-active: "var(--primary-active)"
  emphasis: "var(--emphasis)"
  emphasis-foreground: "var(--emphasis-foreground)"
  emphasis-hover: "var(--emphasis-hover)"
  emphasis-active: "var(--emphasis-active)"
  accent: "var(--accent)"
  accent-foreground: "var(--accent-foreground)"
  muted: "var(--muted)"
  muted-foreground: "var(--muted-foreground)"
  muted-hover: "var(--muted-hover)"
  border: "var(--border)"
  border-strong: "var(--border-strong)"
  control-border: "var(--control-border)"
  border-soft: "var(--border-soft)"
  field: "var(--field)"
  placeholder: "var(--placeholder)"
  destructive: "var(--destructive)"
  overlay: "var(--overlay)"
  code-selection: "var(--code-selection)"
  diff-added-background: "var(--diff-added-background)"
  diff-removed-background: "var(--diff-removed-background)"
typography:
  heading:
    fontSize: "var(--text-heading)"
    letterSpacing: "var(--tracking-heading)"
  title:
    fontSize: "var(--text-title)"
  body:
    fontSize: "var(--text-body)"
  reading:
    fontSize: "var(--text-reading)"
  small:
    fontSize: "var(--text-small)"
  control:
    fontSize: "var(--text-body)"
    lineHeight: "var(--control-line-height)"
rounded:
  container: "var(--radius)"
  window: "var(--radius-window)"
  control: "var(--radius-control)"
  chip: "var(--radius-chip)"
  checkbox: "calc(var(--radius-chip) / 2)"
  pill: "var(--radius-pill)"
spacing:
  unit: "var(--spacing)"
  control: "var(--control-padding)"
  panel: "var(--panel-padding)"
  layout: "var(--layout-gap)"
  region: "var(--region-gap)"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.control}"
    rounded: "{rounded.pill}"
    height: "var(--control-height)"
    padding: "0 calc(var(--control-padding) + var(--spacing) / 2)"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.control}"
    rounded: "{rounded.pill}"
  button-primary-active:
    backgroundColor: "{colors.primary-active}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.control}"
    rounded: "{rounded.pill}"
  button-emphasis:
    backgroundColor: "{colors.emphasis}"
    textColor: "{colors.emphasis-foreground}"
    typography: "{typography.control}"
    rounded: "{rounded.pill}"
    height: "var(--control-height)"
  button-emphasis-hover:
    backgroundColor: "{colors.emphasis-hover}"
    textColor: "{colors.emphasis-foreground}"
    typography: "{typography.control}"
    rounded: "{rounded.pill}"
  button-emphasis-active:
    backgroundColor: "{colors.emphasis-active}"
    textColor: "{colors.emphasis-foreground}"
    typography: "{typography.control}"
    rounded: "{rounded.pill}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.foreground}"
    typography: "{typography.control}"
    rounded: "{rounded.pill}"
    height: "var(--control-height)"
  button-ghost:
    textColor: "{colors.foreground}"
    typography: "{typography.control}"
    rounded: "{rounded.pill}"
    height: "var(--control-height)"
  button-navigation:
    textColor: "{colors.muted-foreground}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    height: "var(--control-height)"
  button-navigation-selected:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-foreground}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
  button-destructive:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.destructive}"
    typography: "{typography.control}"
    rounded: "{rounded.pill}"
    height: "var(--control-height)"
  icon-button:
    textColor: "{colors.foreground}"
    rounded: "{rounded.control}"
    height: "var(--control-height)"
    width: "var(--control-height)"
  text-input:
    backgroundColor: "{colors.field}"
    textColor: "{colors.foreground}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    height: "var(--control-height)"
    padding: "0 var(--control-padding)"
  text-area:
    backgroundColor: "{colors.field}"
    textColor: "{colors.foreground}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "calc(var(--spacing) * 2) var(--control-padding)"
  select:
    backgroundColor: "{colors.field}"
    textColor: "{colors.foreground}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    height: "var(--control-height)"
    padding: "0 var(--control-padding)"
  select-popup:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.foreground}"
    typography: "{typography.control}"
    rounded: "{rounded.container}"
    padding: "calc(var(--spacing) * 1.5)"
  checkbox:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.control}"
    rounded: "{rounded.checkbox}"
  checkbox-checked:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.control}"
    rounded: "{rounded.checkbox}"
  slider:
    height: "var(--control-height)"
    rounded: "{rounded.pill}"
  switch:
    backgroundColor: "{colors.border-strong}"
    textColor: "{colors.foreground}"
    typography: "{typography.control}"
    rounded: "{rounded.pill}"
    height: "var(--switch-height)"
    padding: "var(--switch-padding)"
  switch-checked:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.foreground}"
    typography: "{typography.control}"
    rounded: "{rounded.pill}"
    height: "var(--switch-height)"
  choice-option-selected:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.foreground}"
    typography: "{typography.control}"
    rounded: "{rounded.pill}"
    height: "calc(var(--control-height) - var(--spacing))"
  disclosure:
    textColor: "{colors.muted-foreground}"
    rounded: "{rounded.control}"
    padding: "calc(var(--spacing) * 1.5) calc(var(--spacing) * 2)"
    typography: "{typography.control}"
  tooltip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.foreground}"
    typography: "{typography.small}"
    rounded: "{rounded.control}"
    padding: "calc(var(--layout-gap) / 2) var(--control-padding)"
  file-panel:
    textColor: "{colors.foreground}"
    typography: "{typography.body}"
    rounded: "{rounded.container}"
    padding: "var(--panel-padding)"
---

# Design System: d-pi

## Overview

**Creative North Star: "清晰的紧凑工作台"**

d-pi 的基础视觉体系跟随本轮已授权的 Beautiful UI 对照：常规动作以中性对比组织，蓝色只承担明确强调与可见焦点，柔和选中底面表达当前位置。共享基础控件、配套浮层与业务组合使用同一套角色。

工作区域以 Operate 的扫描与操作效率为中心，阅读区域沿用较舒适的文字角色。胶囊文字动作、较小圆角的输入与图标动作、克制边界和浅层阴影形成连续的视觉语法；light/dark 分别在集中主题源中映射。既定产品布局、编辑器、执行状态和资源生命周期继续沿用。

**Key Characteristics:**

- 唯一紧凑布局，默认控件高度消费 --control-height。
- 中性 primary、蓝色 emphasis、柔和 accent 分工明确。
- 文字动作胶囊化，输入、图标与导航使用控件圆角。
- 颜色、尺寸、深度和动效从同一 CSS 来源传播。

此文档记录本轮实际共享实现。机器层使用 `var(--role)` 绑定 [tokens.css](src/app/renderer/styles/tokens.css)，components 用 `{colors.*}`、`{typography.*}` 等 schema 引用；token 的规范值及主题派生关系仍由 CSS 唯一维护。[sidecar](.impeccable/design.json) 为 schemaVersion 2，只扩展元数据、深度、动效及可渲染样本，不维护平行基础值。

## Colors

冷中性的工作底面与清晰前景形成基础对比，蓝色用于有明确用途的强调；颜色名称描述角色，主题变化不改变用途。

### Primary

- **中性主操作**（`primary` / `primary-foreground`）：常规确认、创建、保存等主动作；hover/active 从主色与对应前景色在集中来源中派生。
- **蓝色强调**（`emphasis` / `emphasis-foreground`）：发送等明确强调动作及可见焦点；hover/active 同样由集中角色派生。
- **柔和选中底面**（`accent` / `accent-foreground`）：导航选中、菜单高亮等位置反馈，由 emphasis 与表面/前景关系派生。

### Neutral

- **工作底面**（`background`、`surface`、`sidebar`、`statusbar-background`）：主区域、浮层、Thread 列与连续状态栏分层。
- **正文与辅助信息**（`foreground`、`muted-foreground`、`placeholder`）：标题/正文、说明与占位符；不能用占位符代替标签。
- **低强调反馈**（`muted`、`muted-hover`）：辅助底面与 hover。
- **边界**（`border`、`border-strong`、`border-soft`、`control-border`）：容器、强调边界、轻分隔与 Checkbox 轮廓分别消费真实角色；输入现有配方消费 border，不能笼统改写为 control-border。
- **输入与遮罩**（`field`、`overlay`）：可编辑表面与浮层背后遮罩。

破坏操作消费 `destructive`；文本选择、Diff 增删消费各自独立语义角色，不随 primary 一并改色。深色主题在根主题作用域独立映射；`system` 是偏好解析方式，实际仍使用 light/dark 两套映射。

**The One Source Rule.** 共享视觉值只在 tokens.css 定义；frontmatter、sidecar、Tailwind 与组件均引用该来源，不复制等值色板或尺寸表。

**The Three Roles Rule.** primary 表达常规主操作，emphasis 表达明确强调，accent 表达柔和选中底面；不要按当前颜色互换用途。

## Typography

沿用 macOS 优先的系统字体栈，定义见 [app.css](src/app/renderer/styles/app.css)；不增加品牌展示字体。Frontmatter 记录真实字阶，未建立的 display 或独立 mono 角色不虚构。

- **Heading**：页面标题消费 `--text-heading`，标题 tracking 按真实组件消费 `--tracking-heading`。
- **Title**：目录等区域标题消费 `--text-title`。
- **Body / Control**：日常界面文字消费 `--text-body`；控件行高消费 `--control-line-height`。
- **Reading**：消息正文与编辑输入的阅读文字消费 `--text-reading`；已有阅读行高由所属样式维护，模型正文限制至 75ch。会话与 composer 共享内容列，用户输入的右侧气泡消费 `--message-user-background` / `--message-user-foreground` 与 `--radius-message`，保留输入原文和换行。
- **Small**：辅助信息与 Tooltip 消费 `--text-small`。

不要用全局缩放代替控件密度，也不要把长文阅读压成辅助文字。具体字重继续由现有组件管理，frontmatter 不凭空建立未存在的共享字重 token。

## Layout

沿用顶层导航/title 标签、中层内容、底层固定状态栏的三层工作台。中层左侧项目/Thread 列表独立滚动，主区与可选右区使用现有面板预算；底部工具宿主属于中层。左列表底部固定横向设置与开发者工具，收起时通过导航覆盖层保留入口。开发者页全宽显示，设置使用大 Modal，背景资源继续挂载。

默认控件高度来自 `--control-height`（当前 compact 为 30px）；面板内边距、布局间距与区域预算分别消费 `--panel-padding`、`--layout-gap`、`--region-gap`。状态栏消费 `--statusbar-height`（28px），完整连续底色由 `--statusbar-background` 拥有；分段跟随实际列宽，不逐段描线。面板分隔消费 `--separator-size`（0.5px），拖拽命中区与可见线条分开。

这些尺寸的规范值仍在 CSS，括号仅解释当前观测。短窗适配由 token 的 max-height 媒体条件缩小面板/间距与编辑预算；窄窗沿用现有面板收起、Modal 内部横向导航、控件换行和内部滚动。没有新增手机网页承诺或一套移动端栅格。

## Elevation & Depth

以底面、轻边界和有限阴影共同表达深度。控件不靠粗描边或装饰渐变制造层级；light/dark 各自调整阴影强度。

- **控件**（`--shadow-control`）：次要按钮、Checkbox 与 Switch/Slider 的实体部分。
- **轻浮起**（`--shadow-raised`）：Select 与菜单浮层。
- **浮层**（`--shadow-overlay`）：Modal、Tooltip 与状态预览。
- **内凹 / 填充**（`--shadow-inset` / `--shadow-filled`）：存在于集中深度词汇中，按真实消费者使用；primary 按钮消费 filled。

**The Shallow Depth Rule.** 工作区依靠底面和边界分层，阴影留给有相应角色的控件与浮层，不逐层包装卡片。

## Shapes

文字动作使用 `--radius-pill`，图标动作、输入、导航和选项使用 `--radius-control`。容器与 Select/菜单弹层消费 `--radius`，Modal 使用 `--radius-window`；`--radius-chip` 是有限形状角色，Checkbox 实际使用其一半。Switch 和 Slider 的圆形实体保留自身原生配方。

圆角由角色决定，不能因控件出现在不同页面而换形。图标动作的主图标独立居中，indicator 脱离正常流、锚定角落并排除命中；图标统一通过自有 Icon Layer。

## Components

基础公开面见 [ui/renderer/public.ts](src/modules/ui/renderer/public.ts)，配套 API 在 [应用 UI](src/app/renderer/components/ui/)。sidecar 样本是 CSS 角色绑定的静态外观，不能代替 React/Base UI 的资源生命周期、键盘协调或受控状态。

### Buttons / IconButton

`Button` 的 `variant` 为 `default`、`secondary`、`accent`、`destructive`、`ghost`、`navigation`；`size` 为 `default`、`icon`、`status`。default 对应中性 primary；**accent API 对应蓝色 emphasis**，它并非 `--accent` 选中底面。secondary 使用 surface 与轻阴影，ghost 透明，navigation 使用 muted 前景并在选中时消费柔和 accent。

文字动作保持胶囊与统一高度，icon 大小为控件高度的方形并使用较小圆角。短动作 active 缩放；navigation/status active 不位移。disabled 降低可见强度并保留禁用语义。`IconButton` 包装共享 icon size 与 indicator 槽，调用方不把角标塞进图标正常流。

### TextInput / TextArea / FormField

`TextInput` 透传原生 input props/ref，`TextArea` 透传 textarea props/ref 并共享输入底面、边界与控件圆角；TextArea 高度自动、最小高度来自编辑预算并允许垂直调整。hover 加强边界，readonly 使用工作底面，`aria-invalid="true"` 使用 destructive 边界。`FormField` 负责标签、description/error 关联和错误 alert，不替调用方拥有输入事实。

### Select / Switch / ChoiceGroup

`Select<T>` 使用真实 `value`、`options`、`onValueChange`，可选 `search` 切换为 Combobox 搜索组合。搜索仅过滤选项；搜索文字不自动改受控值，Esc 与焦点回返由现有基础交互负责。浮层用 surface、容器圆角、raised 阴影，选项高亮消费 accent。

`Switch` 的 checked 轨道使用 primary，实体滑块使用 surface；`ChoiceGroup<T>` 是至少两个互斥选项的 Radio 组合。整体胶囊轨道使用 muted，选中块内嵌 surface、轻边界与控件阴影，保留 radio 的方向键语义和禁用项；窄空间可横向滚动。长列表仍优先 Select，不将 ChoiceGroup 描述为多选 API。2026-10-07 用户参考图 2 取代原二值无外框胶囊样式。

### Checkbox / Slider

`Checkbox` 是自有原生 checkbox 包装，保留 input props/ref，支持 checked、disabled 和原生 indeterminate 属性；未选使用 surface/control-border，选中或 indeterminate 使用 primary 与对应前景。`Slider` 是原生 range 包装，透传 min/max/step/value 等 props/ref，实体使用 primary、轨道使用 border-strong；键盘调整遵循原生范围和步长。

### Disclosure / DisclosureTrigger

分别包装原生 details 与 summary 并透传 props/ref。关闭时辅助前景、打开时正文前景；summary 保留原生键盘展开和 marker，不建立新的业务状态机。内容布局由调用方组合。

### Navigation / TabStrip / Containers

导航使用 Button navigation 的共享反馈。`TabStrip` / `TabItem` 管理标签与选择/关闭/新增、可选面板关联及键盘导航；不拥有内容或资源，当前标签选中使用 muted。关闭动作替换图标槽而不改变标签宽度。文件面板等既有容器用共享圆角、border 与 panel 内边距，不虚构通用 Card 或 Chip API。

### Tooltip / Menu / Modal

`Tooltip` 使用 children、content 与可选 side，由 Base UI 管理触发与 portal；表面、边界、控件圆角、小号文字和 overlay 阴影由共享配方提供。Menu、状态预览和 Modal 使用各自真实公共包装，不从外观推导新的行为合同。

控件 transition 消费 `--motion-control`（当前 150ms），浮层消费 `--motion-popup`（180ms），缓动消费 `--ease-out`；reduced-motion 禁用相应 transition。普通鼠标焦点不绘制 outline，键盘可见焦点使用 `--focus-ring` 与 `--focus-ring-offset`，caret 和可操作语义继续保留。

**The Visible Focus Rule.** outline 只用于键盘或无障碍的可见焦点；普通 focus、hover、active 和鼠标输入焦点不绘制 outline。

本轮原生观测范围见 [native-observations.json](.scratch/beautiful-ui-system/evidence/native-observations.json)：记录 light/dark、固定窄窗、Checkbox/Slider/Disclosure 键盘与 Select 搜索/Esc、Modal/Tooltip 焦点行为。该记录不证明真实 provider、打包、VoiceOver、系统 IME 或物理拖拽；工程/试用/认可状态仍由[所属规格](.scratch/beautiful-ui-system/spec.md)维护。

## 展示、配套与业务组合（2026-10-09）

共享 Badge、ActionGroup、InlineNotice、EmptyState、Kbd 的实现及样式位于 `modules/ui/renderer/presentation.*`，从 UI public 面导出；全部消费现有 token。Badge 的 tone 只表达调用者提供的状态，InlineNotice 的 alert/status 由调用者显式选择，不推断执行结果。设置行按分组的实际容器宽度换行；Select 长值省略在值区域，弹层保留完整文案，受控值缺失时仍展示真实值。

App CopyButton 在剪贴板写入完成后确认，失败可重试；PathLabel 保留路径末端及完整可访问文本。Reading 的 MessageHeader 和 ToolResultFrame 组合共享控件；后者使用 Disclosure 的 framed variant，展开只改变呈现。NativeInteraction 从 RuntimePanel 提取，原生状态、权限和后续正式收据继续由原合同拥有。看板索引与 TabStrip 自动显露仅滚动各自容器。

2026-10-09 精致感追加：轻表面使用共享 `--surface-subtle`，表面内边缘使用 `--shadow-surface`，与现有控件/浮层阴影组合。OptionAction 属于 UI 配套组件，由 Button 的 option variant 管理立即执行的操作行外观，名称与说明分别关联。Disclosure 的箭头、工具输出头部与代码正文统一层次；看板展示容器避免与业务组件重复加框。历史原生记录不外推为最新源码验收。

2026-10-09 截图反馈修正：原生问答以用户提供的 Beautiful UI 紧凑卡片为直接视觉依据，取代此前撑满宽度的 OptionAction 列表。NativeInteraction 宽度消费 `--interaction-width` 并允许随父容器收缩，标题与关闭动作对齐，底部为右侧辅助/强调动作。共享 RadioOptions 使用 Base UI RadioGroup/Radio，支持空选择、单项及名称/说明关联；仅管理本地呈现选择，显式提交才发送原生选项原文。ChoiceGroup 仍沿用已有胶囊模式，不混用两种场景。Button 的 subtle variant 使用 muted 填充，accent 仍表达强调提交。

framed Disclosure 的共享容器裁切 hover 和正文至圆角内，summary 的键盘焦点采用内侧 outline，鼠标不显示 outline。工具正文允许长路径换行；组件消费者不通过负边距或独立主题值修补内部样式。最新验收范围见[细节重做记录](.scratch/beautiful-ui-system/spec.md#2026-10-09-截图反馈与细节重做)。

同日用户明确要求直接补齐手动回答。公开 AnswerOptions 将 RadioOptions 与 TextArea 的 quiet variant 组合为一个受控答案，option/custom 两种输入互斥；可由调用者省略 custom 入口。quiet 输入静止时无边框和独立表面，hover/focus 使用同源表面，键盘仍使用共享 focus-visible；内容自然增长至限高后在输入区滚动。NativeInteraction 的 select 卡片实际开放“其他回答”，空白禁用，显式提交原文，不丢弃超时默认后的未提交草稿。Host 通过既有 value 字符串回复传递自定义内容，confirm 仍使用独立布尔响应。最新来源及验证见[手动回答补齐](.scratch/beautiful-ui-system/spec.md#2026-10-09-手动回答补齐)。

组件盘点、t3 code 固定源码对照、采用边界和本轮证据见[所属规格](.scratch/beautiful-ui-system/spec.md#2026-10-09-组件梳理与组合-polish)。

2026-10-09 会话展示专项：UserMessageBubble、MessageActions、MessageStatus、ThinkingDisclosure 和 ToolResultFrame 各自拥有一类呈现，模型回复保留无框长文；思考首次展开才解析，工具默认收起，失败与停止仍明确显示。消息动作 hover 或键盘聚焦时显露，预留高度防止跳动。ConversationOutline 仅索引已呈现的用户轮次，通过独立的 HoverCard、TurnPreviewCard 与 ConversationTurnAnchor 组合，在悬停或键盘聚焦时预览完整提问；保留换行，长内容在卡片内滚动，鼠标移入后继续展开，通过既有阅读锚点定位；继续生成不改变已定位的轮次。技术身份和底层错误保留在详情中，普通会话不以执行引擎命名。Streamdown 的代码适配层在供应商 utility 层之后消费项目 token，保留精确复制、语法高亮与独立横向滚动。2026-10-10 用户反馈取代此前媒体放在气泡外的布局：图片在用户气泡内上方，文件标签按发送草稿的原始位置与正文内联，输入和消息共用 context token 配方；保留尺寸并按需加载，预览沿用共享 Modal；真实消息时间与复制动作共同按 hover/focus 显露，预留高度避免跳动。轮次导航使用细线圆点与强调色当前态，队列只在输入区按需呈现，停止回复由 composer 提供。验证与限制见[所属规格](.scratch/m2-first-release/spec.md#2026-10-09-会话展示专项)。

## Do's and Don'ts

### Do:

- **Do** 使用公开组件的真实 variant/size 与同源 token，调用方只安排允许的布局。
- **Do** 同时考虑 light/dark、长文阅读、窄窗、disabled/invalid 与键盘可见焦点。
- **Do** 保留原生输入、范围、展开及 Base UI 的键盘与焦点语义。
- **Do** 用现有尺寸标尺组合控件；需要新共享角色时在 tokens.css 定义并检查消费者。

### Don't:

- **Don't** 在页面、DESIGN.md 或 sidecar 另建等值视觉常量。
- **Don't** 将 Button 的 accent API 与 --accent 选中底面混为一谈。
- **Don't** 给导航/状态行添加按下位移，或把普通鼠标焦点改成 outline。
- **Don't** 为局部页面重绘共享控件、关闭设计 lint、引入第二套图标库或恢复密度切换。
- **Don't** 把截图、工程检查或设计工具结果写成用户认可、真实 provider 或固定包验证。


2026-10-10 通用 ComposerTag 由 UI 公开面拥有，附件与项目文件 companion 仅提供展示数据。编辑器与消息气泡共用标记配方、36 grapheme 中间截断、完整 Tooltip、两侧展示空格及垂直居中的名称/辅助文字层级；其他上下文标签可直接复用。窄窗保留尾段，组件看板提供真实示例。
