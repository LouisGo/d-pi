# 会话组件体系：实施与交接

## 推进与交接

2026-10-11 用户授权当前目录直接实施 WB00、WB01，起点 main `78d4f73`。后续会话先读[完整原方案](../../docs/product/session-components-plan-2026-10-11.md)和本文件，再补目标合同/源码。本文件是 WB00–WB08 唯一实施跟踪；原方案保留原始研究正文，其旧基点审计不是当前事实。本轮不实施 WB02–WB08，不推送远端。

原文 SHA-256：`19fa801aa4589a54b9d2e42213cbeac0e1f4c0c8d239d90b133c53aba4771bfa`。工程、试用、用户认可独立；本轮WB00、WB01工程完成并交付Dev源码与操作步骤；未宣称实机GUI或用户认可。

## 工作包

2026-10-11 接力授权：从本地 main `268d91b`（clean）串行推进 WB02–WB04；WB05–WB08 留待后续。不推送、不发布。原方案完整验收保持有效，上述 WB00/WB01 限制只描述上轮范围。本轮先完成裁剪前语义/生产 Body，再交错落实 demand、读取和资源预算，最后装配完整交互；关键 milestone 独立 review。

先行 API：conversation/contracts 的 `ToolSemantic` 为纯判别联合，保留 transportTool/effectiveTool、intent/result 阶段、partial/truncated 与原生路径/范围/patch。`decodeToolSemantic(name, args, result, phase)` 在 Host 和历史 adapter 通用裁剪前调用；Renderer 不解析 native JSON。结果仅为有界阅读投影，不授予文件权限、不证明磁盘当前版本或 Agent 因果。read 的 url/proc/cfg 与 write 的 xdev/proc/非文件目标先解包；不能解包的有效操作降级 generic，详情继续使用 WB01 Source/Surface。

| ID | 依赖 | 状态 | 验收条件 | 验证证据 / 下一步 |
| --- | --- | --- | --- | --- |
| WB00 | 当前运行基线 | complete | 18.8.9 实际依赖；A/B 回答独立结果；同目标单次发送；草稿跨卸载；代次隔离；written 与原生结束分开；stop 独立 | 下方 WB00 证据；已与WB01合装，待用户试用 |
| WB01 | WB00 | complete | 命令卡→实时详情→pin→切 B→明确 B 草稿引用→回 A 原成员；有界摘要、final 对账、coverage、关闭释放、旧导航不抢占；键盘入口 | Source/Surface/reader/FrozenContext 与命令卡/Inspector 已装配；主矩阵143项与最后受影响31项通过；独立review已闭合；下方Dev源码试用交接 |
| WB02 | WB01 | implementing | 活动组、常用 read/search/edit、轮次、变化摘要真实 | 裁剪前语义与生产专用Body已接，活动结构/来源导航仍待完成 |
| WB03 | WB00；联调 WB01/02 | planned | demand/范围读取/字节缓存/Worker/Viewer/native warm 有界 | 本轮已授权，随WB02交错落实资源策略 |
| WB04 | WB00、WB01 | planned | 多题/权限/超时/unknown/回答历史完整 | 本轮已授权，后续原生ask/approval与持久历史 |
| WB05 | WB01、WB03、WB04 请求事实 | planned | 任务→子代理→Job→使用量/策略/资源 | 后续真实 owner scope 合同 |
| WB06 | WB01、WB02、WB04 | planned | Plan 到安排执行；Diff/消息反馈；精确分叉 | 后续原生能力与反馈协调 |
| WB07 | WB01、WB02、WB03 | planned | 搜索定位与专业 Body 复用来源/详情/资源 | 后续专业结果合同 |
| WB08 | 真实需求和能力协议 | conditional | 独立外部资源能力可验收，不阻塞核心 | 终端/多窗口继续沿用各自授权，附件计划不构成授权 |

## WB00 起点复核（78d4f73）

