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

第二轮固定 `00fa7fa..2c3ee74` 综合review新增两项P2，已以失败反例修正：仅冻结与选区/焦点关联的旧/新分组连通片段，无关prepend/append继续发布；Core与生产阅读窗口共用成功原生result路径计数，intent/progress/failed均不计为变化，专用Body同步标为计划路径。生产saved→live回归保留旧DOM、选区与键盘焦点并显示新回复；相关四文件47/47通过（含既有React act提示）。继续WB03/WB04，不将本次闭合作为完整WB02完成。

### WB03 milestone：窗内广播、正文 demand 与真实 append（2026-10-11）

- 前段修复提交 `c4a90b8` 经固定独立复核，两项P2闭合，无新增可行动高价值问题。当前保留其生产选区/焦点回归。
- Preload runtime/submission/attention/locale/configuration 每类广播一处schema入口；runtime与submission按真实Thread身份路由，无Thread的failure不广播猜配到各Thread。RuntimeModel在bind时注册所属Thread，SubmissionModel沿用固定Thread注册；直接请求仍核对原trace/身份。
- 每窗只有一个runtime:port入站listener，各Thread独立port承接timeline与资源reader。最后一个timeline消费者退出时发送typed demand=false并释放Preload正文镜像；固定Inspector reader独立保持。ThreadModel切后台释放ConversationModel订阅，保留Runtime/提交事实；返回或序列缺口请求当前generation/seq快照。Host保持有界事实投影，非需求期间不向timeline分发；恢复覆盖由真实snapshot/gap表达，不把暂停视为丢包。
- native delta-only批次以append DTO输出，metadata不重复携带累计正文；同一schema合同codec供Preload/Core按generation/seq接入，缺少append base触发已有有界重同步。snapshot、replace与final分别标记；有message的累计快照和OMP partial不当append。预算对已证明append只计算新增JSON文本bytes，含JSON转义和跨批surrogate修正；超预算仍退为显式truncated/coverage。
- OMP18.8.9 `pi-agent-core/src/agent-loop.ts` 的partial callback只声明opaque result，arg-stream emit也是opaque preview；`event-controller.ts`使用updateStreamPreview替换，不提供统一append保证。本段只对明确message text/thinking delta使用追加；累计来源的派生成本与工具replacement bytes仍需生产trace记录。
- 14个相关文件128/128通过，包括100批delta的25,600字符传输及不反复stringify累计正文、JSON预算、缺失base/旧代次、后台事实/固定reader/返回快照和真实Workbench两条组合。该组合仍有既有React act提示。历史范围/cache/Worker、离屏轻展开、Viewer/native warm预算、生产Electron trace及WB04尚未完成，goal保持active。

### WB03 milestone：有限历史范围与轻阅读状态（2026-10-11）

- 原生JSONL增加有界tail和previous冻结游标：普通范围1MiB，单长记录仍沿用32MiB许可；保持Main路径、原生身份、前缀版本与读取后复核。读取目标范围不解析无关旧记录；不把tail称为完整历史。SavedConversation从尾部进入，早期内容明确向前读取；gap保留覆盖提示，不再触发自动全历史补页。当前定位沿既有最多16页尝试，完整索引/Worker仍待后续。
- 单会话正文缓存按UTF-16 payload字符串及scalar/key计量，默认8MiB/16页；保留连续范围和可重读游标。单个完整长记录与必要锚点/选区/焦点占用可以超过普通 allowance；这是读取策略的计量，不是RSS测量。窗口历史LRU增加32MiB字节门限，已挂载/in-flight读取不强制退休。去掉跨回收页无限保留的record-ID集合，实时/持久别名随驻留身份回收，阅读锚点继续由Thread持有。
- 离屏details/aria-expanded不再永久钉住DOM；Thread-owned轻状态最多1024行、每行64个disclosure布尔值。回到范围恢复展开，选区、键盘焦点、打开阅读弹层和streaming仍保留必要挂载。
- 1000次4KiB追加回归先复现1001页累积，再验证配置预算、最新内容、回收范围游标、选择保护及释放。原生tail/长完整记录+未提交尾巴、生产gap不扫页、阅读恢复及LRU共六文件70/70；追加保护回归后history-query为12/12。Core/Main/Preload类型、设计/i18n/交互检查通过；Renderer仍只有既有composer-tag.tsx:134 TS7053。读取operation/Worker、完整artifact、Viewer/native warm预算和生产Electron trace仍未完成，不将milestone视作WB03整包验收。

