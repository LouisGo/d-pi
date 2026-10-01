# 身份、只读与原生证据设计

2026-10-01，用户已认可设计，尚未实施。范围、授权与状态单源为 [spec](spec.md)。下述 DTO 是待实现契约，不代表代码已有这些字段。沿用 [模块机器清单](../../architecture/modules.json)、[交接合同](../../docs/architecture/modules/flows.md)和 [D-24](../../docs/decisions.md#d-24-提交与恢复的现行修订)。

## 1. 事实与资源拥有者

| 对象 | 唯一拥有者 | 本次变化 |
| --- | --- | --- |
| Thread、目录关联、执行信任 | threads / Main | 用稳定目标解析配置，不读异步结束时的活动 Thread |
| 原生配置、认证、模型和能力 | OMP | configuration 薄适配只读摘要或执行明确命令；不复制凭据和合并规则 |
| 冻结提交和调用收据 | execution / Main、SQLite | 增加有原生身份的结果观察，ACK 与结果分别保存 |
| 原生连接、请求映射、镜像 | execution/conversation / Host | 消费 prompt_result、session_settled 和队列信息；保留边界预算 |
| OMP 执行、工具、队列、历史 | OMP | 不迁入 Main 或重新实现 |
| 受管进程监督 | Main 最终责任，Host 管原生连接和正常关闭 | 先验证崩溃路径；必要时补注册和失联清理，职责分配不产生两个竞争控制者 |
| 草稿正文 | DraftController 与 Main 持久化 | 不改变版本化草稿 DTO |
| 窗口内选区/撤销 | 输入编辑适配 / Renderer | 05 按 Thread 保留有界编辑状态；不入 SQLite、OMP 或 Query |

流式正文继续 Host→Renderer。有限执行证据走 Host→Main→SQLite。Main commit 成功只证明该证据持久保存；不证明所有原生副作用已保存，也不证明最终正文已到 Renderer。

## 2. 配置请求的完整身份

建议使用可序列化判别联合：

```ts
type ConfigurationScope =
  | { kind: "application" }
  | { kind: "thread"; threadId: string; workingDirectoryId: string };
```

所有新启动的 snapshot/login/save-key 命令都携带 scope 与 traceId。Main 从可信 Thread 仓储解析实际目录，校验工作目录 ID；Renderer 不提供可执行的任意 cwd 或凭据路径。配置 profile/agentDir 来自 Main 的已选原生上下文，而非 UI 临时选择。

- Main 在资源等待前解析并捕获 scope；等待后校验仍指向同一真实目录/来源。Thread 切换不取消或改写 A 的读取，A 被删除/重关联则返回 typed stale-target，不改用 B。
- `application` 是无选中 Thread 时的应用配置入口，其 Main 拥有的探测目录必须固定、隔离且不含用户项目；用它读取全局/profile 层不表示 App 数据目录是用户项目。检验原生 Settings 的上溯发现，不能把进程 cwd 默认成仓库目录。
- 成功和失败响应携带该次 scope、traceId 及实际配置来源摘要。Query key 与请求 scope 相同；queryFn 再校验回包身份，拒绝错位结果进入成功缓存。
- 当前无 GUI 来源切换，不编造 configGeneration。未来来源选择由已有 M2 配置票实现时，用真实 source ID 加入 key 并使旧来源失效。
- login 的 job 在 Main 创建时固定 scope/source，answer/cancel/open-login 只按 jobId 找原 job；切换 Thread 后不把认证续步转给新来源。清理始终能按旧 job 取消，不因当前 Thread 已变而失去出口。
- 保存认证成功后失效受影响的 configuration 查询；可保守失效所有配置摘要。失效只触发真正只读采样，不重试登录、save-key 或任何执行命令。
- queryOptions 继续 `networkMode: "always"`、`retry: 0`；展示当前采样、旧摘要与失败，保留有身份的错误/trace，不用字符串把所有原因混为缺配置。

落点：configuration/contracts、renderer/queries、main/native-configuration、App Main 装配/preload、Settings/ModelControls。新增 threads 依赖只经对应 public.ts，同时更新机器清单和生成依赖；生产者和全部消费者一次切换，拒绝旧无身份执行请求，不维持新旧两条协议。

## 3. 查询的只读边界

`Settings.loadReadOnly` 仅证明该 Settings 路径。v18.4.5 的 `ConfigFile` 仍会在读取 yml 路径时迁移同名 JSON；与 18.3.0 的该源码相同。普通 AuthStorage/credential store 会初始化 schema，模型缓存读取也有数据库打开路径。不能凭函数名称推断整个 snapshot 无写。

02 的实现顺序：

1. 将 snapshot 与 login/save-key 的启动初始化分开。读取不得预先构造可写 discoverAuthStorage，也不得解析会执行 `!command` 的凭据、刷新 token、联网发现或加载项目扩展。
2. 原生 Settings 继续无写读。模型文件按原生 yml→yaml→legacy JSON 优先级选择**已经存在**的实际路径；明确传 JSON 路径时官方 ConfigFile 支持解析且不走 JSON→YAML 迁移。缺文件不创建；无效文件有来源错误，不静默忽略自定义模型。
3. 模型/认证/cache 原生数据只在这个适配入口读取。优先复用已验证无写的官方接口；需直接读原生数据库时只开已存在的文件、readonly 连接、有限 SELECT 和 schema/version 检查。不能实例化会建表/恢复损坏的默认 store，不能将凭据复制到 App 数据或临时磁盘文件。
4. 输出仅含认证配置状态和模型摘要，秘密不进 DTO/日志。已有原生合并/模型 metadata 继续复用官方 parser/helper；不可重写 OAuth、账户路由或品牌规则。原生格式读取留在 configuration 的 Bun 薄适配，与 SDK 版本化 fixtures 一起维护。
5. 若旧 schema、远程 broker 或命令式凭据无法用已验证无副作用的路径解释，返回带来源原因的 partial/unavailable；unknown 不能显示为未认证，不能伪造完整 catalog/ready。显式登录/配置写入仍由原生命令处理。这个保守失败分支可直接实现；需要 Runtime fork 或复制整个 store 才能读时停止该替代方案，记录限制，不扩大项目。

只读验收比较隔离原生根/项目根的文件集合、内容哈希、权限及关键 DB schema；不以 atime 变化定罪。测试包括 legacy JSON、缺 agent.db/models.db、旧 schema、损坏尾部/配置、symlink、项目覆盖及无执行信任。必须观察没有新文件、DDL、chmod、联网或 shell helper；显式 save-key/login 的写入在独立测试中允许，失败仍保留旧凭据。

配置摘要不会承诺“账户一定可计费使用”。credential-scoped catalog 与执行侧差异先用隔离缓存验证，必要时调用真正无写的原生 hydration 或返回覆盖缺口；不得为了看似完整触发凭据 minting/目录刷新。

## 4. 推理能力与选择语义

能力摘要根据原生 Model metadata 派生：支持 effort 列表（包含 minimal）、是否可调、是否要求 effort、原生默认信息。`reasoning: true` 且无可调档必须能表达，不能等于可任选六档。

选择合同建议：

```ts
type ThinkingSelection =
  | { kind: "default" }
  | { kind: "off" }
  | { kind: "effort"; effort: "minimal" | "low" | "medium" | "high" | "xhigh" | "max" };
```

默认沿用原生有效设置，off 是明确请求关闭，指定 effort 仅接受支持档。Bun 薄宿主使用官方 helper/setModelTemporary 映射；18.4.6 已由官方原生 setter/Host 回读证实 `ThinkingLevel.Off` 明确关闭，undefined/`ThinkingLevel.Inherit` 表示未指定；此版本证据取代设计时对 undefined 的假设，不能把 default 和 off 合并。应用前核对当前 Thread/实例和新鲜能力，失效选项明确拒绝/刷新；完成后显示 Host 回传的实际模型/档位，未知结果不显示成功。

四类必验：DeepSeek `low/high/max`、含 minimal 的模型、reasoning 但无可调档、requiresEffort 不允许 off；再验非推理模型与切换后的实际回读。原生可能归一化的结果如实显示，不维护第二张供应商品牌表。

## 5. 提交与原生结果

保留 FrozenSubmission、持久 requestId 和 SubmissionTarget。v18.4.5 的 prompt_result 关联该命令 id；其中 status 是 completed/aborted/error，agentInvoked 与 sessionSettled 独立。它不是每条消息 ID、一个独立产品 Run 或原生 exactly-once 承诺。队列中的多个输入可以加入同一原生工作阶段。

| 证据 | 可以得出的事实 | 不能得出的事实 |
| --- | --- | --- |
| prepared/dispatching 事务 | App 冻结/许可写原生命令 | OMP 已接受或执行 |
| 精确 response success | 调用 ACK；提交事务后可消费对应草稿 revision | prompt 已完成、历史已持久 |
| prompt_result(id) | 该命令的原生工作结果已观测；agentInvoked=false 可区分未到 Agent 的路径 | 整个 session/后台已停止、文件回滚、冷启动能重新读到该帧 |
| session_settled 与新鲜 control | 对该实例当时的队列/后台活动有停止或闲置证据 | 其它 Thread、外部 CLI 或逃逸进程均无活动 |
| pipe/port/Host 退出 | 连接/宿主中断 | Bun/工具子进程全部退出、任务成功 |
| 已核实本次受管进程终止 | 本次进程不会继续执行 | 结果成功、所有文件修改撤回 |

执行 DTO 新增有限 typed prompt-result observation，包含 submissionId/requestId/完整 target、status、agentInvoked、sessionSettled 和必要的类型化错误。Main 按完整身份和合法状态保存；数据库只存恢复 UI 必需证据，不存整条事件流或原生历史。

收据 `state` 继续描述调用交接；`outcome` 增加有证据的 completed/aborted 等结果及来源，不把 acknowledged 倒改成未发送。重启时有 durable terminal 的结果保留；已派发但尚无 terminal 的观察保守解释为 unknown，ACK 时间和已消费 revision 保留。新 SDK 前的 unobserved 行迁移为“未观测”，不能批量猜成成功或永久运行中。

正交规则：

- generic idle/agent_end 不结算不明请求；仅做 session 展示。旧代次或未知 id 的结果不会更新当前提交，保留关联缺口。
- agentInvoked=false 的本地命令仍可能有配置/文件副作用，不能据此把已确认调用倒写为“从未派发”或授权自动重发。
- 结果可早于 Main 的 ACK 事务交错到达，按 request/target 暂存或事务合并；不能因此绕过 ACK 消费条件。重复/迟到结果幂等；error 不能被迟到 success 覆盖。
- Main 提交失败不报告持久成功。Host 有界保留尚未确认的必要 evidence 并允许同活实例重送**证据**，不重送 prompt；缓存满/Host 再崩溃保留 unknown/覆盖缺口，不能承诺零丢失。
- 扩充结果持久化若需要 App schema migration，使用现有版本/备份规则，失败不删库。错误消息遵守诊断脱敏，不把 provider dump 路径或正文复制进日志。
- 原生 `retryable: true` 不是 App 自动重发许可。OMP 原生同一任务内部的恢复/重试仍由 OMP 控制；App 不重建它，也不因升级而改用户原生 retry 设置。

原生 get_state/queue_update 是队列投影来源；App 不建可独立消费的队列账本。逐项 remove_queued_message 与队列编辑/重排 GUI 留在已有 M2 05，身份/取消竞争采用新原生接口验证，不依文本或数组位置猜命令归属。

## 6. 进程故障与监督

04 先固定真实 Main→utility Host→Bun OMP 调度，验证正常关闭、Native crash、Host SIGKILL、Main SIGKILL、忙/待答/后台活动和 SQLite 写失败。故障只针对隔离测试创建并登记的进程，不操作用户运行的 OMP。

若实测已满足契约，补证据即可；若出现残留，推荐在现有三层内加固：

1. Main 创建非秘密 processInstanceId/监督 token 与启动记录；Host spawn 后在允许加载项目 SDK/扩展、消费输入之前向 Main 注册真实 PID、出生身份、资源身份和所属 scope。
2. 薄 bootstrap 在确认注册/许可前不加载项目可执行代码。Host/Main 在该窗口消失时，未获许可的进程自清理；不能把 ready 通知丢失当成“从未有副作用”。
3. Host 正常拥有 native spawn/close；Main 仅在 Host 不可用后承担登记实例的最终清理。握手与正常关闭的超时是操作专用，不能用“很久没 token”杀正常任务。
4. 首轮选 terminate，先原生中断与 dispose，再有界强制终止，等待实际退出确认。stdio 重连/adopt 另评估。监督记录缺写或 cleanup 失败显示未确认；紧急停止仍可用，不等数据库恢复。
5. PID 加实例 token、出生时间/可执行资源等真实证据复核；PID 或 PID 文件本身不构成身份。需要 POSIX 进程组时只覆盖本次受管组，验证实际子进程和脱离组的限制；不声称工具沙箱或可杀死任意外部程序。

上面是有证据缺口时的推荐修复边界，不是已经完成的 supervisor。若可靠清理需要新增平台独占能力、改 OMP 内部或开放外部 CLI 锁，则记录所需决定，只暂停依赖部分。目录全局 lease 不能替代这些证明。

## 7. 故障与恢复验收表

| 故障 | 持久拥有者/运行拥有者 | 结果与处理 | 自动重发 |
| --- | --- | --- | --- |
| Renderer reload / MessagePort reset | Main 收据；Host/Bun 原实例 | 重建同 scope snapshot + 连续增量，清理旧订阅；执行继续 | 否 |
| Main 事务失败 | Main/SQLite；Host/Bun 不因此宣告成功 | 派发前失败不发；ACK/terminal 保存失败保留原文/覆盖缺口 | 否 |
| 单个 Bun crash | Main 保留该 Thread；Host 其余 scope | 该实例中断，已观测终态保留，其它未决 unknown | 否 |
| Host crash | Main；Bun 存活须实测 | 所管连接中断，登记实例逐一确认/清理，不能仅换 Host 宣告恢复 | 否 |
| Main crash | SQLite 启动恢复；Host/Bun 须实测 | 保留 ACK/原文，核实受管残留；旧记录只读，不自动恢复执行 | 否 |
| 待答时断链 | 原生请求生命周期；Main 保存提交 | UI 不重放旧 Allow/回答，旧代次不可答；明确过期/未知 | 否 |
| prompt_result completed，sessionSettled=false | Main 保存该结果；OMP 仍管后台 | 该输入已有结果，session 仍有工作，不回收/退出 | 否 |
| 原生文件缺失 | Main Thread/草稿/收据；OMP 历史缺口 | 内容可读性与执行可用性分开；不推断未执行或原进程死亡 | 否 |
| 外部修改目录 | 文件系统/Git | 保留已有版本检查，相关操作重查来源，不冒称目录锁 | 否 |

不存在目录 lease 时此表不虚构 FREE/QUARANTINED；对本次实例无法确认停止就显示 unknown 并禁止冒充该实例 ready。冷恢复单写验证未完成时不追加旧原生会话。数据可读不等于执行可用。

## 8. 投影、编辑与文档同步

不启用 v18.4.5 delta-only 模式。保持原生 full 消息形态，message_end 最终文本可能经过原生 finalized hook 改写，投影以最终原生内容更新；新增/未知事件保持开放 envelope，只有 App 消费的 payload 被认证为 typed 数据。seq 在合帧/过滤后生成，同订阅范围的快照水位一致，后台持续消费输出。

05 推荐每窗口按 Thread 保存 EditorState 与 selection，切换释放 view/DOM；DraftController 仍是正文保存协调者。默认最多 8 个 Thread、估算序列化文档总量 4 MiB、每 Thread 配置 50 个 history event 深度，按 LRU 释放历史；这是可调整工程初值，正文估算不等于 EditorState/undo 的实际 RSS 上限，超大编辑或缓存压力时允许清历史并保留正文。恢复前匹配当前草稿版本/正文；发送消费、外部更新或版本不符时清旧 undo，避免撤销复活已提交内容。窗口 reload/退出只恢复业务草稿，IME 组合期间切换仍按现有迟到绑定规则处理。

实施时同步基础契约、受影响模块页/flows、OMP 维护、机器公开面/依赖及现行 SDK 验证入口。历史 v18.3.0 快照/录制仍标原版本，不全文替换；本设计不提前改写尚未实现的现行合同。当前模块 README 对 configuration 的旧描述与 SDK manifest 文件数已在准备阶段校正，06 随实际实现继续同步。
