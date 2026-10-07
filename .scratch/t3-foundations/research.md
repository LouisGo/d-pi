# T3 Code 研究结论与 d-pi 重构依据

2026-10-07。研究固定在 T3 `10f39eb9ac80c9a4b7f5097575dd2addc3b6f631`，d-pi 固定在 `598323321c8c2ba6eb177097e2042510c3b79d87`。实施状态单独维护在 [spec](spec.md)，本文记录判断与证据，不把目标写成已实现行为。

## 结论

d-pi 应吸收 T3 对资源、操作、输入与证据的建模方法，在现有领域内部完成实质重构。最有价值的结果是：每个异步操作有可核验的拥有者和结束条件；查询失效能够释放真实资源；输入文档、附件与撤销共同保持一致；用户回到相同内容而不是相同像素；诊断说明自己丢失和恢复了哪些证据。采用更多库、服务或状态字段本身不能证明这些收益。

当前主要缺口位于六条具体链路：NativeSession 与 SessionHost 的失败及任务生命周期；Files/Changes 的读取取消和进程预算；React 持有的附件任务及撤销资产可达性；跨 Thread 的结构化复制；ReadingPane 的内容锚点，以及诊断 Writer 的源头过滤和故障恢复。既有收据、配置、OMP 执行、Zustand/Query、最小 Tiptap 与应用导航继续提供基础，不进行整栈替换。

这项研究不支持立即移植 T3 的服务器编排、事件账本、Atom runtime、远程认证、checkpoint 或 Run 实体。T3 同时面向多客户端和远程环境，许多复杂性来自这些实际约束；d-pi 的本地 Electron/OMP 所有权不同。合理的迁移单位是一个可证明的行为合同，而不是一个上游目录或类名。

## 研究方法与证据边界

用户提供的 DOCX 共九章，正文、表格、外部链接及三幅职责图均已读取。原件 SHA-256 为 `bce86db5ab4ba4b962d32e3d94306483b8ce27aeaf8a96fd137e8ef1e2f7a2a5`。原件路径是 `/Users/louistation/Downloads/T3 代码架构与设计参考.docx`。它是设计参考和待验证主张，附件中的建议不直接成为实施指令。其 d-pi 基点 `d4f380c` 是当前基点的祖先，仍逐项以当前源码复核。