固定 `c4a90b8..dad51e6` 独立Spec/Standards review未发现可行动高价值问题，未代跑测试且不覆盖本轮历史/离屏WIP。

固定 `dad51e6..61790ab` review发现组标题焦点/锚点未映射成员record的P2，已用生产缓存回收反例复现（旧成员页被淘汰）。保护集合先展开真实group member keys，再映射record；焦点与组标题锚点两条回归及saved阅读27/27通过。后续独立覆盖继续核实；其余范围/cache/轻状态未发现明确高价值问题。

### WB03 milestone：历史页操作与受监督 Worker（2026-10-11）

- 固定 `61790ab..c8372ad` 独立 review 确认组标题焦点/锚点保护问题闭合，没有新增可行动高价值问题；只覆盖该提交范围，未代跑测试。
- 历史页复用 Main 的读取 operation，传递同一 operationId/traceId；Preload 校验回包身份，Query 取消向所属 sender 的 Main 取消桥传播。切 Thread 后原 owner 仍可取消旧读取，其他 sender 无法取消。ACK 或 Worker payload 都不释放名额，实际退出后才完成；晚到结果不进入已取消 Query。
- Main 拥有 trusted root、绑定、sender 和请求前后 Thread 身份复核；原生文件路径/header/冻结前缀及读取后文件复核沿用 conversation/main 只读适配器，在单次 Worker 内运行，不把 Renderer 路径当权限。Worker 默认最多2个、无无界等待队列，关闭/取消等待 exit；Node `trackUnmanagedFds` 负责退出时描述符清理。JS heap 限额128/32MiB与现有32MiB原生记录限额分开，未声称 ArrayBuffer/RSS 被 heap 限额约束。参考同级 T3 `claudeHistoryWorker.ts` 的独立入口和 import 无启动副作用原则，不迁入其 SDK fork 或执行行为。
- `pnpm build` 已实际产出独立 history-worker.js。`node` 与 `pnpm exec electron validation/m2/history-worker.cjs` 使用真实构建 Worker，约3.6MiB/400条原生记录取得115条尾页、115条冻结前页及1条追加，均3次退出、active=0；运行版本 Node24.21.0/Electron44.4.5。Main heartbeat可继续执行，但此 smoke 不等于完整 Workbench 延迟/FPS 或 GUI/provider验收。
- 本段四文件31/31及快速门禁通过，运行时集成51/51通过；既有保存图像 fixture 已对齐原合同要求的 index/name，未改变展示生产行为。Core/Main/Preload类型与架构测试通过。工具详情、图像、CLI目录读取、完整artifact和其余WB03/WB04仍待接入与验收，goal保持active。

按行为逐段 TDD：独立回答/双击/重连/重挂载，详情更新与final，跨Thread草稿/Undo/来源定位/lease释放与晚到导航。只跑相关类型、行为、边界和文档门禁；必要的真实 SDK/生产链路验收有界执行，不重复 provider/系统 IME 或包矩阵。

### WB03 milestone：同链路工具、图像与 CLI 历史（2026-10-11）

- 固定 `c8372ad..d548e3d` 独立 Spec/Standards review未发现可行动高价值问题；没有代跑验证，也不覆盖本段扩展。
- 工具详情、原生图像、CLI目录和历史页均复用同一Main operation限额/取消与2个活Worker上限。私有 task 按 kind 做Zod解码，Main继续核对捕获来源/实际绑定与读取后身份；Worker运行已有原生只读合同，不接受Renderer任意路径，不接管OMP执行。
- 图像与项目历史Query通过纯operation身份传播取消；Inspector最后一个Surface关闭、窗口dispose和读取超时均取消其原生读取，固定A切到B仍保留捕获A来源。关闭不会发送执行abort。先失败的图像Worker/Query和Inspector读取反例转绿；四种Main资源取消回归证明ACK之后仍占名额直到底层settle。
- 八文件105/105通过，包括51运行时集成、真实Workbench两条生产组合与历史集成（现有React act提示保留）。Core/Main/Preload类型、design/i18n通过；Renderer仍只有既有composer-tag.tsx:134基线。构建Main实际Worker在Node24.21.0/Electron44.4.5完成page/tail/backward/append、工具实际祖先参数、原生图像及CLI发现/读取，8次退出active=0。此smoke没有GUI窗口，不冒称完整Electron性能trace。
- WB03完整artifact/子会话读取、Viewer/native warm/可见性预算及生产工作台trace，WB02 SourceTarget和WB04完整交互仍未完成；继续现有goal，不推送或发布。

