# S2 规格证据记录

后续进展：2026-09-28 在用户要求继续推进后，补查 SDK、公开扩展、普通/自定义输入与 ACP，形成 [接收交接决策材料](acceptance-decision.md)。用户随后明确选择保留官方 OMP，方案 A 已确认。额外业务接受关联的源码限制仍成立，但不再是 S2 清稿前置；本页原先“后续核对/保留 T1”的时间状态以该材料和 spec 交接为准。没有新增 Runtime 实测。

日期：2026-09-28。方法：当前工作区读取、已有记录复用、固定官方源码核对。没有执行 OMP、读取个人凭据、发送模型请求、安装依赖或运行新的 GUI/Runtime 实验。本页的源码结论不是本应用集成验收。

## 当前项目基线

- `git status --short`：开始时无修改；HEAD `3faea9d`（S1 巩固），其父 `e9d256f`。交接中的“未提交巩固”已过时；没有 reset、pull、覆盖或清理。
- [S1 spec](../m1-s1-project-draft/spec.md)、[handoff](../m1-s1-project-draft/handoff.md)、[hardening](../m1-s1-project-draft/hardening.md)、[机器结果](../m1-s1-project-draft/evidence/hardening.json)：既有 8 文件/33 测试、统一检查、构建和隔离恢复已通过；结果构建 `e9d256fa-dirty-8b99dc32` 是历史验证时的身份，不改写成当前 HEAD 的新实测。UnknownVizError、新增视觉区域待试用、旧包未替换继续保留。
- [DraftController](../../src/modules/input/core/draft-controller.ts)（当时位于 `src/features/draft/controller.ts`）：内存 sequence 与持久 revision 分开，drain 会继续保存后来编辑，S1 还没有提交冻结/accepted 协调。只读 reconcile 根据本地 revision/正文判定保存，不能外推 OMP 接受。
- [DraftStorage](../../src/platform/main/storage/database.ts)（当时位于 `src/main/storage.ts`）：schema v1，仅 workspace/thread/desktop，信任约束只允许 browse；CAS 保存单独推进 revision。S2 需要有备份的迁移和新的业务事务，不能直接在 Main 清稿绕过控制器。
- [AppModel](../../src/app/renderer/wiring/model.ts)（当时位于 `src/renderer/model.ts`）：现有关闭准备冻结编辑并 flush 草稿；加入 OMP 后不能把此结果等同任务可退出。
- [构建配置](../../electron-builder.yml)目前没有正式 Host/OMP 资源。旧独立实验不能当作产品已打包。

## 固定上游

OMP v18.3.0，commit `62bc57be1b03ef0802a33cf7f5f530e534527531`。所有新取源码使用该 commit 的 raw URL，不使用浮动 main。临时副本位于 `/tmp/d-pi-s2-source`，不作为仓库永久依赖；永久来源是下列固定链接和仓库已有不可变快照。

