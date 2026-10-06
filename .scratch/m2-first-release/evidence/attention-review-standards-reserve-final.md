# Standards 增量只读复核：阅读预算与迟到 inspect 定位

结论：未发现本增量新引入、可证实且具有实际影响的高价值 Standards 缺陷。源码支持迟到首投影定位与避免后续夺焦的修复方向；新 CSS/几何验收仍须以候选实际包验证。此结论不表示实际新包通过或用户验收。

## 固定输入与方法

- base / 实际 merge-base：`63a578f02ec3c3ce5b901d8c113094c2e5b37953`。
- head：`48cd01cc60273d79e4ef2069389d585e8065e465`，`git rev-parse` 核实完整 SHA。
- 审查 `git diff base...head` 对应增量；由于 merge-base 等于 base，双点生产差异等价。
- 使用 `git archive 48cd01cc60273d79e4ef2069389d585e8065e465 <相关路径> | tar -x` 构建固定输入，随后 `chmod -R a-w`。主要目录 `/tmp/m2-attention-standards-reserve.EH9bYd`；固定 RuntimeModel/产品上下文补充目录 `/tmp/m2-attention-standards-runtime.ZeA0bE`。均无 node_modules、安装、构建或 App 复制。
- 只读读取根/应用/执行模块 AGENTS、code-review、state-query、headless、design-system/Impeccable 相关规范及 navigation/design-system/headless 合同；沿用该任务既有合同覆盖。未采用新视觉风格或开展无关重构。
- 覆盖 ThreadWorkbench、attention-location、CSS、navigation-continuity 真 React 回归、attention harness 与直接依赖：ThreadModel、AppModel 选择生命周期、RuntimeModel、RuntimePanel、AttentionContent、Composer、reading pane、tokens。
- 本次只写此报告与授权的临时 archive；未修改源码、业务状态或 commit。读取源仓库 `git status --short` 为 clean。

## 生命周期与订阅判断

`thread-workbench.tsx:47-61` 经既有 RuntimeModel.subscribeTo 只选择 `state.view !== null`；getSnapshot 同样返回稳定 boolean。没有订阅整个 runtime view 或新增可写事实。RuntimeModel bind 先清空 view 并发起正式 inspect，ThreadModel 构造负责 bind，React 只读取该业务资源。回调依据 runtime 实例稳定，React 卸载/实例变更释放原订阅。

`thread-workbench.tsx:63-80` 在当前意图不存在、相同意图已经实际定位、展示仍 inert/transitioning 或 needs-answer 尚无首投影时不调度。待条件变化后执行 RAF；cleanup 取消旧 frame。`attention-location.ts:33-35` 依据 `document.activeElement === target` 判断实际 focus 成功，成功才保存本次意图对象引用。AttentionModel.locate 每次明确定位均发布新对象，因此新的用户定位仍可触发；同一意图后的 Runtime revision/busy 变化不反复抢焦。

Thread 路由以真实 ThreadModel.key 隔离挂载；同 Thread search 保留编辑器/阅读面板。未增加 inspect/执行命令、副本 RuntimeView、回答、重发或资源创建。无 Main/Host/OMP 权限改动。

## 阅读预算与验证有效性

`app.css:504-506` 仅在 workbench 直接承载 attention-center 时为 thread-reading 保留 `4lh`。沿用现有行高与主题/密度、中心共享 control-height cap；既有 thread-setup 为 `flex-shrink:1; min-height:0; overflow-y:auto`，因此优先在已有 setup 滚动区域内吸收预算。reading、setup、reminder center 的滚动拥有者未互相替换，Composer/编辑器挂载未变。是否在 normal/compact、最小窗口完整满足预算仍需要新包实测。

`validation/m2/attention.mjs:627-675` 继续等待实际 DOM >=4 个提醒，并保留至少4行 reading、A_UNSENT_DRAFT、最后按钮实际 focus 与 center 边界、内部滚动断言。新增 reading/Composer rect 与实际 work-content/window 的交集检查，不仅比较两个可能共同溢出的内层盒子。真实 SDK 新 Thread 背景 completion/unread 样本机制沿用前版，无注入执行事实/数据库写入/伪造通知 callback。