固定 `d548e3d..1e1e795` review发现P2：共享2个Worker满额时图片Query禁用重试，第三张可见图会停在不可用。已用正式MessageMedia+Query反例复现仅显示2/3张；对类型化retryable busy最多3次250/500/1000ms退避，每次使用新operation身份，持续占用后提供显式重新检查。生产三图与持续busy→停止自动尝试→手动恢复两条回归通过；读取取消和退出名额合同保持。该组合替代IPC准入/资源延时，未宣称实际并发Worker的GUI观测；Worker限额由既有runner/构建验证证明。相关query/saved阅读43项通过，新媒体2/2通过（总矩阵有重叠不相加）；必要Core/设计/i18n/架构通过，Renderer仍仅既有基线。其余固定范围无新增明确高价值问题；独立闭合继续核实。

### WB03 milestone：原生保存输出与独立 artifact 来源（2026-10-11）

- 固定 `1e1e795..6b86e11` 独立复核确认可见图片busy恢复问题闭合，无新增可行动高价值问题；没有代跑测试。
- 核实固定OMP18.8.9 `session/artifacts.ts`、`session-manager.ts`、`internal-urls/artifact-protocol.ts` 和 `tools/output-meta.ts`：保存文件位于原生会话同名目录，numeric ID与sanitized工具名构成文件名；structured metadata明确记录totalBytes、elidedBytes和保存失败。仅文本里的artifact URL不授予读取。参考本地T3 `attachmentPaths.ts` 的来源/路径约束原则；本实现依原生会话实际绑定验证，不复用其App附件路径或OMP全局跨会话ID fallback。
- Main沿捕获Thread/原生绑定发起同一operation，受监督Worker先验证原生result和冻结前缀，再只读声明artifact。最多2048目录项、单文件16MiB，拒绝目录/文件符号链接、重名ID、文件替换或非法UTF-8；macOS可信父目录alias先canonicalize，artifact目录自身仍禁止跳转。结束后复核原生冻结来源，取消等待Worker实际exit再释放。未保存字节、byte数量不符、参数缺失/截断或非文本部分保留partial，不把预览或head/tail样本称完整输出。
- 原生record、live工具和artifact为不同来源；artifact带parent recordRevision及内容SHA-256，冻结引用保留实际版本。普通预览仍限制256KiB，只有经过验证的artifact允许16MiB；选区引用仍64KiB、8 Surface限额和原工具返回锚点沿用。Inspector提供“读取已保存输出”，重开已有来源复用，关闭仅取消读取。
- 8个相关文件61/61通过，包含真实Main绑定/文件读取、10MiB正文、同大小变更拒绝、17MiB超限、elision/error/短文件/符号链接/重名、普通预览schema额度和正式Router/Host/Inspector/Tiptap三条组合（artifact→固定→B引用→Undo/Redo→返回A成员）。组合仅替代IPC与几何，仍有既有React act提示。Core/Main/Host/Preload类型通过；Renderer只有既有composer-tag.tsx:134基线。
- 构建Main Worker在Node24.21.0与Electron44.4.5实际读取10MiB artifact并返回独立版本，同时完成尾页/前页/追加、工具参数、图像和CLI历史，9次exit且active=0。该smoke无GUI窗口，不冒称完整Workbench trace、输入延迟或用户验收；`pnpm build`、快速门禁、design/i18n与40项架构测试通过；构建保留既有大chunk警告。WB02 SourceTarget/变化汇总、WB03 Viewer/native warm/可见性/子会话与生产trace、WB04完整交互仍待完成，goal保持active，不推送或发布。

### WB02 milestone：工作区来源、文件版本和代码定位（2026-10-11）

