# 03 原生结果与有限持久证据

2026-10-01。工程范围见 [03](../issues/03-native-outcomes.md)；本次最终目标按用户补充授权为官方 OMP **18.4.6**、Bun **1.3.14**，仅使用 01 记录的随包 SDK 导入修正。旧 18.3.0 录制未修改。未调用个人账户或计费供应商，未扩展 M2 队列编辑 GUI，也未开放原生会话冷启动写恢复。

## 交付行为

- `state` 是 prepared/dispatching/acknowledged 等调用交接；`outcome` 和有限 `promptResult` 是独立原生观察。`prompt_result` 仅按 requestId + 完整 target 关联，不从 agent_end、generic idle 或文本推断归属。
- ACK 与对应草稿消费保持同一 SQLite 事务。终态可先入库，此时不清稿；后到 ACK 才消费对应 revision。已保存 error 不被 success、拒绝、重复帧或连接中断擦除。
- 内置本地命令的 `response.data.agentInvoked=false` 单独标记 `native-local-response`，不伪造缺失的 prompt_result/sessionSettled。扩展本地命令使用真实 prompt_result。
- completed 且 sessionSettled=false 保留活动约束；generic idle 不允许 closeIdle。真实 session_settled 或新鲜原生 isSettled/control 采样才确认停止。prompt 结果不承诺 Renderer 已收到最终正文，正文继续由 full message_end/原生阅读同步提供。
- Host 最多 128 个未决请求关联、15 分钟期限；最多缓存 256 项未确认 evidence，重复事实合并，1–30 秒退避和 attach/replay-evidence 只重送同活实例证据。Main commit 成功后才发送 confirm-evidence。已确认关联另外最多保留 128 项/15 分钟的无正文身份，识别重复终态和迟到错误；到期/淘汰后无关联结果如实报告 gap。
- Main 写失败先显示覆盖缺口；未确认事实阻止正常 idle 回收/退出，即使 ACK 已保存且原生已 idle；同活证据成功持久化后可解除该存储缺口和关闭约束。缓存满、关联过期、无法关联与 Host 再崩溃的损失不伪装成零丢失。Host 的内存缓存不跨重启恢复，不重发 prompt。
- schema 6 在已有 submission 收据 JSON 内保存有限观察，不建立 Run/Attempt/原生事件表。恢复保持 v3 + WAL → execution recovery → v4/v5/v6 → publish，发布 6 前保存 before-v6 备份。ACK 无终态重启后保留 acknowledgedAt、消费标记、冻结原文，outcome unknown；durable terminal 保留，旧 unobserved 不猜成功。迁移/备份失败保留原库与草稿，旧 App 拒绝 schema 6。
- Renderer 区分完成、中止、失败和未知；error 优先合并，不被旧快照覆盖。有限证据缺口可见。原生 get_state.queuedMessages/queue_update 是真实队列投影源；完整队列管理仍归后续 M2。

## 真实目标 SDK 样本

| 样本 | 来源与已验证行为 | 证据 |
| --- | --- | --- |
| RPC/full 执行与队列 | 官方 SDK，隔离 HOME/config/project，localhost SSE 共 10 次调用；扩展本地完成、内置 /jobs 的 local response、两次 steer + 两次 follow-up 的真实队列消费、abort、真实 compact 与压缩期间新输入；每个相关 prompt result 仅一次 | [frames](sdk-outcomes-18.4.6.frames.jsonl)、[metadata](sdk-outcomes-18.4.6.frames.jsonl.metadata.json)、[脚本](../../../validation/s3/sdk-outcomes.mjs) |
| 调用与失败分离 | 官方 SDK 无凭据隔离 fixture，provider 调用 0；仍观察到同 ID `response true → response false → prompt_result error`，两类证据分别断言 | [frames](sdk-failure-18.4.6.frames.jsonl)、[metadata](sdk-failure-18.4.6.frames.jsonl.metadata.json)、[脚本](../../../validation/s3/sdk-failure.mjs) |
| 原生精确关联/后台 settled | 导入目标 SDK 的真实 RpcPromptResults/RpcSessionSettleWatcher 类，受控 AgentSession 事件：旧 run yield 不结算新 prompt；两个尚在队列的输入不提前完成；completed 保持 sessionSettled=false，后台排空后才发布 session_settled。此项是原生类受控样本，不冒称完整真实工具 RPC 运行 | [frames](sdk-correlation-18.4.6.frames.jsonl)、[metadata](sdk-correlation-18.4.6.frames.jsonl.metadata.json)、[脚本](../../../validation/s3/sdk-prompt-correlation.mjs) |