`attention.mjs:274-319` focus probe 是 validation-only 被动 focusin/out/MutationObserver 观测，最多150条；等待 focus 的 finally 断开 observer/解绑 listeners/删除 probe 并写原始结果。未 dispatch 焦点事件或修改生产路径。outerHTML 截断500个字符仅用于隔离 fixture 验证记录，未变更默认产品诊断契约。

## 证据层级与实际执行

以下为独立读取 fixed head 内作者保留的原始证据，并非 reviewer 重跑：

- `attention-delayed-focus-red.txt` 实际挂载 React/RuntimeModel，hold inspect 后交互已出现但 activeElement 仍 body；795通过、1目标失败、2既有skip。命令实际跑了全量，未将其表述为定向红灯。
- `attention-delayed-focus-green.txt` 三个相关文件19测试通过；新用例还把焦点移回 editor、发布后续 Runtime revision 并确认不再次夺焦。
- `attention-reminder-engineering-check.txt` 工程链及34 architecture、74 tooling、796行为测试通过/2skip。此日志支持工程检查，不代表实际新包绿色。
- `attention-budget-cap-insufficient/package-log.txt` 保留真实63a候选红灯：9条提醒、center64/client64/scroll288、readingHeight0、lineHeight19.5、lastReachable=true、A_UNSENT_DRAFT。支持 cap-alone 不足，不把旧样本包装为当前通过。
- 先前两轮 native focus timeout 根因继续 unknown。一个63a真实 focus 路径通过不能反推此前失败原因；本增量的 held-inspect 回归证明可达缺口，不证明两次 timeout 均由该缺口导致。
- reviewer 实际执行：固定 delta `git diff --check`、archive harness `node --check` 均通过；未安装依赖或执行测试/构建。

## 未覆盖与交付限制

当前 fixed head 实际候选包尚待主 Agent 验证。未独立执行真实 macOS 桌面导航/最小窗口/主题密度几何、包 metadata/asar 身份或 Finder 重开。未声称系统通知送达、OS 显示/点击、Dock 行为或 native timeout 已解释。原 native m2.18 的失败系统通知与真实 Finder/Main 重开证据继续独立保留。

Standards 本增量发现数：0。Spec 轴由另一 reviewer 独立判断。

## 追加：validation-only 焦点恢复与密度等待

固定 base / 实际 merge-base：`48cd01cc60273d79e4ef2069389d585e8065e465`；固定 head：`78b863144b7894fd08369b8eea7b7ba3ecdf227d`。本段保留以上48cd生产结论，只覆盖随后验证脚本增量。`git diff --exit-code base head -- src package.json` 实际为空；生产产品仍对应 clean48cd App，不把78b验证记录当作新的生产构建。

输入使用 `git archive 78b863144b7894fd08369b8eea7b7ba3ecdf227d validation/m2/attention.mjs .scratch/m2-first-release/evidence/attention-budget-focus-probe | tar -x`，目录 `/tmp/m2-attention-standards-focus-probe.QV2hjF`，解包后 `chmod -R a-w`。未安装、构建、复制 App、修改源码/状态。源仓库状态读取 clean。

### 独立判断

未发现本 validation-only 增量新引入的高价值 Standards 缺陷。

1. 原 helper 保存 `previous`，聚焦末按钮并恢复 scrollTop；当 previous 是无法获得焦点的 body 时，`body.focus({preventScroll:true})` 无法解除末按钮 active 状态。随后恢复 scrollTop 可以把仍激活的末按钮放回可视区之外；下一次对同一 active 按钮调用 focus 不保证再次滚动。新 helper 在恢复前先 `last.blur()`，再 `previous.focus({preventScroll:true})`、恢复 scrollTop，并以 `document.activeElement===previous` 独立断言恢复结果。恢复发生在所有外部 assert 之前，即使几何断言失败也不会故意遗留探针焦点。没有通过手动 scrollIntoView/伪造事件使末按钮可达性断言自证。
2. 最后按钮原来的四边完整包含与 activeElement 断言、内部 scrollHeight>clientHeight、至少四行 reading、reading/Composer 实际 work viewport 完整可见、A_UNSENT_DRAFT 均保留。没有新增容差或放宽通过条件。focusBounds 增加 focus 前后 center、末按钮实际 rect、scrollTop/active/pixelRatio，并输出到失败信息；它只记录观测，不改变测量判定。
3. compact 与 normal 切换后等待真实根 `data-density` 到达对应值再继续；没有把点击返回视为外观更新已完成。密度值仍由既有产品状态/token 拥有，不额外写入根标记。
4. 原被动 focus observer 与150项上限/解绑路径未改变；本增量仅修正预算测量临时 focus 的恢复。没有新产品订阅、命令、事实写入或系统通知 callback。

