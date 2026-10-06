# 独立 Spec 增量复核：提醒预算与迟到状态定位

结论：本次固定增量未发现新增可触发的高价值 Spec 缺陷。迟到首次 Runtime inspect 的 P2 在源码与真实 React/RuntimeModel 回归层关闭；提醒预算 P2 的源码层修复已补齐，但实际新候选的几何验收仍待主 Agent 验证，不能以本报告宣称实包 green。

## 固定输入与覆盖

- Base：63a578f02ec3c3ce5b901d8c113094c2e5b37953。
- Head：48cd01cc60273d79e4ef2069389d585e8065e465。
- Merge-base：63a578f02ec3c3ce5b901d8c113094c2e5b37953（实际 git merge-base 已核实）。
- 主输入通过 git archive Head 解出至 /tmp/d-pi-attention-reserve-final-input，覆盖 workbench、navigation-continuity 回归、styles、shell/attention、validation/m2/attention.mjs、预算 cap 失败证据及导航合同；直接依赖、规格和其余原始日志通过 git show 固定 Head 读取。未以浮动工作区文件作为增量判断基础。
- 本轮只读，未安装、构建、启动/复制 App、修改源或管理状态、执行测试。只写此原始报告。
- 检查完整 base..head 文件清单；重点检查 thread-workbench.tsx、attention-location.ts、navigation-continuity.test.ts、app.css、attention.mjs。追读实际 RuntimeModel 的 bind/publish/subscribeTo、ThreadModel 首次 inspect、RuntimePanel DOM 生成、AttentionModel locate 与 AttentionCenter 导航/过期点击合同；核对本轮规格不扩 M3、通知不发送回答、后台不抢焦点、用户认可 pending。

## 已报告 P2 的复核

### 迟到首次 inspect 导致唯一 RAF 丢失定位

原路径是新 ThreadModel 的 view=null，定位 RAF 先于 inspect 返回；RuntimePanel 随后单独挂出 interaction，父定位 effect 无依赖变化。本次 thread-workbench.tsx:47-82 使用实际 RuntimeModel 的 view 非空选择订阅，needs-answer 在首次样本未到达时不安排定位，并等待 transitioning 解除。样本提交后的 layout effect 安排 RAF，实际 DOM 生成后执行定位。

attention-location.ts:35 的返回值核实 document.activeElement===target；只有实际聚焦成功才记录 located.current。记录按 locate 意图对象身份，AttentionModel 每次明确 locate 会复制新对象，因此再次点击可重新定位；普通后续 Runtime 样本不会再次夺走用户已经移回 Composer 的焦点。定位仍只打开当前实际匹配 receipt，缺 receipt 使用现有 runtime 回退，不发送原生 answer，不改通知事实。

navigation-continuity.test.ts:464 新回归用正式 AppModel/RouterProvider/ThreadModel/RuntimeModel 与 React root，仅以 RuntimeBridge 延迟 inspect 回复：在 resolve 前确认不存在 interaction，resolve 后确认 DOM 已出现且 activeElement 直接指向 interaction；再将焦点移回实际 editor，发送后续 revision 样本并确认焦点保留。它检验真实可达生命周期结果，未 mock locate 或组件焦点实现。既有失败 receipt 专注/Editor DOM 保留/恢复 controls 回归继续存在。

固定原始 delayed-focus-red 显示新断言在 interaction 已挂出后 activeElement 仍为 body；delayed-focus-green 显示相关 3 文件 19 项通过。这里是核对已保存日志，不是本 reviewer 本轮执行测试。工程记录的 796 项通过、2 项既有跳过也已核对；34 架构/74 tooling 来自主 Agent 已报告检查，不扩张为本轮亲自执行。

这关闭上述明确源码路径。旧两次实际包 focus timeout 根因仍 unknown；新回归红灯和修复不能倒推它们的具体根因。固定 cap-insufficient 的有界观测反而显示该次旧包成功进入 interaction，不与旧 timeout 混并。

### 仅限制提醒高度仍不能保证当前阅读空间

固定 attention-budget-cap-insufficient/package-log.txt 真实达到几何断言：9 条提醒、centerHeight/clientHeight=64、scrollHeight=288、readingHeight=0、lineHeight=19.5、lastReachable=true、A_UNSENT_DRAFT。这确实否定此前“仅 cap 即关闭阅读预算”的实包结论；更早的焦点 timeout 不作几何红灯。

本次 app.css:504-506 在 workbench 直接存在 attention-center 时为 thread-reading 预留 4lh。沿用 center 的共享 control-height cap 与独立 overflow-y，工作区既有 thread-setup 可收缩且独立滚动；Composer 保持现有生命周期和控件。没有以隐藏提醒或卸载 Editor 满足预算，也没有在无提醒时普遍改布局。

validation/m2/attention.mjs:633-675 保留 >=4 真实 DOM entry、至少 4 个 computed line-height、草稿完整、中心确实发生内部滚动、最后提醒 focus/rect 完整可达；新增 reading 和整个 Composer 必须处于实际 work-content 与 window 的交集内。该断言能拒绝“阅读虽分配 4lh，实际在祖先裁切区之外”及“挤掉 Composer 换来阅读高度”的结果。样本仍来自正式 GUI 新 Thread/真实 SDK localhost 请求，回 A 后才释放并核实 completed+unread；没有改数据库或注入提醒来凑样本。

