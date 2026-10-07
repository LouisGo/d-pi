# T3 养分吸收与基础重构

2026-10-07。集成基点 `598323321c8c2ba6eb177097e2042510c3b79d87`，分支 `codex/t3-foundations`，工作树 `/Users/louistation/.codex/worktrees/t3-foundations/d-pi`。固定研究和完整结论见 [research](research.md)。

## 推进与交接

- 授权：用户本轮明确要求完整消化研究材料、独立研究与思考、写完整结论，随后文档/契约先行实施全部既定重构优化目标，功能不受影响且确保正向收益。该授权涵盖以下工程目标及必要回归、组合验证、本地提交和可审查交付；远端 push/PR/merge/公开发行并未由本轮要求指定。
- 受影响决定：D-02/D-03/D-10/D-21/D-22/D-24/D-26/D-28–D-30/D-33/D-35/D-37/D-38/D-39。保留 OMP 执行/历史、Main 持久化、Host 连接关联、Renderer 交互；不扩 Effect 到 Files/Changes，不换 Atom/Schema，不引入 XState。
- 结果：六组可操作/可观测目标及其组合工程验收，逐项满足下面的退出条件；既有 M2 供应商/PDF/系统通知/用户认可等开放父票不由本轮自动关闭。
- 重要待决：跨 Thread 动态 @文件/目录的复制语义，已通过本轮文本选项询问用户：复制时冻结来源、发送时读取原项目或限制同工作目录。只暂缓 04 中依赖该选择的部分；原引用行为、附件 owner/关闭/Undo 保护、私有图片及冻结选区的基础合同可独立准备。
- 工程：01/02/03/05/06 与04独立部分已串行集成，完整check/build及真实macOS剪贴板通过。独立两轴评审已修复Git失败归因及PDF同ID新派生摘要保护；最终Spec还确认一个P2：未保存的粘贴克隆在Undo/清史后仍占128额度。正在隔离修复资产接棒与精确释放，动态引用复制语义仍待决，不宣布完整退出。
- 试用：尚未交付；完成后的默认入口为该工作树 `pnpm dev`，不为本轮机械打包。工程验证、真实系统检查及用户认可分别记录。
- 执行：主 Agent 单写状态、契约、集成和诊断；独立 worker 固定各自基点/工作树实现原生、读取和输入，串行集成后推进依赖票。派发映射在实施时追加。不得把研究工作树当自动隔离。

```project-status
[{"id":"t3-foundations","title":"T3 研究与基础重构","phase":"基建","engineering":"in-progress","trial":"not-delivered","acceptance":"pending","evidence":["research.md"],"next":"按六组合同完成实施与组合收益验证；动态引用复制语义等待用户选择","constraints":"unknown 不重发，冷恢复只读；native/live 无可靠原生身份时保持独立来源；M3 能力仅作设计储备"}]
```

```implementation-plan
[{"id":"foundations","tickets":["01","02","03","04","05","06","07"],"hold":{"04":"动态文件/目录搬运涉及版本及跨项目权限，等待本轮用户选择；先完成03和其他独立票"}}]
```

## 固定基点派发

三个 implementer 均从文档契约提交 `851d3e59aa4782266a50a7e55bb63048ec5459dc` 开始，分别单写隔离 worktree：

| 票 | Worker / 工作树 | 集成规则 |
| --- | --- | --- |
| 01 | research_native，`/Users/louistation/.codex/worktrees/t3-native/d-pi` | 原生与回放提交完成后由主 Agent cherry-pick |
| 02 | research_reads，`/Users/louistation/.codex/worktrees/t3-reads/d-pi` | 读取及必要旧 wire fixture；application wiring 冲突串行处理 |
| 03 | research_input_reading，`/Users/louistation/.codex/worktrees/t3-input/d-pi` | 输入及历史资产，补必要中英文输入 key；不自动实施04/05 |
| 06 | 主 Agent，集成工作树 | 诊断及单源目录/状态；后续负责串行接棒 |

各自运行受影响验证并保留红绿/真实边界证据，不写其他票或共享生成状态；主 Agent 才更新规格、票、看板和集成。

## 设计目标与退出条件