- 固定 `6b86e11..a900272` 独立Spec/Standards review已完成，artifact身份、权限、覆盖与取消/返回未发现可行动高价值问题；只读源码/测试审查，没有代跑验证。
- 应用层增加discriminated SourceTarget，组合activity/artifact、当前或已捕获workspace文件、带左右内容版本及side的Diff；纯代码坐标留在files/core。工具详情与文件导航由窗口拥有者发起，导航ticket捕获所属Thread；切Thread/新导航/关闭使晚到选择失效，路由和FilePanel在真实Thread准备后接同一意图，不保存DOM。
- read/search/edit正文提供“打开当前文件”。当前工作区采样与原工具输出/patch保留独立来源；原报告行号明确提示可能已随当前文件变化，不把采样冒称原生快照。只路由project-relative位置，拒绝越界、上级、scheme等，Main既有真实containment/读取operation仍拥有权限。核实OMP18.8.9 `grep.ts`、`glob.ts`、`file-recorder.ts`：结果展示路径相对native cwd；decoder保留实际cwd用于定位，不把search scope当cwd猜路径。
- FilePanel核对捕获directory和文件/Diff两侧版本；不符就显示来源已变化，停止该版本的Monaco呈现。CodeLocation依据实际版本、side及行范围调用Monaco定位/聚焦；旧版本、错误side、越界坐标不定位。原工具返回、固定详情、草稿Undo/Redo和FilePanel当前采样保持原合同。
- 新导航/坐标目标缺口先红后绿；正式Workbench组合3/3通过（新增工具路径→files路由→实际当前采样），FilePanel6/6覆盖普通打开、捕获版本匹配和file/diff版本冲突，Monaco16/16含3条真实adapter定位回归（边界替身，不是实机）。10文件矩阵62/66通过：navigation-continuity的4项失败已在修改前固定`a900272`隔离副本重跑，同样4失败/7通过，涉及旧Focus mode/Show controls/Thread tools入口；本段不改产品来迁就旧测试，也不冒称整套导航绿色。Core/Host/Main类型通过，Renderer只有既有composer-tag.tsx:134基线；build/快速门禁/design/i18n通过，保留既有React act及大chunk提示。
- WB02还需完整ChangedFilesSummary与来源组合；WB03 Viewer/native warm/可见性/子会话/生产trace、WB04仍待完成。当前保持goal active，不推送或发布。

来源导航收尾：实际TanStack Router同地址快捷路径跳过history准入，新增反例复现旧文件意图残留并修正；后到conversation/developer意图会取消旧文件导航，返回工具也取消旧定位。Router/窗口/正式Workbench三文件21/21与FilePanel6/6通过；定位对象只跟随明确新意图和内容版本，不因语言标签重绘再次抢焦点。40项架构测试、最终build及快速门禁通过；Renderer复核仅既有composer-tag类型问题。

### WB03 milestone：可见文件 Viewer 与定位提交（2026-10-11）

- 固定 `a900272..d4dfa42` 独立review发现P2：路径登记后提前结束ticket，延迟文件/lazy Monaco在Inspector新意图后仍抢焦点。已以FilePanel失败反例复现；ticket现覆盖实际定位提交，Monaco执行前复核最新窗口意图，实际定位/版本不可用等有确定结论后才结束。正式App Router→工具路径→延迟文件→选择固定Inspector→晚到正文回归保留Inspector焦点；原有三条引用/Undo/返回组合继续通过。
- 文件面板保留路径、browser状态、受限冻结选区和纯版本/坐标/滚动位置；阅读页、shell或document隐藏时卸载资源拥有者，取消最后一个只读Query reader并销毁Monaco/editor/models/Observers。重开重新采样，仅同一内容身份恢复坐标，不聚焦；file/diff仅当前模式保持正文读取。Query共享活动采样，含刷新失败的旧采样；无observer缓存warm预算明确为0（gcTime=0），没有活动工作执行abort。
- 对照T3 `DiffWorkerPoolProvider.tsx` 和 `StyledDiffCodeView.test.tsx` 的按需consumer/最终关闭释放；沿用自有只读Monaco。固定Monaco0.57.0 `editorWorkerService.js` 在最后一个model删除后关闭Editor Worker；未手动终止它仍持有的Worker promise，未复制Pierre池/策略。
- 七文件74/74通过；新增正式延迟导航组合后该组合4/4通过，与矩阵重叠不相加。FilePanel10/10涵盖隐藏页/隐藏窗口零读、取消/晚到、重开路径和焦点；Monaco20/20含轻坐标恢复、旧版本拒绝及lazy挂载前意图失效。Core类型通过，Renderer仅既有composer-tag基线；build/design/i18n通过，保留既有React act和大chunk提示。
- `pnpm exec vite validation/m2/viewer --config validation/m2/viewer/vite.config.ts --host 127.0.0.1 --port 5179 --strictPort` 配合 `pnpm exec electron validation/m2/viewer.cjs`：Electron44.4.5真实Monaco文件1 model、Diff2 models；关闭/原生window.hide后models/queries/Worker归零，重开目标恢复；Diff共启动并关闭3个真实Worker，最终0。fixture只替代文件/Git IPC，无原生Agent/provider；独立临时数据和窗口已关闭，不触及现有Dev。该证据不是全工作台生产trace/输入延迟/用户验收。
- WB02变化汇总、WB03折叠浏览器细化/原生warm/子会话/其余可见性和生产trace、WB04完整交互仍待完成，继续goal active，不推送或发布。

