# M2 提醒交互定位超时：独立原始核查

## 固定输入

head：`63a578f02ec3c3ce5b901d8c113094c2e5b37953`。采用固定 SHA 的 git show，并将相关源码/合同/harness git archive 到 `/tmp/d-pi-attention-focus-spec-input`，不依赖主工作树新修改。只读覆盖 ThreadWorkbench、attention-location、AttentionCenter.open、ThreadPage/Router、AppModel/ThreadModel、RuntimeModel/RuntimePanel、Composer/plain editor/DraftEditorCache，以及实际 timeout log 与隔离 failure-dom。未启动 App、改源/状态、构建或复制候选。

## P2 / Spec：一次性 RAF 可先于实际交互 DOM，后续不重定位

位置：`src/app/renderer/workbench/thread-workbench.tsx:46-59`（定位 effect 的 `[target, props.readingView]` 依赖），`attention-location.ts:14-25`（目标缺失/fallback）。

要求：navigation.md 的待回答点击定位当前交互；Renderer reload 后 Main 保持观察，点击提醒仍应进入真实目标。导航已到 Thread 不等于其异步 Runtime 投影已经渲染。

触发条件及实际源码链：

1. harness 在后台 Thread 产生 needs-answer 后明确执行 Page.reload（attention.mjs 约 249），新 AppModel 只 restore 当前 A。提醒镜像可从 Main 知道 B needs-answer，但 B 的 Renderer RuntimeModel 尚未存在。
2. 点击 B 提醒时，AppModel.acceptRestore 可新建 B ThreadModel。其 constructor 调用 RuntimeModel.bind；bind 将 view=null 后发起异步 inspect。RuntimePanel 在 view=null 时只渲染 loading p，没有 runtime/interaction 定位标记；后续 inspect 回包或 runtime stream 才发布实际 interactions。
3. AttentionCenter.open 等待 Router 导航、校对 Main/model/route 后发布 locate(entry)，但没有等待实际 Runtime view/interaction DOM。ThreadWorkbench 仅安排一次 RAF；若 B inspect 尚未回包，locateAttention 找不到 interaction（甚至没有 runtime fallback）便返回；如果已有 runtime 而 interactions 稍后到，则焦点停留 runtime fallback。
4. RuntimePanel 是独立 store subscriber；它稍后渲染 interaction 不改变 ThreadWorkbench 的 target/readingView，effect 不再执行，locationStore target 也不会被自动重新发布。因此用户已经进入 B、真实待答 DOM 随后出现，却没有定位到该交互。该分支无需 Composer 抢焦或任何执行事实伪造即可发生。

这是由允许延迟的真实异步 inspect 路径与一次性 DOM 查询可确定触发的缺口；建议主 Agent 用“reload 后 B inspect 回包晚于首定位 RAF”的确定性 React/Router 回归独立复现，而不是对现有 timeout 先改成多轮盲目 focus 或放宽断言。

最小修复方向：保留定位意图，等对应 Thread 当前 Runtime/interaction DOM 可用且工作区不 inert 后再完成定位；只对同一有效意图补一次必要定位，成功后不随普通 Runtime revision 反复夺焦。缺收据的 failed runtime fallback 语义、已过期提醒 current-state 展示、needs-answer 不答旧请求继续保持。可通过目标渲染就绪回调或窄订阅相关 availability 实现，无需新业务 Runtime/全局 observer 或持续轮询。

## 两次实机超时根因仍 unknown

`/tmp/d-pi-attention-m2.19-final-native-log.txt` 记录 aoX9sl 在 attention.mjs:284 的 activeElement.closest(interaction) 等待超时；之前 0nNJMN 同位置超时。failure-dom 是 textContent 转储，证明最终待答文本存在，但它不包含定位当帧的 activeElement、interaction 是否已存在、workspace.inert 或 focus 变化时序，不能把本项源码缺口直接冒称为两次 timeout 已证实根因。

建议有界观测：记录 location 意图发布、ThreadWorkbench RAF 执行时、Runtime inspect 回包/interaction mount、inert 解除这几个时刻的 Thread/trace/event、target existence、activeElement 简短 tag/class/目标标记和 focusin/focusout（无正文/秘密）。若定位时没有 interaction、后续挂载且不再 focus，本项就是该次根因；若已存在，则继续区分 inert/focus failure 或后续实际焦点转移。

其他调查结果：

- ThreadPage 以 route/model 身份匹配生成 selection，保留旧视图时才 transitioning=true；AttentionCenter 在导航后又核对当前身份。因此仅“inert 可能未解除”不足以确认根因，尚无实际帧证据。effect 当前也不以 transitioning 变化重新定位，但不单列为已证实 defect。
- App 自有 Composer 普通挂载未找到无条件自动 focus；focus 调用归附件应用或用户显式按钮，DraftEditorCache restore 仅 updateState。没有证据把 Composer 常规生命周期归为抢焦根因。第三方 Editor/Chromium 当次行为未实测。

结论：独立确认 **1 项可触发 P2 源码缺口**；两次实际 timeout 的归因保持 **unknown**，需要上述观测或定向红灯。未降低 harness 的实际交互 focus 要求，未声称本次定位已修复或 macOS 验证通过。