| ID | 目标与唯一拥有者 | 完整退出条件 |
| --- | --- | --- |
| 01 | NativeSession 的 typed failure、单 Host task Scope、确定性协议回放 | spawn/protocol/write/timeout/local interruption/unavailable 可区分并映射安全 Main 诊断；scope 结束收束本 owner 等待/观察，另一 owner 不受影响；保留 refresh singleFlight/version/dispatch 保护、timer unref、物理 close/groupStopped；三类真实 decoder/Host/projection/SQLite 回放验证 ACK 后断流、Stop 尾事件、旧 generation，写请求不重发 |
| 02 | Main-owned 只读 operation；Files 句柄、共享 Git runner | Renderer signal 经两个 DTO 入口取消所属操作，source/Thread/operation 复核；离开一个共享 observer 不取消剩余读者，最后 observer 释放读取；有界 active/queued/operation，排队取消不 spawn，permit 等 child close 才释放；完整机器输出或明确失败，filter/config 失败不放行 diff；typed reason/retry 正确；同负载前后实测资源上界、取消耗时及功能保持 |
| 03 | Thread-owned 附件来源与编辑 epoch；Main 资产 GC | 所有附件源、失败/重试/完成归无头 owner，UI 仅意图/订阅；send 在 capture 前后复核同一 readiness，close freeze 全源→save→重查→当前 attempt lease 释放；用户动作撤销分组明确，A→B→A 独立；Main 历史租约保护真实资产，删除→保存→clean→Undo 仍可准备发送，消费/清历史/缓存淘汰/关窗释放并有界 |
| 04 | Main-owned 有界可信 clipboard snapshot，input 单事务粘贴 | 版本/大小/来源/选择依赖验证、handle TTL/实例/目标隔离、Main 私有资产复制和目标新 ID/token 映射；实际同步 ClipboardEvent 能与 async export 接通；文字+图片+冻结选区同版插入/Undo，动态引用服从用户选择；伪造路径/URL无新权限，未知/坏/超限/过期明确可读降级；迟到导入不插新 Thread/消费后草稿；旧草稿兼容 |
| 05 | Thread/window 保存按来源隔离的阅读内容锚点，Query/page attempt owns updates | 上方阅读不被 stream 拉末尾，A→B→A、宽度/Composer 高度变化保持同内容偏移；live generation/native session/source/page 隔离，hydrate 不伪造新轮次；锚点消失有定义 fallback；同 cursor 重试旧返回/finally 不覆盖新操作；保留 bounded body DOM/selection，native/live 分源不猜合并 |
| 06 | Main 异步有界 Writer；采集与读取/导出两道安全边界 | 原始落盘及导出字节无秘密/任意字段/原始 Cause；可信身份不可被输入覆盖，坏值和 stringify/toJSON 异常不改变业务；写前丢弃、append 未确认、留存失败、非法采集、drain 达限分开，累计值不清零，当前退化可恢复并有界 gap 摘要；慢写/失败/恢复/轮转/清理/close 测试，查询不等 flush；固定样本记录成本 |
| 07 | 主 Agent 集成、独立 Spec/Standards 复核和 Dev 交付 | 上述全部目标及必要合同更新完成，受影响测试/真实边界/资源收益记录可从提交取回，完整 check/build 通过；独立两轴 review 无未处理高价值问题；试用步骤和真实限制清楚，不把 fixture/Agent 检查写作供应商或用户认可 |

## 关键跨边界合同

### 原生等待与业务结果

局部 NativeRequestFailure 不暴露 Effect 类型，至少保留 `kind: spawn|protocol|write|timeout|interrupted|unavailable`、安全 operation、适用的 native requestId/timeoutMs；预算可用有限 subcode。disconnect 先保存 typed 原因再关闭 Scope，不让 protocol/write 被后续 interrupt 覆盖。Host 经 strict DTO 携带有限 nativeFailure，Main 以既有 `code/causeCode` 映射，固定代码为 `native-spawn/native-protocol/native-write/native-timeout/native-interrupted/native-unavailable/native-request-limit/native-input-budget`。未知程序异常保持 unknown 归因。

取消局部 Native wait 不发送 abort，不决定 turn 结果。ACK、精确 prompt_result、settled、child close、groupStopped 分别成立。Host task scope 禁止关闭后新任务，scheduled handle 完成即移除；观察迟到仍核对版本/closing，不把 Scope 包 Promise 当物理取消。回放只替换 process/stdio 外部接缝，必须保留同一次 push 的帧与 Promise 调度顺序。

### 只读 operation 与取消

每次实际 queryFn invocation 创建 UUID operationId（不进入资源 Query key），同 attempt 保持 trace。request/cancel 为 strict 可序列化 DTO；AbortSignal 留在 Renderer helper。Main 在首个 await 前注册可信 sender/frame、原 ThreadContext、controller 与终止 promise；start 仍复核 active Thread，cancel 只核对原 sender/operation。重载/源释放/退出取消所属操作，禁止 PID 输入、跨 sender 接管和在途同 ID 重复 start；终态释放 operation 登记，不保留无界 tombstone。

新 wire 结果区分 completed(reply)、cancelled、failed(typed code/retryable/trace/operation)，preload 校验形状及关联，domain unavailable 仍是读取结论。timeout/io/已证 transient exit 可以沿用有界 Query retry；busy/无效来源/重复操作/坏机器输出/invalid-reply 不 retry；取消不 toast。queued 执行前复核身份，所有实际资源释放后才结算终态。Git active、queue、operation 及整体 deadline 的初始数值和基线实测随 02 记录；不把 T3 常量当最优值。