### WB02 milestone：来源明确的变化文件汇总（2026-10-11）

- 对照本地 T3 `ChangedFilesTree.tsx` 的路径汇总与实际来源，沿用 OMP18.8.9 成功 result 路径语义，不复制 T3 的运行身份或把当前 Git 状态推断成 Agent 因果。正式实时/保存会话默认折叠汇总；只覆盖已加载记录，最多128路径/每路径8来源，partial/截断明确显示。保存报告带实际 native record、冻结 source revision 和原 tool cursor，实时报告带实际 connection/tool 身份。
- 用户主动采样当前 Git 后单独展示 repository/HEAD/采样时间/范围，选择路径捕获真实左右内容版本后再进入 Diff。读取开始即取得窗口意图；晚到返回不能覆盖后续来源导航。报告路径仅能打开同 Thread/目录下的当前工作区文件，越界或归属不符禁用；Main权限与只读操作合同继续拥有读取权。
- ConversationModel增加有界变化证据 revision，只比较最多8个路径元数据与原生身份，不比较正文/patch；100次正文追加不重扫汇总，同数量路径替换仍刷新。隐藏汇总卸载最后Query observer、取消只读请求并清空无observer缓存，不发送执行abort。
- 跨Thread路径回归先失败后通过；七文件组合62/62通过，随后增加冻结保存来源回归，保存/汇总两文件33/33通过（与矩阵重叠）。Core类型、design/i18n及快速门禁通过；Renderer仅既有composer-tag.tsx:134 TS7053，React act提示仍存在。未将这些检查当作原生provider、完整生产Electron性能trace或用户验收。
- 固定 `d4dfa42..bbb9cc4` 独立review确认延迟定位P2已闭合，Viewer释放与轻位置恢复未发现新增可行动高价值问题。其余WB03原生warm/子会话/可见性/生产trace及WB04继续本轮goal，不推送或发布。

### WB02/WB03 milestone：采样意图与折叠浏览器读取（2026-10-11）

- 固定 `bbb9cc4..f897650` 独立review发现P2：Diff版本尚未捕获时没有登记可取消的workspace意图，同地址conversation快捷路径可让晚到Diff覆盖侧栏新意图。真实Router同地址回归复现capture仍有效，再纳入窗口hasWorkspaceIntent；capture有独立current/release，关闭/失败释放，旧capture清理不会取消后来的文件定位。未借此取消原生执行。
- 展开的FileBrowser独立拥有目录/Git列表Query与错误/刷新状态；折叠卸载observer、取消待读、释放正文/列表缓存。文件或Diff正文可继续由当前Viewer拥有。直接来源导航不先启动无需求的浏览器读取。重开保留轻directory状态后重新采样，不用禁用query或hidden DOM冒称释放。
- 折叠浏览器取消反例先复现0次取消，修正后11项FilePanel通过；既有导航测试的“hidden列表DOM常驻”断言按本次目标改成重开后真实重新采样，版本/焦点/晚到检查保留。Router/Summary/窗口/FilePanel/正式Workbench五文件39/39，补capture释放后窗口10/10（重叠）；Renderer仍仅原有composer-tag基线，design与快速门禁通过。
- WB03原生warm、子会话operation、会话/媒体其余可见性及生产trace，WB04完整交互仍待完成；goal保持active，未推送或发布。