### 原始失败与限制

独立读取固定 head 内 `attention-budget-focus-probe/package-log.txt`：light/compact、4条、centerHeight60/client60/scroll120、readingHeight78/lineHeight19.5、readingVisible/editorVisible=true、草稿保留；last active=true、scrollTop0、末按钮 rect147–177，center57–117，lastReachable=false。记录支持“激活与可见性不同”及旧 helper 的污染机制。原记录没有保存测量前 `previous` 身份，因此不单凭日志认定 body 恢复是该运行的唯一根因；README 的根因陈述与原始观测需区分。新恢复断言与实际新 harness green 仍是验证该解释的重要后续证据。

主 Agent 描述首次normal几何通过；当前 archive 的失败日志直接记录 compact失败，未据此宣称完整主题/密度通过。reviewer 实际执行 archive `node --check validation/m2/attention.mjs`、固定 delta脚本 `git diff --check` 均通过。新 harness 实际 green 待主 Agent 验证；未重跑真实 Chromium/macOS探针，不声称先前 native timeout 根因已解释。

## 追加：validation-only 新 Thread DOM 准入

固定 base / 实际 merge-base：`78b863144b7894fd08369b8eea7b7ba3ecdf227d`；固定 head：`adcd4d357e0400f3d6eeaeca4dcec4f6953e1820`。`git diff --exit-code base head -- src package.json` 仍为空，保留48cd生产结论。本次固定 archive `/tmp/m2-attention-standards-thread-race.QwsTh9` 包含新 harness 与原始 dom-race 证据及焦点归因修正文档，解包后 chmod 去除写权限；没有安装、构建、App复制、源码或状态修改。

Standards 无新增高价值缺陷。

`newThread` 先从只读 Main 数据库等待 active_thread 改变，再在同一次 DOM evaluate 中要求当前导航按钮完整 Thread UUID 后缀匹配、实际 contenteditable 存在且无 inert 祖先、runtime-panel 显示实际就绪文案。固定产品 project-threads 按钮 title 的确由 directory + 完整 threadId 构成，aria-current 对应选择；ThreadPage 保留旧 route 工作区时以 transitioning={!selection} 设 inert，等真实身份一致才解除。因此新联合条件可排除“Main 已改变，而旧 ready runtime/保留 route 仍在”的已知 helper 窗口，没有绕过输入准入、手动删除 inert 或创建假资源。读取实际模型/DOM，未改变产品发送或执行事实。

原 `attention-new-thread-dom-race/package-log.txt` 为48cd产品、78b harness 的实际运行：insert 阶段对 null 的编辑元素调用 focus 导致 TypeError；失败早于该运行预算/native结论，不能宣称绿色。原日志证明 helper 当时没有实际编辑元素，未记录完整瞬时状态，故具体调度路径由源代码解释，不把每一种 route 时序当作已实际捕获。

预算 helper 新增 `priorFocus:previous?.tagName`，能区分 body/button 等原活跃元素类别；真正的恢复断言仍比较原 DOM 引用，未用 tagName 代替身份。既有四边可见性、真实 focus、scroll、4行阅读、viewport、draft 条件保持原样。README 保留原始历史陈述并追加独立复核限制，明确此前未采样 previous，body 只是可达 helper 机制而非已证唯一原因；没有覆盖或改写原始运行日志。

实际完成固定脚本 diff-check 与 archive node --check，均通过；源仓库状态读取 clean。正在运行的新完整实包 green 不属于当前 reviewer 已验证事实。生产源码未改，不重新推断系统通知结果或先前 native timeout 根因。
