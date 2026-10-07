# 执行记录与阅读

日期：2026-09-27。深度：M1 投影与恢复主干，M2 完整阅读验收，M3 PNG 分享。依据 D-01/D-16/D-24/D-26、B-03；[基础契约 §6](../foundation-contracts.md#6-有界事件与恢复b6)。返回[模块地图](README.md)。

## 当前工程落点（领域目录治理，2026-09-29）

- 合同和历史页在 `src/modules/conversation/contracts/`，无平台阅读客户端在 `core/`，Host 投影在 `host/`，原生历史读取在 `main/`。
- `src/app/renderer/reading/` 的 `conversation.tsx`、`history.tsx`、`submissions.tsx` 分别组合实时阅读模型、原生历史桥和执行收据显示，共用 `markdown.tsx`；`ConversationModel` 不启动后台执行，面板卸载只释放视图资源与订阅。
- `ConversationProjection` 由 `conversation/host` 的独立 Host scope 创建并通过公开 `ConversationPort` 输出；`app/host` 将其与 execution Host 组合。OMP 原生历史仍是来源，App 不建立第二套持久历史。
- 固定 OMP v18.4.6 保持 full 消息模式，以原生 message_end 更新最终正文；prompt_result/SQLite 保存成功不证明 Renderer 已收到最终消息。执行收据显示调用 ACK 与原生 completed/aborted/failed/unknown 的独立事实，结果证据不足时保留覆盖说明，阅读镜像不结算提交。


## 范围与拥有者

Host 的阅读功能把已解码原生事件组织为会话镜像、历史查询与有界实时尾部；Renderer 订阅展示，使用 Streamdown + Shiki 阅读内容。OMP 原生历史仍是原生事实来源；App 只补充原生无法重读而恢复 UI 必需的内容与关联。

显示状态不控制执行。[执行模块](execution.md)拥有提交/待答交互语义，本模块呈现其投影，不能从“按钮禁用”“收到一段文本”推断接受或终结。子 Agent 观察消费 OMP 暴露的事件/历史，不建立自有调度器。

2026-09-27 [成果检查与下一步引导](../../product/requirements.md#成果检查与下一步引导2026-09-27-访谈方案)以成熟交互为基线：真实结果有稳定入口，可追溯到差异/工具记录，并便于带位置反馈。用户已采纳这一方向；智能判断优先检查项仍为候选，不是已确认模块或首版门槛。阅读功能组合已有来源与查看入口，模型总结不成为新的完成/测试事实源。不提前建立推荐引擎、完成协议或独立工作流模块。

2026-09-27 用户确认[多 Thread 提醒策略](../../product/first-release.md#多-thread-提醒策略2026-09-27-用户确认)：后台待答/失败采用侧栏标记和不抢焦点的应用内提醒，App 非前台时经已授权系统通知提醒；正常完成默认仅完成/未读标记，完成通知可开启。不得自动切会话或抢输入焦点，点击定位到关联 Thread 的当前有效状态。Host 提供事实，Main 协调系统通知，Renderer 展示；M2 覆盖重复事件、通知不可用、关窗和过期交互。

### CLI 历史只读发现（2026-10-01）

当前项目历史页从当前 Thread 的原生配置来源解析 sessions 根，按 v3 header 的 canonical cwd 匹配当前项目，发现 CLI 保存的记录。列表仅给出有界标题/身份和不透明 key；Renderer 不能传文件路径。Main 每次重新发现并检查项目、来源根、会话 header、游标及文件版本，保留只读分页和部分覆盖说明。发现不调用具有迁移/建目录副作用的官方 `SessionManager.getDefaultSessionDir`，不改原生文件、不产生 native binding、不接管 CLI 执行。仅支持固定版本的常规 sessions 根下一层文件，256 目录/4096 文件/200 记录预算超出时明确 partial；自定义 `--session-dir` 不由此自动发现。

## 交接

| 来源 | 本模块返回什么 | 消费方 |
| --- | --- | --- |
| [宿主](runtime-host.md) 解码事件 | 有实例身份、seq、来源和覆盖状态的投影增量 | Renderer 阅读视图 |
| 执行模块的收据摘要与待答状态 | 对应提交/交互的只读显示模型 | 输入旁状态、交互视图 |
| 原生可读历史、App 必要补充 | 有来源位置/版本的历史页，或 busy / 缺失 / 覆盖不足等明确结果 | 历史浏览与重连 |
| 当前 Host 投影 | 含 connectionGeneration 和 watermark 的快照 | 新连接 Renderer |
| 原生工具结果 | 独立于显示卡片的记录级证据：原生会话/toolCallId、结果来源、错误和截断信息 | [变化记录](changes-git.md) |
| 用户选择的消息段落 | 内容与来源位置快照 | 复制、后续 [Side Chat](side-chat.md) / PNG 导出 |

快照与增量遵守[重连时序](flows.md#窗口重连)：先订阅缓冲，再应用快照和水位之后的增量。历史页独立于实时尾部，不能把当前上下文消息数组当作完整持久历史。

## 生命周期、边界与失败

- 无窗口时 Host 继续读取并维护有界投影。Renderer 卸载释放订阅/渲染资源，不能停止原生执行或后台输出消费。
- 流式文字在 block 内合并，工具/交互/终态前刷新；正文按实体/block 更新，避免每个 token 通知整棵界面。后台状态与当前阅读详情按需同步，订阅和恢复遵守基础契约 §6。缓存/补充存储预算沿用基础契约。
- 旧代次丢弃，缺号触发重同步。历史来源变化、压缩/分支变化或缓存缺口明确标出；原生不可读不返回空列表冒充没有历史。
- 可扩展事件保留受限详情和未知类型说明，不能静默丢弃。消息/Markdown/链接按不可信内容处理，不把活动 HTML 或危险 URL 交给特权宿主。
- 原生重读不可用且补充容量不足时保留可见缺口，不通过无限缓存或阻塞 stdout 维持完整假象。

## 第一批交付与验证

M1 完成文本、必要工具/交互、状态、历史重开与复制 Markdown/代码；M2 按 V1-06/07 覆盖本阶段可能出现的事件、子 Agent 结果、长输出和稳定选择。通用详情可用于明确的展示降级，不能据此宣称全 TUI 精细组件完成。

G1 验证运行中历史读取、无 Agent 历史浏览、压缩/分支后的来源；`get_messages_page` 的 busy 限制已有源码依据，不能只重试同一个接口就判完成。

样本覆盖：先订阅后快照的交错、重复/缺失/旧代次事件、流式时阅读和选中旧内容、单工具大输出、子 Agent 完成后记录仍可找、关窗后重开及恢复缺口。用同一记录样本检查实时与重建结果，并复用于卡片展示；卡片合并或裁剪后，工具证据与已冻结引用仍保持一致。无头测试与真实滚动/选择/性能证据分开。

M3 PNG 分享复用确定版本的选中内容，按排版/分页输出图片；具体渲染方式与长内容分页在该切片设计，不新增 AI 绘图或在线发布服务。

## M2 原生子 Agent 观察（2026-10-06）

`ConversationItem.subagent` 在既有 snapshot/update 水位中表达 OMP 原生 ID、parentToolCallId、独立状态与可得结果。Host 用 `(id, parentToolCallId, sessionFile)` 区分同名任务的不同运行，路径不进入 Renderer DTO；无拥有者字段的原生事件遇到同 ID 多个运行时不猜归属，保留 partial 原因，具备拥有者的 progress/transcript 仍可更新。主/子 `agent_end` 不结算子任务，只有原生 lifecycle/progress 的具体状态作为观察证据。

投影共用原阅读 8 MiB/1000 项预算，单个结果最多 64 KiB，截断或未知子事件明确展示。初始 `get_subagents` 最多消费 128 个活动任务，超出显示覆盖不足；终态保留在同活 Host 的有界镜像，Host 重启后不能从活动快照重建之前已完成任务。Renderer 连续缺号最多自动重连 3 次，之后保留 gap 与显式重新连接阅读入口；重连只重建订阅，不控制原生执行。正式 `reading/subagents.tsx` 复用消息阅读及 Markdown，提供身份、状态、任务、原生模型与可得结果；视图卸载仅释放订阅。

## M2 有界长正文阅读（2026-10-06）

正式实时消息、工具输出、原生历史与子 Agent 结果共用 `reading/reading-body.tsx`。短正文保留原 Markdown / 工具原文表示；超过一段预算的正文明确采用原文分段，每段最多 8192 UTF-16 code units、120 行，保留 surrogate pair 和 CRLF 边界。`reading-segments.ts` 只计算既有正文的偏移，不复制或持久化另一份正文；主列表只挂载当前段，段内高度沿用现有阅读／编辑器高度 token，提供可键盘进入的滚动区及上一段／下一段控件。复制使用投影／历史条目的全部已有原文，历史页补行头复制；Host 截断、历史 omitted / incompleteTail 与子 Agent 覆盖提示保持，不宣称取得完整原生记录。

页码与段内滚动属于 Thread 的有界阅读位置。实时记录按 Thread、Host `connectionGeneration` 与 item ID 隔离；同 Host 重连保持页码，新 Host 或 Thread 使用自己的位置。历史记录按 Thread、所选原生会话、`page.source`、页偏移与 entry ID 隔离。流式追加不自动翻段，已封闭段的切片和 DOM 不变，保留选择与段内滚动；正在增长的末段仍有界，新增段由用户显式进入。正文缩短时立即夹紧页码，后续追加不恢复失效的旧选择。短正文首次跨入分段表示会改变渲染格式，稳定选择承诺针对已进入分段后的封闭旧段。

此接入只改变 Renderer 呈现，不扩大 Host / OMP 预算、不重读历史、不改变执行或持久化。分段规则、实际 React 挂载的 DOM／选择／滚动和来源隔离有自动回归；真实 Electron 几何、键盘与剪贴板，以及完整 M2 性能组合另由对应候选记录维护。
复制使用 Renderer 的 `navigator.clipboard.writeText`；应用窗口仅允许当前 WebContents、主框架、当前文档的 `clipboard-sanitized-write`，check/request 两入口一致。剪贴板读取和其它浏览器权限保持拒绝；此权限不授予模型工具或原生 OMP 文件访问能力。

## T3 基础重构：内容锚点与读取 attempt（2026-10-07）

Thread 拥有有界的阅读位置账本，不保存正文或执行事实。实时位置以真实 connectionGeneration 隔离，原生历史以 session key、实际 page.source 与 cursor offset 隔离；恢复 hydrate 只建立来源基线，不构造新轮次。锚点保存 row ID、行内偏移、像素 fallback 和 atEnd；上方阅读随布局/流式更新恢复同一内容，只有原先位于底部才跟随真实尾部。行消失或缩短时夹紧到可用范围，来源改变不借用旧来源位置。每 Thread 最多32个来源锚点、128个分段正文位置，按最近更新顺序淘汰最旧；来源/正文key及row ID最多4096 UTF-16 units，超限身份退回像素/局部分段，不缓存超长字符串；Thread释放时清空并拒绝迟到写入。

Renderer DOM adapter 拥有 ResizeObserver/MutationObserver/rAF 与几何测量，卸载/隐藏停止测量，不用 hidden 零坐标覆盖可见位置。视图/Thread返回保留正文分段选择与段内滚动；只读位置不控制 OMP。仍保留有界正文 DOM 和当前已封闭段的选择，不按文字/顺序猜测 native/live 合并。

原生项目分页继续交给 Query 按来源/key/cursor 拥有；绑定历史读取也进入 Query，每次用户读取建立独立 attempt（同cursor重试仍不同），旧返回或 finally 不更新新attempt的忙碌/错误/页内容。未支持物理取消的历史 I/O 不冒称已终止；视图释放只防止迟到结果接管当前来源。合同与工程证据归 [T3 基础规格](../../../.scratch/t3-foundations/spec.md)。

## 首个长会话阅读闭环（2026-10-08）

外层列表回底由同一 DOM adapter 即时执行，取消旧恢复并重新跟随当前 live 已保留尾部；不补 gap、不切来源，也不改变正文段选择。用户外层 wheel、导航键和滚动条输入优先于待发定位；嵌套 raw/代码滚动自身可消费时、编辑器/IME 输入时不误接管外层。attention 实际定位通过同一适配器提交；隐藏/dispose 取消帧并释放观察、监听和订阅。

新输出提示是当前可见来源一次阅读期间的布尔状态：同实体有效正文变化或新增正文可置位；相同快照、loading及完成元数据不置位，回底/已跟随清除，切来源/Thread/重新进入重建基线。段页旁的“最新段”由用户显式按当前有效末段选择，后续追加仍保留选择。gap/截断经既有Thread tools进入分开的原生历史，返回保持同来源账本位置及可见工具焦点；历史按保存顺序、只读与部分覆盖展示，刷新明确重读起始页，未读取/空页/不可用类型分开。

短 Markdown 完成关闭 incomplete 补写并保持稳定 Block 前缀；迟到引用/脚注需要全短文解析作用域。语义改变、跨分段阈值或卸载重挂不承诺DOM/Selection存活，封闭raw段仍保留原合同。Main/Host/Bun、历史所有权与预算未改变。[行为矩阵、源码身份及实际Dev/Chromium证据](../../../.scratch/m2-first-release/reading-loop.md)。
