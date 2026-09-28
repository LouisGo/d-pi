# S2 发送交接：定向核对与已确认方案

日期：2026-09-28。状态：**confirmed-option-a**。用户明确答复“保留官方 OMP。开始同步规格并推进 to-tickets”。方案 A 已确认，D-24 及基础契约同步修订。下面调查表中的“现行要求”指选择前的严格业务接受条件；源码限制仍成立，已不再阻塞 S2 清稿。

## 用人话说明

标准 OMP 可以告诉 App“这个调用收到了”，但目前核对的接口没有为普通文字发送提供一个额外的、可靠绑定本次发送的“内容已进入执行”的通知。第一条回复可能成功，后面又报告失败；普通流式事件不直接带这次发送的请求 ID。

这不代表 OMP 无法执行，也不代表内容一定会丢。困难在于我们此前要求：只有确认业务接受，才腾空对应输入框。如果希望原封不动保留这个要求，就需要进一步增强接收确认通路。另一条路径是用已经可靠落盘的发送记录保护原文，不让输入框承担唯一保管职责。

## 本次新核对的证据

所有来源固定为 OMP commit `62bc57be1b03ef0802a33cf7f5f530e534527531`。仅查资料，不运行个人 OMP、不读取凭据、不安装产品依赖。

| 入口 | 已确认的事实 | 能否直接满足现行要求 |
| --- | --- | --- |
| [官方 RPC 协议](https://github.com/can1357/oh-my-pi/blob/62bc57be1b03ef0802a33cf7f5f530e534527531/docs/rpc.md#immediate-ack-vs-completion)与[实现](https://github.com/can1357/oh-my-pi/blob/62bc57be1b03ef0802a33cf7f5f530e534527531/packages/coding-agent/src/modes/rpc/rpc-mode.ts#L1187-L1249) | prompt 首次 ACK 与完成分离；异步错误可以沿同一 requestId 回来。已取 rpc-mode 与仓库存档逐字节一致。 | 否。ACK 可以作为“调用收到”的证据，不能在现行 D-24 下作为清稿依据。 |
| [PromptOptions](https://github.com/can1357/oh-my-pi/blob/62bc57be1b03ef0802a33cf7f5f530e534527531/packages/coding-agent/src/session/agent-session-types.ts#L345-L364) | 没有提交 ID 或接收回调。已有参数控制模板、图片、流式行为、工具选择与归属等。 | 没有找到无需改变通路即可增加准确关联的选项。 |
| [公开 SDK](https://github.com/can1357/oh-my-pi/blob/62bc57be1b03ef0802a33cf7f5f530e534527531/docs/sdk.md)及[普通 prompt 的返回](https://github.com/can1357/oh-my-pi/blob/62bc57be1b03ef0802a33cf7f5f530e534527531/packages/coding-agent/src/session/agent-session.ts#L7073-L7099) | SDK 原生运行于 Bun；普通路径 await 执行及后续恢复才返回。 | 直接包一层 Promise 不是及时的接收确认；会新增随包 SDK/Bun 的集成与验证，不能当作零成本替换。 |
| [扩展消息事件](https://github.com/can1357/oh-my-pi/blob/62bc57be1b03ef0802a33cf7f5f530e534527531/packages/coding-agent/src/extensibility/extensions/types.ts#L784-L806)及[扩展发送接口](https://github.com/can1357/oh-my-pi/blob/62bc57be1b03ef0802a33cf7f5f530e534527531/packages/coding-agent/src/extensibility/extensions/types.ts#L1434-L1446) | 消息事件没有本次普通 prompt 的 requestId；sendUserMessage 返回 void，参数也没有提交身份。 | 单纯监听事件或调用 sendUserMessage 没补上精确关联。不能按“下一条 user message”或相同正文猜测。 |
| [promptCustomMessage](https://github.com/can1357/oh-my-pi/blob/62bc57be1b03ef0802a33cf7f5f530e534527531/packages/coding-agent/src/session/agent-session.ts#L6614-L6744)与[普通 prompt 预处理](https://github.com/can1357/oh-my-pi/blob/62bc57be1b03ef0802a33cf7f5f530e534527531/packages/coding-agent/src/session/agent-session.ts#L6404-L6441) | 自定义消息可带 details，但入口和处理路径不同；普通路径包含命令/模板展开等行为。 | 未证明可以无语义变化替换普通文字发送；不借用自定义角色或隐藏提示词绕过既定原生行为。 |
| [Agent.prompt](https://github.com/can1357/oh-my-pi/blob/62bc57be1b03ef0802a33cf7f5f530e534527531/packages/agent/src/agent.ts#L1297-L1353) | 底层可直接接受消息对象，但跳过 AgentSession 普通提交的准备逻辑。 | 不用调用底层/替换方法来假装仍保留完整原生语义；未采纳 monkey-patch 或复制原生准备流程。 |
| [ACP prompt](https://github.com/can1357/oh-my-pi/blob/62bc57be1b03ef0802a33cf7f5f530e534527531/packages/coding-agent/src/modes/acp/acp-agent.ts#L822-L903) | 维护请求生命周期，但重叠 prompt 会走隐式取消路径，回复围绕 turn 结束组织。 | 切换协议不只是补一个接收通知，还牵涉 D-11 队列/控制语义，不作为 S2 快捷替换。 |

结论限定于已核对的这些入口，不声称穷尽上游所有可能方案，也没有证明一定需要长期 fork。当前没有可直接采用、同时保留全部现行要求的公开适配方案；继续泛搜或重跑旧 Runtime 探针不会替用户完成下面的取舍。

## 方案 A：持久发送记录保护内容，保留官方 OMP（用户已确认）

### 用户会看见什么

1. 用户发送 A，App 先将 A、Thread、revision 和 submissionId 可靠落盘。
2. prepared/dispatching 落盘后才发给 OMP。在这之前失败，仍留在编辑区。
3. 收到与本次调用准确关联的成功回执后，Main 将“调用已确认收到”及对应草稿消费标记一起落盘，然后才腾空仍对应 A 的输入。后来输入的 B 始终保留。
4. A 仍以持久发送记录出现在消息区，可以查看和复制；不得依赖原生历史已经保存 A，不自动回收这个唯一可靠副本。
5. 界面如实写“已交给 OMP 处理”，不说“业务已接受”或“执行成功”。流式输出和执行状态独立展示；没有可靠逐提交关联的事件只归属 Thread/会话，不伪造一一对应。
6. 后续同 ID 报错，原发送记录显示错误并保留 A；无法确认接收或执行结果时显示相应未知状态，不自动重发，也不把 A 强行盖回 B。

### 工程含义与例外

- 增加明确的 `acknowledged`（通信确认）事实，不把它重命名成现行 `accepted`。原生业务接受只有额外可靠证据时才记录，不以通用 prompt 的 ACK 偷换定义。
- 清稿条件调整为“冻结内容可恢复 + 正确调用回执 + 确认/消费标记持久成功”。使用既定的持久消费标记与原保存写序列，仍不会让 Main 独自推进草稿 revision。
- ACK 未到、超时/断链或确认写入失败，不腾空未交接草稿；重启残留 dispatching 保留 unknown。已持久 ACK 后的崩溃不抹掉“调用已确认”事实，但后续执行结果可以未知/中断。
- 晚到错误与原提交关联；不能因为它晚于 ACK 就断言副作用尚未发生，也不能默默恢复自动重试。
- 这是持久发送记录，不是 App 自动消费队列；不派发重放、不模拟原生队列。S2 仍只验收闲时发送和同 Thread 的第二次提交。
- S2 保留发送原文；未核实原生持久化及可恢复性前不因 ACK/界面完成而 GC。缺容量拒绝新增、保留既有内容，不引入静默删除策略。

### 改变与不变

改变 D-24 中“业务接受后才清稿”的门槛，以及普通 prompt 收据如何区分通信确认与业务接受；已按用户明确答复同步决定登记、基础契约、Composer/执行合同及本切片规格。该变更来自用户决定，不是工程细节自行批准。

保持固定官方 Runtime、原生普通输入语义、原生执行/队列所有权、prepared/dispatching 先落盘、unknown 不自动重发、冻结内容可恢复、B 不被清理等要求。

代价是：输入框可能已经腾空，随后才显示这次调用失败；用户从发送记录查看/复制 A。好处是无需仅为清稿确认维护带修改的 OMP。

## 方案 B：保持严格清稿要求，准备 Runtime 增强方案（待确认）

不修改 D-24。进一步准备固定版本 Runtime 的接收确认增强设计，要求在原生真正纳入消息/队列的边界产生可关联证据，而不是在调用 prompt 之前人工发一个“已接受”。

具体边界：提交身份在原生准备路径中传播；接受前拒绝、已纳入后失败、命令本地处理、准备中取消都能区分；事件不向模型正文插入隐藏 ID，不改变队列所有权；ACK 丢失或实例崩溃仍保持 unknown。要核对普通消息、扩展/命令、重试与下一次提交的关联释放条件。

这可能需要维护带补丁的固定 Runtime 或向上游增加能力。不能预先承诺修改很小、补丁长期兼容或构建已可用；需额外构建、打包与原生行为验证。用户选择 B 只授权准备具体增强方案，不代表任意 fork/重写已获批准；若最终必须长期维护分支，明确提交维护范围再决定。

## 决策与后续

2026-09-28 先提出 A/B 选择，随后用户明确选择保留官方 OMP 并同步规格、推进 to-tickets，即采用 A。B 未采纳；不继续为普通 prompt 寻找额外接受通路，不修改官方 Runtime。D-24 保留原规则和取代依据，状态以 [spec](spec.md) 为准。01–06 本地票已建立，无产品实现、新 Runtime 实验或 commit/push。