Files 不承诺抢占不可取消 syscall，abort 后停止新阶段并 finally close。目录保持既有排序/截断意义，改变遍历预算时明确完整性。Git body/NUL/config/路径严格 UTF-8 与完整记录校验，byte cap 不解析部分成功；防护 config 和前后样本失败保留真实 failure，不误报无 HEAD 或 changed。runner 不重复内部 retry。

### 输入、撤销与资源接棒

DraftController 仍是正文保存/消费唯一协调器；Tiptap/EditorState 保有文档、选区和撤销，不新增独立双写 DraftSnapshot。AttachmentModel 归 ThreadModel，browser FileReader 归 renderer adapter，Main owns manifest/content。所有 source intents 都经过同一冻结/readiness，外部 revision/提交消费清除相应历史 epoch。

Main history lease 绑定可信窗口+editor epoch+Thread，验证真实 manifest 及有限 ID 集合；可保守保护该 epoch 曾进入撤销历史的超集，直至历史清除/缓存淘汰。数量与资产预算有界，达限不得静默让仍可 Undo 的资源消失。GC 纳入 transient pin epoch，在 await 和实际 unlink 前复核，不能仅看之前的 SQLite 引用快照。

clipboard snapshot 只从当次可信源的选中依赖建立；私有资产经 Main 内部引用复制、核验摘要和 lease 接棒，正文/token 一次事务映射，冻结选区保真。动态引用语义在用户选择后细化，不能暗读目标项目同名文件。失败/Undo/消费后的晚结果只归原操作，不自动重新插入；fallback 显示未搬运的上下文而不静默漏发。

2026-10-07最终Spec复现补充：成功粘贴的未持久克隆不能永久停留在import handoff。Main按可信document/Thread、实际编辑epoch与当前正文的保留ID核对接棒；仍可Redo、cached history或未保存当前正文保持真实pin。明确清史/缓存淘汰后已无正文及任何history依赖的未采用克隆必须解除pin与额度；新epoch接棒不得出现GC保护空窗，不通过重载/关窗恢复正常粘贴。

### 阅读来源与详情

ReadingAnchor 使用 source scope、rowId、offsetWithinRow、pixel fallback 与 atEnd；live scope含真实generation，native含session/source/page。Thread owns anchor，Renderer owns DOM/ResizeObserver，恢复不改执行事实。当前 history/live 无原生共同身份，本轮不合并；现有详情从当前投影读，不能为已截断内容创建伪重读接口。未来独立详情必须返回 actual revision/coverage，T3 cache revision不是精确版本证据。

### Writer 安全与故障口径

record 在 stringify 前只选择允许字段和值，Writer 自己填时间/构建/进程实例。非法字段和方法/错误码原值不落盘，字段长短/正则外形不是脱敏。reader/export 继续独立过滤。新增诊断字段/码目录单源维护，不能通过关闭校验消除不兼容。

`dropped` 只表示可确认写前丢弃；`uncertain` 表示 append 失败时未确认记录，不能宣称物理丢失；`retentionFailures` 不算已写记录丢失；`rejected` 表示非法采集/关闭后拒收。当前 episode、最近恢复和累计统计分开有界表达。恢复摘要只有受控计数/时间/枚举，无正文；摘要失败不递归记录自身。close 停新采集、幂等、最多 B6 的2s等待，队列达限结算，已启动不可中止 I/O 如仍在途准确表示未知，不在后台无限 drain。

## 验证与交付

逐目标执行 TDD；既有正确行为作为回归。各 worker 运行受影响检查并保留真实失败/通过；主 Agent 集成后运行 type/lint/architecture/documentation/status 和必要组合测试，最终 `pnpm check` / `pnpm build`。真实 Git/File/SQLite/Native 子进程与合成 replay 分开。输入使用实际 ProseMirror/React 和可信 Main 集成；原生剪贴板与几何若低层仍不能证明，再一次受控 Electron 场景补证，停止条件随验证记录。

性能与资源对照只回答本轮变化：读取压力与取消、输入 rewrite/retained sources、阅读锚点误差、Writer 采集/故障成本。保留固定负载、版本、样本和测量限制，不以单次快慢或上游宣称确定收益。用户选择和体验认可不能由测试替代；未完成目标保持 open/claimed，不以预算或文档完成宣布总任务完成。

## 任务

- [01 原生连接与确定性回放](issues/01-native-scope-replay.md)
- [02 读取取消与资源合同](issues/02-read-resources.md)
- [03 输入生命周期与历史资产](issues/03-input-lifetime.md)
- [04 可信结构化剪贴板](issues/04-structured-clipboard.md)
- [05 阅读内容锚点](issues/05-reading-anchors.md)
- [06 安全诊断与恢复](issues/06-diagnostic-recovery.md)
- [07 组合验证与交付](issues/07-integration-delivery.md)

04 独立实现由 research_reads 从集成提交 `7f407de` 切 `codex/t3-clipboard` 接棒；05 由主 Agent 完成正式 Thread/ReadingPane 接线。两者不共享写入路径。