- 起点存在（现已由WB00修正）：RuntimeModel.request 共用 requestGeneration，较早回答失败可被较晚独立动作丢弃；NativeInteraction 的 value/selection/sent/answered 和 RuntimePanel followUps 归 React，切换丢失。
- 已升级项：package.json/lockfile 为 OMP 18.8.9；复用[升级规格与证据](../omp-sdk-1889/spec.md)，继续核对已安装 SDK 与资源 manifest，不重复全套升级验证。
- Host PendingInteractions 已按题目单次准入；本轮保留并补精确结果关联。普通 answer 的 acknowledged 仅本地 write 无同步抛错，需改名 written；SubmissionReceipt ACK 不变。
- WB02/03 审计（全文传输、历史字节预算、后台 demand 等）不在本轮重复审计或冒称修复。

## 先行合同与拥有者

- RuntimeView 只表示最新运行事实，operation 按 traceId、Thread、连接代次、kind、requestId 关联；不以 view revision 或其他操作淘汰独立结果。Main 等待具体 Host operation-result，Host 兜底原生单次发送。
- Thread-owned RuntimeModel 拥有交互草稿、选项、follow-up 收据关联与操作观察；React 只订阅和编辑。not-dispatched 可编辑重试，dispatching/written/unknown 锁住原回答；原生结束独立显示。仅保留当前连接最近有界题目与历史，旧代次不复用同 ID；持久完整回答历史在 WB04 处理。
- 窗口拥有 Surface/导航意图与详情读取 lease；Thread/Host 拥有执行，close 不取消命令。来源带 Thread、真实会话/连接/工具身份，live 稳定实体与内容版本分开；无法映射 native record 明示 live-only/partial。
- input 拥有 FrozenContext 编码与草稿语义插入；引用发起时捕获目标 Thread/draft revision 和内容版本，不从 await 后当前 Thread 取目的地。活动 editor 通过单笔 transaction 插入，未挂载 controller 语义插入；旧意图不可复活 Surface。

## WB01 milestone：来源与读写入口（2026-10-11）

- 已接原始工具详情 reader、单Thread共享MessagePort broker、可信 native-record cursor 读取、WindowWorkbench peek/pin/lease/导航ticket、命令卡/Inspector 和 contextReference。进度是按内容版本替换，final 原生记录ID单独关联；没有使用卡片裁剪文本充当完整详情。
- 输出每项256KiB/参数32KiB，Host2MiB/64项，窗口8 Surface，FrozenContext64KiB。当前引用界面标出具体目标 Thread 草稿，冻结selection与新输出分开；关闭仅释放读 lease。
- 新增红灯覆盖原始详情入口、独立封套、冷 editor 插入；追加真实保存确认后 Undo 反例，修复冷缓存 revision 同步，仅随对应本地保存确认。15个相关文件126/126通过（Main native history、Host scope/projection detail、Preload broker、草稿/编辑器/剪贴板、窗口协调/保存阅读/路由）。
- main/host/core/preload typecheck 通过，Renderer仅既有composer-tag data-file-icon类型失败。architecture、结构生成、design/i18n/interaction通过。尚待固定范围独立review与完整生产Router/卡片/Inspector/草稿组合回归；本milestone不宣称WB01验收已完成。

## WB01 milestone：边界复核与生产组合（2026-10-11）

- 独立 review 固定 `32b3e0e..22935bf` 确认4项：保存等待后旧导航仍派发、历史固定读取依赖active Thread、record cursor重读丢调用参数、完成记录仍受live缓存淘汰。均已用可达回归核实并修正，正在刷新独立覆盖。
- 保存之后、切换派发之前复核ticket，新Surface/非会话路由使旧返回失效。窗口协调器通过Query读取适配器补读原成员，最多16页；晚到页不定位旧导航。返回经实际ReadingWindow挂载原行并聚焦阅读区。
- 原生详情按捕获Thread绑定和sender校验，允许固定A后切B；可信冻结前缀扫描最多16页/16MiB，关联实际祖先调用参数，独立读取原始输出而非卡片投影。收到真实nativeRecordId后转接持久reader；失败保留最后已观察版本并提示，关闭仍只释放读取。
- `node scripts/testing/test.mjs vitest` 本milestone 16文件143/143通过，含 `tests/integration/tool-workbench-chain.test.ts`：真实Host/Preload broker/Router/命令卡/Inspector/Tiptap的A→B冻结选区引用、保存、单笔Undo/Redo、回A虚拟成员/焦点、Escape释放；只替代原生IPC与几何。输入准备链路保留FrozenContext正文，输出里的附件样式token不被解析。
- main/host/core/preload类型通过，Renderer仍只有既有composer-tag.tsx:134基线。架构、结构生成、design/i18n/interaction通过；Impeccable对新增UI源码/CSS扫描无主发现，初次context-reference路径错误后只补扫正确文件。组合回归有React异步act提示，断言均通过；不声称Chromium视觉、原生IME、真实供应商或用户认可。