### WB03 milestone：实际可见阅读消费者与全文需求（2026-10-11）

- ReadingPane保留轻DOM容器及Thread坐标，只有当前页/shell/document实际可见时挂载正文/媒体Query消费者；隐藏时在旧DOM移除前捕获锚点并卸载资源拥有者，重开恢复同来源位置。FilePanel复用同一document可见性入口。没有以React卸载结束待答/后台工作。
- ThreadModel的全文订阅由实际阅读lease控制，多个消费者共享一次连接，最后释放时disconnect；Runtime事实独立保留。lease获取只调用只读syncTranscript，不触发准备/恢复/执行。当前Thread保护与原有选择生命周期继续有效；背景reading占用保护缓存，最后释放通知AppModel重核idle预算，防止临时超预算在占用消失后残留。
- 页/shell/window隐藏回归先复现资源仍挂载；最后reader缓存回归先复现不回收，再分别修正。正式媒体+Query取消晚到图像并重新采样，图片无observer warm缓存保持0。六文件（含正式Workbench）37/37通过；保存阅读28/28和FilePanel11/11在矩阵中通过。ThreadWorkbench旧fixture补实际WindowWorkbench；appearance按新目标只断言已挂载视图、通过真实More动作打开文件/历史/提交，五条隐藏常驻旧假设对齐后20/23，另外3个侧栏旧selector失败在固定efcaf40隔离副本同样20/23，未改生产代码迁就旧selector；副本已清理，日志保留。
- Renderer仍仅既有composer-tag.tsx:134 TS7053；design/i18n通过。快速门禁曾因新增测试依赖使结构聚合过期，重新生成后通过，最终pnpm build通过。保留React act/构建chunk提示，不以边界替身冒称原生供应商或完整生产性能trace。
- 固定f897650..efcaf40独立复核确认同地址capture P2闭合，FileBrowser释放无新增高价值问题。WB03原生warm/子会话/生产trace及WB04完整交互继续本轮goal，未推送或发布。

WB01 合同细化：resources/contracts 是无反向依赖的来源叶子；sourceRef 仅 provenance，不授予文件或执行权限。Host 原始工具输出 reader 通过现有 MessagePort 订阅，与 timeline 摘要分离。窗口最多8 Surface，共享 reader；每工具输出256KiB、参数32KiB，Host 总缓存2MiB/64项，预算或缺失生命周期标 partial。关闭释放读取 lease，不发送 abort。FrozenContext 使用独立长度封套和原生来源，范围为冻结版本的 UTF-16 偏移，选区最多64KiB；唯一 Thread 草稿用 threadId 标识，revision+sequence 防竞争。当前挂载 editor 单笔 undo transaction，未挂载语义写入并保留缓存 undo。返回捕获导航 ticket，后续导航/关闭使其失效。待完成切片后追加实际命令、结果、提交、review 与未覆盖范围。

可见性组合修正：固定 `efcaf40..0ca5a6e` 独立review发现P2，ReadingPane隐藏会卸载FilePanel的轻位置owner，先前直接挂FilePanel的回归没有覆盖该生产组合。新增真实ReadingPane→FilePanel的file/Diff×page/shell/window六个反例均先复现返回目标丢失；files现保留轻owner，内部Viewer继续卸载Query/Monaco。三文件38/38通过，包含组合目标/取消/晚到/重采样及轻坐标接棒、实际Monaco adapter同版本恢复/旧版本拒绝；Renderer仍只有既有composer-tag基线。该修正不保留隐藏文件正文或Editor实例。

### WB03 工程增量：原生 warm 预算与许可式冷却（2026-10-11）