录制指令：使用仓库资源 `resources/sdk`，执行上述 Node 脚本；`D_PI_NATIVE_EVIDENCE` 指向相应 frames 文件。资源来源、唯一补丁和 SDK hash 由 [01](../issues/01-upgrade-resources.md) 维护。隔离 fixture 的绝对临时根替换为 `/isolated-native`，不修改事件顺序、类型和结果字段。

## App 集成与红绿

真实 `FrameDecoder → NativeSession → SessionHost → RuntimeService → SQLite` 调度保留；仅替换进程创建/系统身份和隔离 native transport，在相同 decoder 中重放实际 SDK ACK、late error、terminal。录制 requestId 只绑定到本次 App 冻结身份，不人为生成结果或调换帧顺序。

- 新缺口先红：原生结果未持久化、终态先 ACK 被拒绝覆盖、300 个重复 ACK 挤满缓存、已确认终态重复误报 gap。最后一项的可检查红绿日志为 [red](native-outcomes-duplicate-red.txt) / [green](native-outcomes-duplicate-green.txt)，红灯明确收到 gap；修复后覆盖正确且更晚的 error 保持 failed。
- SQLite 真正写锁使 ACK 与 terminal 保存失败，草稿保持；解除写锁，同活 Host 重送证据后 ACK/终态保存，草稿仅消费一次，原生 prompt 写入次数始终 1。另一用例让 Host 在写失败后消失，再真正关闭/重开 AppStorage，未知状态与草稿保留，仍无自动重发。
- ACK 已保存但 terminal 写失败时，idle 不能处置未确认事实；Main 跨层 [red](native-outcomes-persistence-idle-red.txt)/[green](native-outcomes-persistence-idle-green.txt) 与 Host 独立 [red](native-outcomes-host-evidence-idle-red.txt)/[green](native-outcomes-host-evidence-idle-green.txt) 分别证明关闭保护。Host owner isolation 既有回归保留，并补当下协议的 Main durable confirmation。
- completed+sessionSettled=false 用实际原生类录制帧，叠加 generic agent_end/空 control 后 closeIdle 仍拒绝；录制 session_settled 到达后才解除活动。同轮 agent_end→closeIdle、状态 refresh 尚未返回的短暂窗口也由 Host 的未 settled 标记保护，见 [red](native-outcomes-unsettled-idle-red.txt)/[green](native-outcomes-unsettled-idle-green.txt)。旧代次、未知 ID、late error、最终结果重启与 ACK 无结果真正重启均保留相应外部结果断言。
- schema 6 覆盖实际 v5→v6 备份和 reopening；before-v6 发布失败保留 schema 5 原库/草稿。已有旧迁移、ACK+revision 事务回滚与 prepared 恢复顺序回归保持。

最近范围验证：**29 files passed / 1 skipped；210 tests passed / 1 skipped**，完整输出 [native-outcomes-tests.txt](native-outcomes-tests.txt)。跳过的是 opt-in 固定 CLI smoke；本票已直接验证目标随包 SDK，上述跳过不计为真实 SDK 验证。命令通过仓库 `scripts/test.mjs vitest` 包装运行，范围为 execution、protocol、收据/存储/runtime、Renderer 收据与上述跨层集成。Main/Host/Renderer TypeScript 检查与具体改动 Biome 检查通过；全仓工程门禁和 build 由主 Agent 整合。

此证据证明当前工程范围；受控原生类样本、隔离 localhost SDK 与 App 持久链分别记录，不等同真实个人供应商/完整 GUI 用户认可。结果覆盖始终有限，Host 与 Main 同时丢失未确认内存事实时仍 unknown，不承诺原生 exactly-once 或副作用回滚。