复核补充：组件页分支现也取消旧来源ticket，红灯复现后“补页等待→组件页→晚页→回A”回归通过。并核对固定OMP的BashToolResultBuilder/output-meta：真实 `details.meta.truncation`、limits、artifactError及非文本内容继承partial，App预算内的原生尾部也不能标完整；Host反例先红后绿，历史原始读取同用此判定。完整artifact展开仍归WB03。

## 本轮完成与Dev交付（2026-10-11）

- 提交：`c7528af` 落盘完整原文与唯一跟踪；`32b3e0e` WB00；`22935bf` WB01来源/详情/草稿装配；`aeee846` reader/导航边界与生产组合；`9819277` 导航全部入口及原生coverage。当前main；没有远端推送或发布。
- 独立综合review覆盖WB00及WB01固定范围。WB01首轮4项修正、次轮组件页取消缺口已全部闭合；最终 `aeee846..9819277` 无可行动高价值问题。review是源码/回归内容复核，不冒称reviewer代跑测试。
- 自动化：WB00相关82项和Main独立操作2项；WB01主矩阵16文件143项、剪贴板3项；最后新增修正后复跑5文件31项（与主矩阵重叠，不相加为总数）。真实生产组合仅替代IPC和几何；未做Chromium视觉、真实provider、系统IME或用户验收。已确认固定SDK18.8.9及资源哈希。
- 静态：main/host/core/preload类型，Biome，design/i18n/interaction，architecture、结构报告、文档引用和工具环境通过。Renderer仅既有composer-tag.tsx:134类型失败；完整Main integration原有保存附件展示断言失败沿用WB00记录，不冒称全库绿色。未运行固定包/发布。
- 可验收预算：Host每项输出256KiB/参数32KiB、总2MiB/64项；窗口8 Surface；冻结引用64KiB。可信持久来源扫描/返回补页最多16页；资源跨页、artifact完整读取与更大历史资源策略归WB03，超限或已截断均明示。

### 试用步骤

源码已提交到当前目录。日常使用 `pnpm dev`；当前已有Dev从本轮Main/preload修改前启动，Renderer HMR不能更新新IPC。请在结束当前执行后退出旧Dev，再从本目录运行 `pnpm dev`，沿用已有开发数据。这里交付源码和步骤，没有把已有进程当新构建。

1. 在Thread A找到实际bash/exec命令卡，打开实时详情；固定详情，选取输出文本。摘要有界，详情保留独立版本与partial信息。
2. 切到Thread B，确认详情底部显示明确B草稿目标，再引用选区。检查B草稿新增上下文块、A不被写入，Undo/Redo各一步；B保存后仍保留冻结内容。
3. 返回来源，确认切回A的原工具成员并聚焦阅读区；若成员未加载则有界补读，来源失效/超预算明确提示。新的导航或组件页优先于旧定位。
4. Escape关闭详情，确认只关闭阅读，不取消执行。待回答时填写草稿后切Thread再回，检查输入/选择与发送状态仍保留，written与原生结束分别表达。

下一轮首先读取[完整方案](../../docs/product/session-components-plan-2026-10-11.md)和本文件，按依赖推进WB02；WB03资源策略、WB04完整问答历史等仍未实施。用户反馈到来前acceptance保持pending。

## 验证和偏差

### WB02 milestone：裁剪前语义与专用 Body（接力，2026-10-11）