- 对照本地T3 `ProviderSessionManager.ts` 的idle generation/异步probe后身份重核，未复制其后台pin到期强制释放规则。固定OMP18.8.9及自有 `runtime/host.mjs` 的实际state、pendingAsync/admitted/background与既有lease/清理合同仍为执行依据。Main新增独立NativeRuntimeSupervisor：后台idle warm初始2个/60秒，`D_PI_NATIVE_WARM_LIMIT`限定0–8、`D_PI_NATIVE_IDLE_MS`限定1秒–30分钟；最多2个并发冷却尝试，不把Renderer cache或最新RPC调用当选中会话。
- RuntimeService给出warm/cold/cooling/真实protected原因，命令、执行、未决收据/证据/unknown均拒绝冷却。Host先查原生真实state，再请求同trace/generation的Main许可；Main重新查SQLite选择和实例准入，Host许可后重核观察代次与实际timeline/tool reader。实际关闭确认及进程组/lease物理清理都成立才表达cold；原session文件/ID、授权、模型意图与历史保留。新命令在许可前令冷却拒绝，若已经进入关闭则等待清理后重新准入；没有重发已写请求。诊断贯穿同一cooldown trace与真实实例身份，不记正文。
- 反例先复现Main缺策略、Host不等待许可、无效reader误占用，以及probe期间意外退出被误算正常冷却，分别修正。8文件69/69、Runtime/SQLite完整58/58通过：容量/TTL/选中/身份换代/两slot/关闭timer、许可前新工作与reader、A/B事实保护、pending/unknown/evidence拒绝、命令竞争、异常退出、原session冷恢复。Host入口两条旧断言在固定acb2da7副本同样5/7，按WB00 written与WB03显式demand合同补正确fixture后7/7；未改生产行为迎合旧断言，隔离副本已清理。
- Main/Host/Core类型及生产build通过；结构/快速门禁以本段最终源再生成核验。固定0ca5a6e..acb2da7独立复核已确认文件轻owner P2闭合。本段warm仍需固定范围独立复核与真实Electron/native验证，不冒称完整WB03、第13节生产trace、输入延迟或用户认可；子会话operation及WB04仍待完成，goal保持active，不推送或发布。

窗口准入补充：初稿仅保护可见窗口的选中Thread；追踪ThreadModel发现窗口隐藏仍拥有自动准备职责，冷却会触发无用户动作的重启。保护现跟随存活窗口的SQLite逻辑选择，隐藏只释放阅读/Viewer，关闭窗口才解除selected保护。Main组合回归确认最新background调用不取代窗口选择，窗口关闭后转入正常warm政策。Renderer复核仍仅既有composer-tag.tsx:134 TS7053；40项架构测试通过，完整生产构建保留既有大chunk提示。

物理finalization补充：实际失败反例确认许可后超时仍可能保持连接，同时等待中的命令会继续准入。现将该实例保留为shutdown-unconfirmed，等待后再次检查并拒绝新执行/提交；原收据不写入。两个冷却slot直到同物理实例确认cold才释放，不能以逻辑超时替代资源完成。Runtime60、全收据索引4、Supervisor6共70/70通过；覆盖已许可关闭超时、等待命令拒绝和清理后slot接续，仍不冒称真实Electron/native结果。

真实native补充：`validation/m2/native-warm.ts`通过独立Electron构建复用正式Runtime/Host，并行保留3个OMP18.8.9实际会话；真实MessagePort阅读需求与当前选择保留原生占用，后台cold后lease可重新取得且owner为空，显式start恢复同sessionFile/ID与模型，最终4次native退出并验证PID不存在。模型调用0次。共享SDK正由另一Electron持有，验证使用保持相对symlink且经正式完整哈希检查的隔离资源快照，未修改或停止原实例；该轮源为e115f19c+WIP诊断接线，记录dirty及验证bundle/hash，不冒称clean候选或GUI/完整工作台性能trace。诊断实际Writer会将未登记操作/原因归unknown，失败反例后补入runtime:cooldown与有界cooldown原因白名单，26项诊断回归通过。

固定acb2da7..e115f19c独立review发现P2：两个最老reading-demand实例每轮占满两个probe slot，后面的idle实例会被饿死；同类已知保护亦被误计入可回收容量。以6实例/2持久读者真实失败反例修正：容量按尚未拒绝的idle计算，已符合回收条件者按最近尝试顺序公平轮换，TTL后仍复查原读者，物理未确认slot规则不变。待固定修正范围复核，WB03子会话读取与生产trace、WB04继续当前goal。