| 来源 | 本次核对所得 | 对规格的影响 |
| --- | --- | --- |
| [rpc-mode：prompt 分支](https://github.com/can1357/oh-my-pi/blob/62bc57be1b03ef0802a33cf7f5f530e534527531/packages/coding-agent/src/modes/rpc/rpc-mode.ts#L1187-L1263) | prompt 调用异步 watcher 后先返回 success；异步 error 使用原 id。follow_up 则 await session.followUp 后才 success。 | 不能给所有命令套一条“success=accepted”的规则。 |
| [rpc-mode：结果 watcher](https://github.com/can1357/oh-my-pi/blob/62bc57be1b03ef0802a33cf7f5f530e534527531/packages/coding-agent/src/modes/rpc/rpc-mode.ts#L222-L240) | agentInvoked 为 true 时此函数直接返回；false 才在检查扩展任务后输出 prompt_result。 | RpcPromptResultFrame 类型允许 boolean，不代表普通 prompt 一定会有可关联的 true 结果。 |
| [rpc-mode：事件转发](https://github.com/can1357/oh-my-pi/blob/62bc57be1b03ef0802a33cf7f5f530e534527531/packages/coding-agent/src/modes/rpc/rpc-mode.ts#L1091-L1095)与[RPC 类型](https://github.com/can1357/oh-my-pi/blob/62bc57be1b03ef0802a33cf7f5f530e534527531/packages/coding-agent/src/modes/rpc/rpc-types.ts#L23-L99) | 会话事件直接 output(event)，未在此绑定发起 prompt 的 requestId；prompt 的公开输入也未定义 App submissionId。 | 现有读取不足以建立普通提交的可靠正向接受关联，保留 T1。不是断言上游所有扩展路径都不可能解决。 |
| [AgentSession.prompt](https://github.com/can1357/oh-my-pi/blob/62bc57be1b03ef0802a33cf7f5f530e534527531/packages/coding-agent/src/session/agent-session.ts#L6357-L6375)及[原生调用结束](https://github.com/can1357/oh-my-pi/blob/62bc57be1b03ef0802a33cf7f5f530e534527531/packages/coding-agent/src/session/agent-session.ts#L7073-L7099) | API 有原生 dispatched/queued 与本地处理的 boolean；非 streaming 路径会 await 原生执行及后续恢复。准备中也有 false/throw。 | SDK 返回值是候选依据，不能直接当成及时接受通知，更不能据此声称薄桥接已打包可用。需验证接受前/后失败分类。 |
| [followUp](https://github.com/can1357/oh-my-pi/blob/62bc57be1b03ef0802a33cf7f5f530e534527531/packages/coding-agent/src/session/agent-session.ts#L7270-L7309)及[排队消费](https://github.com/can1357/oh-my-pi/blob/62bc57be1b03ef0802a33cf7f5f530e534527531/packages/coding-agent/src/session/agent-session.ts#L7341-L7481) | 用户内容进入原生 agent.followUp 后安排消费；follow-up-only 闲时继续要求已有 assistant/toolResult 尾部，并受原生阻止条件影响。 | 不能把新空会话的第一条普通 prompt 换成 follow_up 以规避 T1；命令成功不保证已开始/完成。 |
| [原生消费前钩子与 claim](https://github.com/can1357/oh-my-pi/blob/62bc57be1b03ef0802a33cf7f5f530e534527531/packages/agent/src/agent.ts#L855-L902)、[replaceQueues](https://github.com/can1357/oh-my-pi/blob/62bc57be1b03ef0802a33cf7f5f530e534527531/packages/agent/src/agent.ts#L1092-L1107)、[队列投影](https://github.com/can1357/oh-my-pi/blob/62bc57be1b03ef0802a33cf7f5f530e534527531/packages/coding-agent/src/session/agent-session.ts#L7909-L7952) | 内部具备消费前 await 钩子、claim/preparation 和原生队列修改能力；公开 RPC 的 queue modes 是消费模式，不是用户暂停/编辑租约。 | 存在继续调查薄适配的具体位置；没有证明 SDK 导出、扩展可达性、条目稳定身份或竞争正确性。停止与编辑占用必须独立，不清空后重发来模拟暂停。 |
| [RPC 分帧官方文档](https://github.com/can1357/oh-my-pi/blob/62bc57be1b03ef0802a33cf7f5f530e534527531/docs/rpc.md)；[仓库快照](../../docs/archive/pre-reset/.scratch/omp-gui-m1/research/rpc-v18.3.0.md) | v2 分片面向 stdout；stdin 仍为单个 JSONL，文档建议不超过 advertised physical-frame limit。ready 示例 maxFrameBytes 为 1 MiB。 | 这是保守客户端预算依据，不是实测“输入超过 1 MiB 一定被原生拒绝”。4 MiB 保存与发送预检分开，按协商值和编码开销处理。 |
| [get_messages_page](https://github.com/can1357/oh-my-pi/blob/62bc57be1b03ef0802a33cf7f5f530e534527531/packages/coding-agent/src/modes/rpc/rpc-mode.ts#L1594-L1610) | streaming/compacting 返回 session_busy，数据来自 session.messages。 | 不能以该接口代替不启动 Agent 的历史浏览，busy 不能解释为空。 |
| [只读 loader](https://github.com/can1357/oh-my-pi/blob/62bc57be1b03ef0802a33cf7f5f530e534527531/packages/coding-agent/src/session/session-loader.ts#L524-L554)、[entry visitor](https://github.com/can1357/oh-my-pi/blob/62bc57be1b03ef0802a33cf7f5f530e534527531/packages/coding-agent/src/session/session-loader.ts#L388-L415) | 无 writer 的 transcript loader 与大文件流式 visitor 已存在；loader 中有 Bun.file/Bun.JSONL/Bun.sleep。只读 transcript 会在内存迁移/构建显示上下文，并非直接提供产品分页协议。 | 支持只读适配方向；不能声称 Electron Node 直接 import 可用或全量 loader 等于分页。保留 T2，按实际集成验证。 |
| [SessionStorage publish lock](https://github.com/can1357/oh-my-pi/blob/62bc57be1b03ef0802a33cf7f5f530e534527531/packages/coding-agent/src/session/session-storage.ts#L254-L302)与[存储接口](https://github.com/can1357/oh-my-pi/blob/62bc57be1b03ef0802a33cf7f5f530e534527531/packages/coding-agent/src/session/session-storage.ts#L153-L169) | 锁围绕文件变更/发布，接口并不能单独证明原生会话整个执行生命周期独占。 | 不宣称跨 CLI 单写已证实；S2 同存活实例继续，失效后的执行恢复保留 S3 门槛。 |

源码 SHA-256（便于下次复核，不要求保留临时目录）：

| 文件 | SHA-256 |
| --- | --- |
| rpc-mode.ts | f2f892eb162257094f266893c74e19aa14696b3916c23967ff56ae8fbc3d306b |
| rpc-types.ts | 351a4f234cdeafb6925ec2a3002fb004bf0bb5b65624d961f2fe78dde854df0a |
| agent-session.ts | 27c07b78a25a275dbc3438f9c6f04924a77b4a81b774da3e8ebbe25d9783849c |
| agent.ts | ad8d6f0db45f85fcd947b8167207dc284a5c7aeef85cece5d27dc5f50301a599 |
| session-loader.ts | 897e5ab26f8c346a9b53d6c271571ee7946937422e5b12be671079e889aa1003 |
| session-storage.ts | e4da59d3b72de2982d2c092b93bcf79514e4abc43a6c7ffb314331dac5cf1e16 |

新取的 rpc-mode.ts 与仓库归档快照逐字节一致。没有修改归档文件。

## 可复用实测与不能外推的部分

[Runtime 可行性](../../docs/validation/runtime-feasibility.md)和[最小随包证据](../../docs/validation/packaged-runtime-evidence.md)已经证明固定 OMP 能经 utility/MessagePort 完成本地确定性模型回合；包资源移位、可写隔离上下文和退出有旧证据。不是正式 S2 产物、真实供应商、当前输入交接或可靠业务接受判据的验收。

本次没有发现需要先重新实验“OMP 能否运行”的未知。T1 是需要定向解决的协议证据缺口；源码足以排除早期 ACK、正文匹配和 first follow_up 三条捷径，因此不为了重复证明这些结论运行新探针。T1 的扩展候选尚需后续定向核对，未声称不存在可行方案或已经需要 fork。

## 本轮文档检查

本轮 4 份新增/修改 Markdown 的 71 个本地文件链接均可定位；核对规格与既定决定/阶段边界，检查 diff 空白和新增文件格式，未修改产品代码、依赖或归档。不运行产品全量 check/build，不把旧 S1 结果登记成 S2 新通过。