- 先写 ToolSemantic schema/API，再以5个decoder反例、实时Host/持久record两条边界和生产Conversation三种Body红灯驱动实现。固定本机OMP18.8.9 read/write/xdev/edit/grep/find官方类型为依据，不导入终端依赖。
- read范围/显示正文、search文件/真实range和计数、edit原生patch/部分失败/snapshotsPruned在通用JSON裁剪前保留；write包装edit分派，URL/proc/cfg/xd非文件操作不冒称修改。Body沿用同一详情Surface/冻结引用/返回，专用搜索只过滤已加载结果，原生读快照与当前文件/Git分别表达。异常边界保留可得原文和工具执行状态。
- 当前5文件71/71通过（decoder/Host/native-history/生产Body/既有真实Workbench组合）。Core/Host/Main类型通过；Renderer仅既有composer-tag.tsx:134基线失败。design/i18n/interaction、architecture通过，结构/看板已生成。组合有既有React act提示；未做本milestone实机/供应商/IME，不宣称WB02完成。
- 下一步：固定本milestone独立review并闭合；增量ActivityReadModel与真实轮次/来源定位，WB03范围与缓存/demand随后交错实施。WB04尚未实施；goal保持active。

### WB02 milestone：调用归属、增量活动和生命周期（接力，2026-10-11）

- 本地参考源码已核实：同级 `../t3code` HEAD 为 `a908a7ac8780c5b4d6fb0bed8945d640f69d2d1d`，不同于原方案研究基点；读取 `MessagesTimeline.logic.ts` 的真实 run/attempt 分组及 `work-log/presentation.ts` 的失败保留汇总。采纳阅读结构与失败保留原则，不移植 T3 runId 到 OMP，也不引入其执行调度或 UI 依赖。原生合同仍以已安装 OMP18.8.9 `modes/rpc/wire/events.ts` 及工具源码为准。
- 首轮固定 `268d91b..00fa7fa` 独立review确认两项P2：search/edit正文隐藏原生错误/后置警告、ast_edit形状误路由。已以实际失败回归修正：所有专用Body保留有界原生输出与警告；缺少修改details的结果不把intent路径当变更；ast_edit降级正式generic，保留未应用预览。类型化原生失败传入decoder。单Body异常/新版本恢复回归保留执行事实；Host预算压缩语义到显式budget兜底。
- 新增Thread-owned `ActivityReadModel`，只保留成员身份、小状态和组摘要。Host依据assistant实际toolCallId/name登记归属，持久reader依据真实祖先链登记同一call batch；未知关系独立显示，不以时间邻近或用户消息推断。普通进度只更新成员与所属组的不可变索引，稳定rows引用；结构变更才重建成员顺序。合并优先阅读锚点/可见组，拆分保留锚点所在组，alias最多64；展开随Thread模型保留。选区/焦点占用时延后结构变动，后续进度以单项事实覆盖待处理旧状态。
- 生产live/saved阅读窗口已接活动组，成员仍独立虚拟行；失败/中断/运行中计数不因折叠隐藏。精确返回先展开来源成员，再由ReadingWindow挂载和聚焦，组ID不替代成员ID。真实Router/Host/Preload/Inspector/Tiptap组合追加分组→折叠→固定A→切B引用→返回A成员回归；两种链路均通过，仅替代IPC和几何。
- OMP真实turn_start/turn_end观察只附原生turn outcome，不结算App submission/后台工作；toolResults失败和unknown分别保留。retry、compaction及model_changed有类型化阅读行；事件未给原生时间时明确显示本地观察时间。冷历史没有这些原生事件则不重建不存在的生命周期。
- 9个受影响文件109项通过，新增分组组合后该组合2/2通过；待本milestone收尾再刷新相关门禁和固定review。Core/Host/Main类型通过，Renderer仍只有未改动composer-tag.tsx:134基线。已有React act提示保留记录；不冒称实机、真实供应商、IME或完整WB02验收。
- WB02仍待代码位置/文件版本的SourceTarget、工具证据与当前Git sample的变化汇总、生命周期组合进一步核实；WB03完整资源/范围/Worker策略和WB04完整交互尚未完成，继续当前授权，不推送、不发布。