源码现在明确为阅读区保留下限，原 P2 的源码层缺口已修复。真实 normal/compact/窄窗口能否同时满足阅读和 Composer 的全部边界，需要新候选执行这些断言并保存截图/指标；本轮尚无该结果，实包验收保持待验证。

## 观测质量与未知范围

有界 focus probe 只采样最多 150 项 focusin/out、DOM 子节点/inert 变化和 activeElement，不模拟焦点或 native callback；目标焦点等待的 finally 会保存并解绑。它足以辅助复核该次实际丢焦时序，不能替代真实路由/原生回调证据。

未亲自运行自动检查、实际新包、macOS 系统通知显示/点击或 Finder/CmdW 路径。既有 m2.18 原生记录与旧包 cap-insufficient 证据属于各自固定候选，不能移作 Head 48cd01c 的实机验证。本报告不宣称产品验收、M2 整体完成或用户认可。

## 新发现

无新增符合“明确触发、实际影响、可行动证据”的高价值问题。

## 追加：validation-only 焦点采样修正

固定 Base：48cd01cc60273d79e4ef2069389d585e8065e465；Head：78b863144b7894fd08369b8eea7b7ba3ecdf227d；实际 merge-base 等于 Base。通过 git archive Head 将 validation/m2/attention.mjs 与两组 focus-bounds/probe 原始证据解出至 /tmp/d-pi-attention-validation-final-input。git diff 的生产 src 与 package.json 为空，候选生产源码仍为 48cd01c；这次只变验证 helper 和证据，没有产品修复。

独立结论：未发现新增高价值问题。旧 helper 的采样干扰路径在源码中成立：它先聚焦最后提醒，随后调用 prior.focus({preventScroll:true}) 并无条件恢复中心旧 scrollTop，但未验证 prior 是否实际接回焦点；prior 是不可聚焦的 body 时，最后提醒会继续 active。后续 compact 再对同一 active 元素调用 focus，不能据此保证再次滚入中心。因此该 helper 自身可以制造“最后按钮 active、scrollTop 却为 0”的失败。原始 probe 日志确实记录了 compact center 57–117、last 147–177、active=true、scrollTop=0，同时 readingHeight=78、reading/Composer 可见、草稿完整。这与上述污染路径相符。日志未记录 prior 的身份，故单凭该日志不独立宣称唯一实机根因；新直接恢复断言会封闭这项不确定性。

Head helper 在读取 focus/几何结果后先 last.blur()，再恢复 prior 与原 scrollTop，并核实 document.activeElement===prior；它不会用显式 scrollIntoView 代替原 focus 可达能力，也不会在检查前移动中心到最后一项。4 项样本、4 行阅读下限、实际 reading/Composer 视窗交集、内部滚动、完整草稿、最后按钮完整边界全部保留；新增 focusRestored 检查比旧 helper 更严格。focusBounds 新增前后中心与最后按钮矩形、active、scrollTop、pixelRatio，便于区分再次焦点污染和真实布局错误。主题/密度流程明确等待 dataset.density 落到 compact/normal，避免把尚未应用的外观当目标采样。

固定旧候选在进入 compact 断言之前已走过 normal 预算断言，且保存正常预算截图；这支持该次 normal 结果，不等于所有主题/密度/窄窗口通过。修正后的 Head validation 尚未有本轮实际完整 green；原报告关于实际新包验收待完成、旧两次 focus timeout unknown、用户认可 pending 的限制继续有效。未运行测试或 App、未改生产源/状态。

## 追加：validation-only 新 Thread DOM 就绪条件

固定 Base：78b863144b7894fd08369b8eea7b7ba3ecdf227d；Head：adcd4d357e0400f3d6eeaeca4dcec4f6953e1820；实际 merge-base 等于 Base。git archive Head 的 validation、相关原始证据、routing/router 与 shell 只读输入位于 /tmp/d-pi-attention-domwait-final-input，另用固定 git show 核对 ThreadPage 与共用 package insert。生产 src/package.json diff 仍为空，共用 package helper 未改变。

未发现新增高价值问题。原始 attention-new-thread-dom-race/package-log.txt 显示实际在失败 Thread 创建后的 insert 因 contenteditable=null 调用 focus 抛错，尚未到预算/原生验收；该轮不能宣称相关 green。旧 attention 专用 newThread 仅等 Main DB active_thread 改变及任意 runtime-panel 已就绪，不能证明新路由编辑器已提交。

Head attention.mjs:157 的同一 wait 现在要求 sidebar aria-current 的完整 Thread UUID 为新 id、实际 contenteditable 存在且不存在 inert 祖先、实际 runtime ready。结合固定源码：sidebar aria-current 由 Main 确认后的 model selection 生成；旧 ThreadPage 在 route 与 selection 不一致时只能保留 transitioning/inert 视图，AppShell 在 pending 时整体 inert。因此这组条件不能由被保留的旧可编辑视图提前满足，并直接补上本次 null.focus 的缺失就绪条件。未发请求/改 UI 来绕过等待，后续实际 insert 及其文本断言保持。

预算 probe 新 priorFocus 记录 prior.tagName，能辨认 body 与按钮等类别；它不是唯一元素 ID，精确恢复仍由 document.activeElement===previous 的对象身份断言保证。原 README 追加明确旧 prior 未记录、body 路径并非已证实唯一实机根因，与独立报告的未知边界一致；旧原始日志未重写。

只读复核完成，没有构建/安装/运行 App 或测试。新完整实际包仍在执行，normal 以外外观/窄窗口与完整 native 结果继续待主 Agent 核实；本报告不提前宣称 green、产品验收或用户认可。