独立研究从 T3 的 [AGENTS](https://github.com/pingdotgg/t3code/blob/10f39eb9ac80c9a4b7f5097575dd2addc3b6f631/AGENTS.md)、[架构说明](https://github.com/pingdotgg/t3code/blob/10f39eb9ac80c9a4b7f5097575dd2addc3b6f631/docs/internals/overview.md)、[Effect 服务规范](https://github.com/pingdotgg/t3code/blob/10f39eb9ac80c9a4b7f5097575dd2addc3b6f631/docs/internals/effect-services.md)进入，再核查对应实现与行为测试。源码 clone 与版本核实不等于运行 T3；本研究未启动 T3、登录账户或验证其整体性能。后续 d-pi 测试、真实子进程、Electron 与用户试用分别记录，不能由上游源码推导本应用已经达标。

## 一 采用 T3 的开发范式

T3 的规范强调先找真实约束、使用最小正确模型、把复杂性集中在适配边界、通过实际服务验证可观察行为，并检查所有真实入口及反向操作。其 Effect 规范进一步要求可信边界解析、类型化错误、明确依赖、传输层薄映射、作用域内资源释放，禁止把原始错误文本作为用户结果或日志属性。这些原则与 d-pi 的领域所有权、无头功能和 TDD 合同相容。

具体库写法需要区分适用范围。T3 的服务方法全部返回 Effect，并由 Layer 构造环境依赖；d-pi D-39 的 NativeSession 本来就是一个面向 Node 回调和 Promise 公开面的命名适配器。这里允许在适配边界运行 Effect，不能反过来把每个纯规则、查询或 React 组件改成服务。新增 Effect 代码采用 T3 的子路径 namespace imports，检查安装的 `effect@4.0.0` 签名，并保留 Promise/可序列化 DTO 公开面。

T3 用 Effect Schema 维护远程协议；d-pi 已确认 Zod v4。应采用“边界 schema 为类型单源”的原则，继续使用 Zod，而不是并列建设第二套协议校验。T3 的测试强调等待明确里程碑或 drain，避免任意 sleep。d-pi 对业务缺口逐行为红绿，原生时序测试使用明确 gate；补测既有正确行为不伪造红灯。

## 二 资源作用域和失败保真

T3 的 [runtimeLayer](https://github.com/pingdotgg/t3code/blob/10f39eb9ac80c9a4b7f5097575dd2addc3b6f631/apps/server/src/orchestration-v2/runtimeLayer.ts)在组合根提供依赖，[ProviderSessionManager](https://github.com/pingdotgg/t3code/blob/10f39eb9ac80c9a4b7f5097575dd2addc3b6f631/apps/server/src/orchestration-v2/ProviderSessionManager.ts)为 session 组织 Scope。借鉴重点是资源一旦取得就登记释放，以及任务归实际 session 所有，而不是全项目建立 Context.Service。

d-pi `execution/host/native/native-session.ts` 已先登记 stopChild finalizer，ready/RPC 等待已有 Deferred、forkIn、timeout 和 ensuring。没有证据证明当前代码存在材料所暗示的通用资源泄漏。真实差额是 timeout、protocol、spawn、write 和 Scope interruption 在普通 Error 及 Host 的 state-unavailable 中失去区别。应建立局部 NativeRequestFailure，保留有限 kind、operation、requestId、timeoutMs；在可信 Host/Main 映射时继续保留 trace 和既有业务结果，原始 Cause/stderr/prompt 不跨 IPC。

SessionHost 的 single-flight refresh、observationVersion 和 lastDispatchId 已存在。重构必须保存这些身份判断，不能用 Fiber 取代它们。证据重播、观察延迟与刷新任务归单 Host scope，关闭时停止本 scope 的工作；证据重播只重送 evidence，不重写 frozen prompt。Effect 包装不可中止的 Promise 只能取消等待，不能声称取消内部工作；原生请求需要具体的局部取消接缝和跨 await 复核。

[PiRpc](https://github.com/pingdotgg/t3code/blob/10f39eb9ac80c9a4b7f5097575dd2addc3b6f631/apps/server/src/orchestration-v2/Adapters/PiRpc.ts)提供响应与 transportDown 竞速及 typed timeout 范例。它不能证明本地等待取消了 provider turn。d-pi 继续分别维护 RPC 接受、执行结果、传输断开、child close 和 groupStopped。Scope 关闭有界等待不得解除未确认的物理单写权，ACK 后断流不得倒退为未 ACK 或自动重发。

另一个易遗漏的运行差异是 timer：锁定 Effect 4.0.0 的 sleep timer 默认没有 unref，而 Host 的既有后台 timer 使用 unref。迁移须保留实际进程退出行为，必要的 Node timer 适配以 Effect callback 的资源清理表达，而不是声称改成 sleep 就等价。

## 三 查询身份与真实取消

T3 的 [client runtime](https://github.com/pingdotgg/t3code/blob/10f39eb9ac80c9a4b7f5097575dd2addc3b6f631/packages/client-runtime/src/state/runtime.ts)把 query identity、旧值、waiting、失效与 imperative fresh read 区分开来。其 command lanes 中 latest 仅替换未开始输入，singleFlight 共享等价操作；这不表示各中间值均已完成。发送、回答和队列变更必须继续保留各自意图及收据，不能套 latest 或自动 retry。

d-pi 的 key 已包含 Thread、workingDirectoryId、directory、具体路径/scope；配置和历史也有自己的 scope/cursor。焦点/reconnect 不自动刷新，本地读取使用 networkMode always，业务 unavailable 与采样失败分开。无需复制 Atom、30 秒 staleTime、远程连接 gate 或一套 client-runtime。应补隐藏 observer 的失效、旧值/失败、新资源隔离及无选中资源零 IPC 等精确回归。

当前 Files/Git 的 queryFn 不消费 signal，invoke 协议没有操作登记/取消。key 能防止显示串线，却不能停止旧 I/O。新合同以不可预测的 operationId 标识一次只读请求，Renderer 消费 Query signal，分别调用可序列化 request 与 cancel。AbortSignal 不直接通过 contextBridge 传递，不能假设 isolated world 的对象会保持实时语义。

Main 在第一个 await 前登记 sender/frame、operation、Thread context 与 AbortController。初始准入仍复核 active Thread；取消仅核对原 sender 和所属 operation，不再次要求旧 Thread 仍处于前台，否则导航后无法取消旧读取。取消通道不接收 PID。共享 Query 的最后一位 observer 离开才触发所属请求取消，单一组件卸载不能结束其他 observer 的工作，更不能停止 OMP。

## 四 Git 与文件资源合同

[VcsProcess](https://github.com/pingdotgg/t3code/blob/10f39eb9ac80c9a4b7f5097575dd2addc3b6f631/apps/server/src/vcs/VcsProcess.ts)统一共享 semaphore、timeout、输出预算、typed failure 和 error/truncate 策略。T3 默认允许 truncate，d-pi 的 blob、NUL 列表和 Diff 基线必须采用完整输出或明确失败。许可在 child close 后释放，AbortError callback 不能证明真实进程已经退出。

d-pi 每命令已有 execFile 10 秒和 maxBuffer、文件字节/条目数上限、SHA-256 及前后复核，也禁用外部 diff、textconv 和 fsmonitor。这些防护继续沿用。新增专用 Git runner，把真实 spawn 活跃预算与等待队列准入分别限制，过期排队操作在 spawn 前撤销；不能将 Query key 去重当作跨 Thread 的进程上限。容量先用固定负载测量，具体数字为工程初始预算，不抄 T3 的 8。

独立核查发现 `filterNeutralizers` 的 config 读取失败返回空数组后继续 diff。若原因是超限或临时失败，就不能证明已经禁用所有 clean/process filter。新 runner 必须 fail closed：防护取得失败时整个采样失败，而非继续执行可能受项目程序影响的读取。回归同时覆盖 clean/process filter、超限、不完整机器输出、异常退出、超时、取消、排队取消及许可释放。

文件 I/O 中不是每个 Node 操作都可物理中止；可中止的读取传 signal，其余在 I/O 边界检查 abort 并停止下一阶段，明确正在进行的系统 I/O 限制。身份与授权继续由 Files/Main 裁定，取消不扩展路径权限。取消是预期的读取结束，不进入错误 toast 或 transient retry。

## 五 输入文档与附件一致性

T3 的 [rich text doc](https://github.com/pingdotgg/t3code/blob/10f39eb9ac80c9a4b7f5097575dd2addc3b6f631/apps/web/src/composer-rich-text-doc.ts)、[undo grouping](https://github.com/pingdotgg/t3code/blob/10f39eb9ac80c9a4b7f5097575dd2addc3b6f631/apps/web/src/composer-undo-grouping.ts)把位置映射和用户动作分组作为显式合同。d-pi 仍以 Markdown 源文本为主，无需复制四种坐标；所有引用插入、删除、粘贴和替换使用编辑事务，选择映射归编辑器。输入→删除→输入、粘贴、拖入/引用和已接受提交消费必须有可预测的撤销边界，IME replacement 保持输入语义，外部 revision/消费不能被 Undo 复活。

当前 d-pi 的 EditorState cache、lease 与逐 Thread 历史已有基础，但附件 pending、failed、choose-import、retry 等仍在 AttachmentControls React 内。历史记忆中的 headless 修复不能当成本基点事实。附件任务应由 ThreadModel 持有的无头 AttachmentModel 管理，组件仅订阅和发意图，所有导入/重试/引用入口共享冻结与释放合同。现有导航/关闭屏障保留并收束，旧回调仍绑定原 Thread，不以删除屏障换取切换表面流畅。

资产 GC 的可达性必须超出“当前草稿有无 token”。现有 Main GC 核查持久草稿、收据和 queue_change，以及部分在途 pins，却不核查 Renderer 的撤销历史。删除图片、保存、手动清理、Undo 可以得到缺负载 token。需要有界编辑/history lease 参与 Main 的删除核实，缓存淘汰、编辑器消费和窗口销毁释放 lease。物理内容仍由 Main 管；不把二进制塞进 undo 栈，不新增可双写资产真相，也不以永久不清理代替正确可达性。

## 六 结构化复制的权限与版本

T3 的 [clipboard contract](https://github.com/pingdotgg/t3code/blob/10f39eb9ac80c9a4b7f5097575dd2addc3b6f631/packages/contracts/src/composerContextClipboard.ts)、[codec](https://github.com/pingdotgg/t3code/blob/10f39eb9ac80c9a4b7f5097575dd2addc3b6f631/packages/shared/src/composerContextClipboard.ts)和 [inline paste](https://github.com/pingdotgg/t3code/blob/10f39eb9ac80c9a4b7f5097575dd2addc3b6f631/apps/web/src/components/composerInlineTokenPaste.ts)说明格式版本、数量/字节限制、依赖裁剪、负载冲突与 ID 重映射需要共同设计。不能只拷 UUID token，否则目标草稿没有对应 manifest。

d-pi 已有 Main preview + import-bytes 可重新授权图片并生成目标 ID，但直接相信 fragment 的 source Thread/id/path 不合适。附件 IPC 的 gate 核对可信窗口来源和存在的 Thread，不要求它当前激活；这一事实解释了为什么内部 API 可读 A，但它不让外部剪贴板声明变成权限。采用有界、限时的同 App transfer handle：Main 从已授权源草稿捕获实际选择的依赖并 pin 资产；目标导入验证 handle、来源和目标身份，重新创建目标 manifest，重写 token。外部自称的路径/URL/资产 ID 无有效 handle 时仅按可编辑纯文本降级，不能自动读取或下载。

动态文件/目录的跨 Thread 复制涉及版本、权限和用户预期，不能隐藏在codec内。先提出复制时冻结、发送时读取原项目、仅同目录搬运三种选择；2026-10-07用户明确回复选项1，采用复制时冻结来源及版本。Main按原Thread授权捕获完整有界内容，目标只消费私有快照；目录沿已有直接清单语义。冻结选区始终保留原文、坐标和版本；普通输入、原动态@引用的发送读取和已冻结提交行为不受此次复制选择影响，权限没有由外部clipboard声明取得。

选项1后的补充源码核查：[ComposerContext](https://github.com/pingdotgg/t3code/blob/10f39eb9ac80c9a4b7f5097575dd2addc3b6f631/packages/contracts/src/composerContext.ts)的FileContextRecord是attachment ID/name/MIME/size绑定，未提供原项目动态path/version冻结接口；[ChatComposer](https://github.com/pingdotgg/t3code/blob/10f39eb9ac80c9a4b7f5097575dd2addc3b6f631/apps/web/src/components/chat/ChatComposer.tsx)约3128–3240经源environment asset URL和client fetch搬运实际内容，用target key防迟到串入，并让未解决chip先进入草稿。d-pi采用来源身份、实际内容、新ID及迟到复核的原则，但沿Main私有存储与全部ready后单事务插入，复制冻结属于用户确认的本地合同；不能将上游attachment搬运或URL访问视为已实现动态引用的复制时刻快照。

剪贴板导入完成后一次事务插入同版正文/引用；迟到导入不进入新 Thread 或已消费的新草稿。失败不得产生半段成功却可发送的输入。未使用的成功导入交给 Main 的引用/清理机制，不声称 SQLite 与文件 I/O 天然原子。测试核对仅选中依赖、冲突 ID、格式损坏/超限、Thread 切换、Undo/Redo、清理、发送快照及旧草稿兼容。

## 七 内容锚点和阅读来源

T3 的 [timelineScrollAnchoring](https://github.com/pingdotgg/t3code/blob/10f39eb9ac80c9a4b7f5097575dd2addc3b6f631/apps/web/src/components/chat/timelineScrollAnchoring.ts)用 row ID、条目内偏移、scrollOffset 与 atEnd 区分末尾跟随和自由阅读，先建立 hydration 基线，再处理新工作。d-pi ReadingPane 仅保存 scrollTop，前文高度、宽度或 Composer 高度变化会把相同像素映射到不同内容。应在既有 ThreadModel 保存按 ReadingView/source/generation 隔离的内容锚点，DOM 测量留在 Renderer，跟随/恢复由小型纯规则裁定。锚点不存在时采用明确定义的像素或末尾降级，不把补齐当新 turn。

[threadHistoryMerge](https://github.com/pingdotgg/t3code/blob/10f39eb9ac80c9a4b7f5097575dd2addc3b6f631/packages/client-runtime/src/state/threadHistoryMerge.ts)依赖 sourceThreadId/sourceItemId。d-pi live item ID 是 projection 的 nextId，history entry ID 是原生 JSONL record.id，公开 DTO 没有可靠对应。不能通过内容、相邻时刻或数字相似猜合并。本次保留 live/history 分开的可读来源，把内容锚点和页请求 lease 做完整；如果以后建立原生共同身份，另行定义重叠、隐藏和旧页优先级，再开放合并。

材料把 T3 的详情 revision 描述得过强：其 itemDetail 在运行状态使用统一 `live` key，ProjectionStore 按 Thread/item 读取当前值，没有用请求 revision 做精确快照前置。可以采用按需详情与 loading/absent/truncated/error 的表达，不能据此宣称“查询到请求时的那一版”。d-pi 现有投影内详情继续以当前 item/generation 为准；任何未来独立读取必须返回实际 revision 并标明 stale，不新增缺乏原生定位能力的伪详情接口。

## 八 诊断系统必须解释自己的缺口

[observability trace sink](https://github.com/pingdotgg/t3code/blob/10f39eb9ac80c9a4b7f5097575dd2addc3b6f631/packages/shared/src/observability.ts)按 failure episode 报告首次失败与恢复，并禁用自身递归 tracing。d-pi 采用这个故障语义，继续异步有界写入；T3 的同步 rotating sink 不适合直接放到 Main 热路径。

当前 Writer 的 degraded 永久保持 true；append 与 retention 共用 catch，成功写入后的 readdir/stat/unlink 失败也增加 dropped。应区分：写入前未发生落盘的丢弃；append 失败但可能部分写入的未确认数量；已写成功而留存清理失败；非法采集输入；关闭 drain 达限。累计数量不能在恢复时清零，当前 episode 与历史恢复分别有界表达。恢复后尝试写受控 gap 摘要，摘要失败不递归告警，不承诺崩溃或持续磁盘失败时仍能保存它。

[NativeProtocolLogging](https://github.com/pingdotgg/t3code/blob/10f39eb9ac80c9a4b7f5097575dd2addc3b6f631/apps/server/src/provider/NativeProtocolLogging.ts)只提取结构摘要，但其 method 语法检查并不等于业务允许值目录。d-pi 原始 record 目前直接 stringify(event)，TypeScript 不能限制运行时外部值。新增源头字段选择和允许值验证，可信 Writer 覆盖 time/process/build/instance 身份，拒绝未知字段和不可接受原值；继续独立读取/导出过滤。UUID、截短字符串与正则“长得像方法”都不能替代白名单。

验证检查原始 JSONL 和导出字节，而非只查看 UI。向入口注入 token、路径、URL、正文、循环对象、toJSON 和巨大负载，日志异常不得改变业务结果。队列、单条、批次、轮转、留存和关闭预算沿用 B6。查询/导出仍只读落盘内容，不等待 Writer flush。诊断 UI 和反馈元数据分开表达现在健康与历史不完整。

## 九 确定性回放与可测收益

T3 的 [ProviderReplayGate](https://github.com/pingdotgg/t3code/blob/10f39eb9ac80c9a4b7f5097575dd2addc3b6f631/apps/server/src/orchestration-v2/testkit/ProviderReplayGate.testkit.ts)在标记处等待测试释放。[PiAdapterV2 testkit](https://github.com/pingdotgg/t3code/blob/10f39eb9ac80c9a4b7f5097575dd2addc3b6f631/apps/server/src/orchestration-v2/Adapters/PiAdapterV2.testkit.ts)是 stdio transcript controller，固定版并未将通用 replayGate 接到 Pi registry；真实 gate 集成可查 [CodexAdapterV2 testkit](https://github.com/pingdotgg/t3code/blob/10f39eb9ac80c9a4b7f5097575dd2addc3b6f631/apps/server/src/orchestration-v2/Adapters/CodexAdapterV2.testkit.ts)。因此借鉴两种机制的组合，不能宣称复制了 Pi 已有 gate。

d-pi 的回放必须驱动当前 FrameDecoder/schema、Host 观察和 ConversationProjection，而非另一套测试 reducer。首批为 ACK 后断流、Stop 后尾事件与物理退出、旧 generation 迟到响应；再复用现有 unknown/truncated chunk/并发 Thread 样本。test-only transport 不进入生产写通道，不执行模型网络、Git 写或真实 prompt。真实 SDK smoke 与 fixture 各自回答协议漂移和确定性行为。

正向收益逐链路测量：Git 压力下真实活跃 child、等待准入与取消后的存活时间；附件/编辑的无关通知、文档 rewrite 与缓存/lease 上限；锚点返回同条内容的偏差；Writer 原始字节安全、故障统计准确和恢复；Host 关闭后等待/观察释放。完整性能数字必须带版本、负载、样本和局限，不能引用上游性能自评作本应用成绩，也不能只凭行数减少宣称优化。

## 十 后续机制与明确不采用项

终端 ACK 窗口、generation/resetVersion/offset cursor、尾部 ring buffer 与状态/输出分离是合理储备，但 Main PTY、上游回压、VT/alternate screen 与 ABI 仍需对应产品切片验证。当前没有终端，不建立为了迁移而存在的空抽象。

目录 restore 的同路径、嵌套、symlink、归档占用与活跃进程检查，以及命令接受/实际副作用前双检值得保留。但双检仍有竞态，不控制外部 CLI；实际 `/wt` 或 restore 进入授权范围时，再定义目录预约和物理操作范围。当前不引入 checkpoint 账本或 worktree 写操作。

Review 已阅绑定屏幕左右内容版本，未知版本不能声称当前已阅；这是未来本地 Diff Review 的设计依据，不是采纳 PR 管理器。T3 save coordinator 未传 expected disk version，不能证明外部修改冲突安全；未来文件编辑仍需要自己的磁盘版本合同。全文索引、持久 Git 缓存、任务进度与用量页也不能无可靠来源直接建设：unknown 成本不是零，工具文本不是文件变化事实。

本次完整目标以 [spec](spec.md) 的可核验行为为准。研究中的不采用项是有证据的设计结论，M3 储备没有变成实施前置；所有选定目标必须工程完成、收益成立并通过组合复核后才宣布完整完成。已通过的独立可操作部分可以先交付试用，重要待决只暂停依赖部分；试用和用户认可继续单独记录。

## 十一 实施与独立评审后的校正

以下是本轮真实执行得到的补充结论，状态仍以spec和[组合证据](evidence/07-integration.md)为准。

**稳定业务ID不等于稳定资源身份。** 初期历史保护仅在新attachment ID出现时登记，真实PDF失败→同ID重试成功会产生新derived digest。删除、保存、GC、Undo的独立复现暴露内容缺失。可靠的保护点在Main manifest发布：所有已有epoch同步核对旧+新摘要，先原子检查预算再写SQL和pin；没有足够预算时保留旧事实，不能改报转换失败。Renderer重复发送相同ID不能替代拥有者对真实资源变更的登记。[03证据](evidence/03-input.md)记录已修复的真实红绿。

**一次成功的编辑事务尚未完成资产接棒。** clipboard snapshot、Main clone/import handoff、当前正文、Undo/Redo、持久采用分别有不同的存活条件。迟到的未插入clone可以discard；已经插入后Undo仍可能Redo，必须保留；明确清史或缓存淘汰后无任何正文/历史依赖的clone应释放额度，仍未保存的当前正文则不能出现GC保护空窗。最后一条独立复现绕过“粘贴后已保存”的常规路径，证明原实现可永久占满128个handoff。该修复还必须保留普通PDF的显式清史预算恢复，不能把所有当前ID都留在旧history lease里。资源数量有上限和正常用户动作后可恢复容量，两个条件都需要证明。

**Editor可以销毁，未确认清理的责任不能随它消失。** 两轴在正常额度回收修复后独立复现：一次release未执行Main而失败，后续update成功掩盖失败；再次reset丢原leaseId；实际缓存淘汰删除model后也失去重试入口。这说明当前编辑成功、无可缓存EditorState和旧资源完成清理是三个不同事实。清理计划应由有界无头owner持有，保留可信归属和原租约，并按当前正文/历史依赖执行；只有Main确认才解除阻塞。不能用布尔failed同时覆盖不同责任，也不能为恢复而无限保留退役Editor。最终以9个history owner、9个待准入Controller/80,000候选ID约束无头接棒，真实失败恢复、Main ACK后自动准入及GC/Undo反例已独立闭环；提交、红绿及限制见[07](evidence/07-integration.md)。

**责任合同必须覆盖每个结果分支。** PM拒插已正确移交discard，仍不代表正文变化后迟到、adapter卸载或Editor销毁的分支也正确。两轴真实复现发现迟到分支仍直接RPC，unavailable后没有重试入口。最终将所有存活Thread的未使用clone交原AttachmentModel，失败期间阻止新增import，以相同IDs重试并在Main ACK后释放。单批GC删除0也不能独自证明泄漏，超过扫描预算必须续扫；本次128clone复核以quota恢复、真实ACK及完整续扫物理删除共同证明收益。真正Thread owner销毁和document释放仍分别核对，不能从普通导航测试推广成二者恒等。

**底层资源正确之后仍要验证真实订阅。** 新owner等待正常LRU释放的有界设计在纯模型测试通过，但pending快照每次新建对象，实际React第十Thread触发无限更新。稳定快照与订阅通知是React接缝的行为合同；真实React红绿证明pending展示及Main ACK后自动恢复，不用额外retry。这项修复源于d-pi实际接缝，而不是移植上游的一整套状态工具。后续任何无头模型接入GUI都需要沿真实订阅、原子事务拒绝和反向用户动作验证。

**再次采样失败不证明内容发生变化。** Git前后比较用于验证基线，二次读取too-large或not-git是实际失败原因，不是成功取得另一版内容。已修复的独立真实回归表明，只有完整成功的样本差异才能归changed；未知或失败继续保留类型化事实。这个规则也适用于配置、详情版本、原生所有权和恢复判断。

**“检查通过”与“所有边界已经正确”是不同证据。** 首次完整矩阵937项通过后，两轴review仍找到Git与PDF问题；959项通过及真实macOS复制链路通过后，另一个真实PM/Main/SQLite交错仍找到clone释放问题。后续工作不应机械堆测试或把framework当正确性保证，而应检查业务的反向动作、未持久阶段、同身份下的资源变化和跨await的释放顺序。独立审查与自动化各自回答这些具体问题，用户体验仍需实际试用。

**收益与成本应分别成立。** 同一Git压力样本active峰值24→4、取消后资源结算缩短，排队增加是有界资源的代价，不能宣称所有请求更快。内容锚点把约104px的相对漂移消除，在固定几何样本绝对偏差约0.22px。Writer源头过滤增加约0.83ms/100次采集的p95成本，换取原始字节安全和可解释的故障缺口，不冒称速度提升。附件的成功收益以真实GC后仍可Undo/prepare和已放弃依赖可释放证明，不以代码减少或虚拟容量测量替代。