收尾补充：组内被延期的结构不会用旧输入回退后续进度（反例先红后绿）；分组与未分组真实来源组合2/2，最后三文件70/70通过，与上述109项重叠、不相加。必要类型与design/i18n/interaction门禁通过；结构报告在最终源码后刷新。固定综合review随本地milestone提交继续，不把本段当完整工作包完成。

按行为逐段 TDD：独立回答/双击/重连/重挂载，详情更新与final，跨Thread草稿/Undo/来源定位/lease释放与晚到导航。只跑相关类型、行为、边界和文档门禁；必要的真实 SDK/生产链路验收有界执行，不重复 provider/系统 IME 或包矩阵。

WB01 合同细化：resources/contracts 是无反向依赖的来源叶子；sourceRef 仅 provenance，不授予文件或执行权限。Host 原始工具输出 reader 通过现有 MessagePort 订阅，与 timeline 摘要分离。窗口最多8 Surface，共享 reader；每工具输出256KiB、参数32KiB，Host 总缓存2MiB/64项，预算或缺失生命周期标 partial。关闭释放读取 lease，不发送 abort。FrozenContext 使用独立长度封套和原生来源，范围为冻结版本的 UTF-16 偏移，选区最多64KiB；唯一 Thread 草稿用 threadId 标识，revision+sequence 防竞争。当前挂载 editor 单笔 undo transaction，未挂载语义写入并保留缓存 undo。返回捕获导航 ticket，后续导航/关闭使其失效。待完成切片后追加实际命令、结果、提交、review 与未覆盖范围。

### WB00 milestone（2026-10-11）

- 先写 InteractionOperation/InteractionDraft 与执行模块合同。红灯确认同题双击两次派发、Host respond 缺失；实现后对应反例转绿。Thread-owned RuntimeModel 保留表单、冻结回答、操作结果和后续收据关联；Main 等待精确 Host 结果，授权 await 后再次校验代次，Host 单次 write 兜底。普通 interaction 状态和 answer operation 改名 written，收据 ACK 不变。
- `node scripts/testing/test.mjs vitest` 针对 runtime-model、interactions、session-host、host-operation、native-interaction 五文件：82/82 通过；组件重挂载恢复草稿/发送锁。Main integration 按 `-t 'independent answer writes|control and answers'`：2/2 通过，覆盖 A unknown/B written、同题并发拒绝、stop 独立、旧代次和撤销授权。
- `pnpm check:environment`：实际 installed SDK/manifest/bundle 为18.8.9，资源哈希与运行环境零问题；复用原升级证据，未重复打包/供应商/恢复矩阵。当前源码旧 mux/ModelHub/compaction 数值使用点检索未发现需要移植的旧 API。
- main/host/core typecheck、architecture、interaction/i18n/design lint、结构生成通过。Renderer typecheck 唯一失败为未改动 `src/modules/ui/renderer/composer-tag.tsx:134` 的既有 data-file-icon 属性类型；完整 Main integration 有1个既有保存附件展示断言失败，原[升级组合证据](../omp-sdk-1889/evidence/integrated-validation.json)已记录同类基线，未将整套标绿。未运行实机和真实供应商。
- 独立综合 review 固定 `c7528af` 后的19文件快照，覆盖 Spec/Standards，未发现可行动问题；源码检查不冒称 reviewer 代跑测试。随后增加 Main 同题并发/stop/独立结果回归，修正 transport 等待中断保守映射 unknown，并再次局部核对。
- 保留策略是当前连接最多32题、Main最多64结果、每题最多32 follow-up IDs，窗口/Thread dispose 释放；关闭窗口后的持久回答历史仍由 WB04 完成，不能用本轮窗口内历史冒称完整历史。

```project-status
[
  {
    "id": "session-components",
    "title": "会话组件体系 WB00–WB04",
    "phase": "M2",
    "engineering": "in-progress",
    "trial": "delivered",
    "acceptance": "pending",
    "next": "推进WB02活动语义/结构，与WB03资源策略交错，再完成WB04完整交互",
    "evidence": ["../../docs/product/session-components-plan-2026-10-11.md"],
    "constraints": "本轮授权WB02–WB04；WB05–WB08后续，不推送或发布，用户验收pending"
  }
]
```