固定e115f19c..355003a独立复核确认该P2闭合，未发现新增高价值问题；核对实际native报告和两份bundle SHA，与有限声明一致，sourceDirty=true不冒称clean候选。继续WB03子会话读取：固定OMP `rpc-subagents.ts`读到EOF，已有size检查后仍可增长；本地T3 usageTranscriptReader使用冻结byte位置和guard，沿用有界范围/身份复核原则，不迁入其usage reducer。先抽取既有Worker监督至platform/node/reads并由HistoryReadRunner继续消费，旧任务/回复与来源合同保留；新增deadline失败反例与物理exit名额回归后，历史/图像/artifact/Runtime五文件87/87及Main类型通过。子会话Worker正式接线待后续本段，不以技术抽取冒称已完成。

监督抽取验证：40项架构测试与快速门禁通过；生产build通过并保留既有chunk提示。构建后的Worker在Node24.21.0/Electron44.4.5各完成9次真实exit且active=0，含10MiB artifact、尾页/前页/追加、工具参数、图像与CLI目录。首次构建后立即运行曾报history-worker.js不存在，随后文件实际存在，复核运行通过；该瞬态根因未知，未修改验证断言或复制产物绕过。该脚本验证真实Worker解码与退出，监督deadline/取消仍由受控exit测试证明；不当作完整生产工作台或子会话Worker证据。

驻留收据核实：`submissions.list()`原有100条展示上限不能用于证明全部结清。旧prepared后追加101个rejected的真实SQLite反例先复现nativeResidency误报warm，现由partial index的hasUnsettled存在性查询覆盖全部收据；共享的modelSelection、releaseEligible与cooldownReason都采用同一判定，不加载正文。原生Runtime完整59/59，加索引/未知或损坏状态/实际EXPLAIN QUERY PLAN四项为63/63；索引派生现有receipt、不改变事实或展示分页，读取失败仍拒绝。后续验证与review覆盖该增量。


子会话读取接线（2026-10-11）：固定OMP18.8.9的task artifact路径及SessionHeader.parentSession为依据，参考本地T3 usageTranscriptReader的完整行/固定byte范围原则。正式Host注入跨全部scope的单一WorkerReadOwner（2并发、5s限时），终态正文不再调用get_subagent_messages控制RPC；绑定真实父sessionFile/ID、原生id/parentToolCallId与独立operationId，原trace传入Worker。父/子文件canonical范围与inode校验拒绝外来路径、symlink逃逸及身份变化；兼容macOS /var与/private/var路径别名，原生字符串仍精确关联。源文件最多1MiB/1000完整记录，assistant/yield结果在Worker内UTF-8限64KiB；不完整尾行或输出截断明确partial。旧owner复用、淘汰、dispose会取消实际读信号，跨scope名额保持到物理exit；Host读任务绑定既有Effect Scope，关闭同样等待实际读finalization，不将Effect中断当作Worker退出。过载显式transcript-unavailable，不创建替代App Thread、不影响原生执行。

验证：原owner复用失败反例与Worker截断投影失败反例转绿；7项读取身份/边界、4项观察取消/关闭/复用、9项投影，以及Host41和App7共68项目标回归通过；Host类型及架构边界通过。独立构建validation/m2/subagent-read.ts在Node24.21.0与Electron44.4.5各spawn5次真实Worker，peakActive=2、final active=0，包含已有两名额时第三读取拒绝、取消保留名额至exit、随后可读与UTF-8截断。文件是官方协议fixture，尚不是新正式Host到实际OMP子任务的组合实测，不冒称完整WB03或GUI/IME/工作台trace；后续继续WB04。平台监督抽取固定355003a..d1bb825独立复核未发现可行动高价值问题。正式生产构建、Main/Host类型、40项架构测试与快速门禁通过；验证wrapper再指定正式out/main/subagent-worker.js入口，在Node/Electron同样5次spawn、peak2、final0。最新独立native-warm构建实跑保留3个真实OMP会话、同身份冷恢复、真实lease释放与4次native退出，模型请求0；仍限Main链路，不代表GUI或新子任务的实际OMP组合。

独立93fc09d复核发现P2：初次canonical校验后、parent读取await期间，artifact目录替换为外部symlink可被O_NOFOLLOW的叶子限制漏过。真实rename/symlink文件反例确认旧实现返回foreign完整结果后，现先捕获目录及child身份，打开后核对文件identity，所有解码完成后再核canonical路径、目录inode、父/子真实文件identity。变化明确unavailable；读取8/8及Host类型通过，独立构建Node/Electron Worker名额/取消/UTF-8回归再次通过，待增量复核。

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
