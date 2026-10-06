# App 存储与内容

日期：2026-09-27。深度：M1 核心设计，驱动/事务与迁移待验证。依据 D-24/D-34；[基础契约 §1](../foundation-contracts.md#1-身份持久化与生命周期b1)、[内容合同 §4](../foundation-contracts.md#4-内容包与附件b4)。返回[模块地图](README.md)。

## 当前工程落点（领域目录治理，2026-09-29）

- `src/platform/main/storage/database.ts` 只负责连接、PRAGMA、schema/备份迁移和事务原语；业务仓储分别位于 threads/input/preferences/execution 模块。
- `src/app/main/wiring/app-storage.ts` 以一个 `AppDatabase` 组装仓储，并显式执行 `至少 v3 + WAL → submission recovery → 后续迁移至 v9 → queue change recovery → publish`；数据库构造不隐式修改业务收据。当前已为 v9 时不重复迁移或生成升级备份。
- `src/platform/main/diagnostics/` 是轻量有界诊断设施；它不决定业务恢复，也不记录秘密、路径或正文作为诊断内容。


## 范围与拥有者

Main 集中拥有 SQLite 入口与写入调度；必要时把 I/O 交给 worker，仍不开放多方直接写入。附件原件和派生内容在 App 私有文件存储。数据库负责结构化记录，原生历史、配置和凭据继续归 OMP。

存储模块保证写入、版本检查和引用一致性，不决定“可以发送”“已接受”或“已完成”。[Thread](threads.md)、[输入](input-context.md)、[执行](execution.md)分别定义自己的业务更新；跨记录同时生效的操作由一个明确事务完成。

## 数据与交接

| 数据集合（不是预定 SQL 表） | 业务提供方 | 写入与读取规则 |
| --- | --- | --- |
| Thread / 目录关系、信任与读取授权 | Thread | 保持稳定 ID；按操作更新，不能用过时整份快照覆盖 |
| 草稿 revision、附件来源与引用 | 输入 | 保存时比较预期 revision；冲突返回当前版本，不盲覆盖 |
| 冻结内容包和提交收据 | 输入、执行 | prepared / dispatching 必须确认持久化后才继续派发；调用 ACK 与对应草稿消费标记原子保存；schema 6 在 receipt JSON 保存有限 typed 原生结果，保留冻结原文 |
| 待处理队列的持久变更收据 | 执行 | schema 7 的 queue_change 独立保存完整身份、命令及原文；派发前持久化，不覆写 submission；begin/update/cancel 瞬时编辑控制不创建该收据 |
| 无原生重读保证的必要展示补充 | 阅读 | 有原生关联、缺口和配额；不能变成第二份权威会话历史 |
| 桌面偏好、面板/阅读位置 | 对应 UI 功能 | 容许已定义的偏好默认值，不用默认值修复损坏的业务记录 |

对外只提供当前功能需要的读取、条件更新、事务和内容引用操作。消费者收到持久化成功、版本冲突或明确存储失败；Host/Renderer 不接收 SQL 执行口或数据库驱动对象。

## 文件、事务与崩溃顺序

1. 导入内容先写临时文件并完成校验，再发布为私有内容文件；发布完成前不标 ready。
2. 数据库事务登记内容引用及业务记录。文件成功、事务失败会留下无人引用内容，交由有界一致性检查及延迟回收处理，不伪造业务成功。
3. prepared 事务确认引用可用；dispatching 事务提交后，执行模块才通知 Host 派发。文件、SQLite 与 OMP 不组成一个事务。
4. 调用 ACK 与消费标记落盘后才确认 acknowledged 和清对应稿；业务接受须有独立证据。若业务已可能到达 OMP、回执写入失败，保留或在重启后恢复为 unknown，不因存储重试再次派发。
5. S2 冻结原文的唯一可靠副本不回收。其他内容删除最后引用后按既有延迟规则回收；活跃草稿、准备提交、unknown，以及原生历史仍依赖的内容保留。回收不推断 accepted 意味着附件已由 OMP 自持久化。

当前 schema 7 的 before-v7 备份保留完整 schema 6 数据，历史 before-v6 仍为 schema 5；更高版本保护防止旧 App 默默丢新结果。启动恢复由 execution 显式拥有：submission 的 dispatching 转调用 unknown；ACK 后未观测结果转 outcome unknown 并保留 acknowledgedAt/消费标记；已保存的 completed/aborted/error 观察保留。此恢复先于后续迁移备份，所以 6→7 的 before-v7 已包含恢复后的 submission 与草稿消费标记，但尚无 queue_change 表。

迁移完成后才构造 QueueChangeRepository，并在发布 AppStorage 前恢复 queue_change：仅 dispatching 转 unknown，已确认 acknowledged/failed 和原文保持。相同 trace 仅允许相同 Thread、target、命令与内容，不能混淆实例身份；ACK 保存失败不伪造确认，恢复绝不调用 OMP。原 submission 不由队列仓储修改。未确认的 Host 内存缓存不属于数据库持久承诺。对应回归见 `src/app/main/wiring/queue-storage.test.ts` 和 `tests/integration/queue-change-recovery.integration.test.ts`。

启动按 schema 版本和必要引用检查恢复；缺失内容显式标出。迁移前可恢复备份，迁移失败不删库；未知更高版本只在确认兼容时只读，否则停止不兼容功能。不能靠全盘无限扫描恢复正常交互。

## 第一批交付与验证

仅围绕 Thread → 草稿 → 提交收据建立首批迁移及查询，附件先覆盖选区文本，M2 再扩全部内容形式。SQLite 已定；驱动、Drizzle 是否需要、journal/同步参数由实际 Electron ABI、打包和事务样本决定，不因已定 SQLite 连带安装其他候选。

用临时库验证：事务中断没有半份收据、版本冲突不覆盖新草稿、dispatching 后重启不重发、回执保存失败保留内容、文件与引用不一致有可解释结果、迁移失败可恢复。按实际驱动验证外键与事务持久性；慢写不冻结界面。

预算、保留时间及日志分离沿用基础契约，不在本页另设数值。验证日志必须区分“事务返回成功”和“所选持久化配置经过崩溃恢复验证”。

2026-10-02：schema 8 新增 input_attachment manifest；before-v8 保留已完成旧 submission 恢复的 schema 7，并保持 queue_change 原收据恢复顺序。私有内容原件不由迁移移动或删除。冻结提交 JSON可持久化完整代表文字、图片和来源；预算在派发前按真实编码检查。此阶段仍保守保留；后续生命周期实现见下方2026-10-06说明。


2026-10-06：schema 9 新增 input_content_object（摘要、字节数、引用投影、最后释放时间、校验问题与 available/deleting/deleted 状态）及 input_content_epoch。before-v9 在 submission 恢复后保留 schema 8，随后执行原 queue_change 恢复；不改变执行收据语义。thread、消费标记、submission、queue_change、input_attachment 变更只递增失效 epoch，manifest 独立 epoch 支持可续扫发现。摘要表达式索引以 json_valid 保护损坏 manifest。

App 的 attachment-service-references 装配跨仓储权威投影：分批读取持久草稿（排除已消费版本）、全部状态冻结 submission、queue_change 前后原文与来源，单批最多128个 owner/4MiB JSON，单 owner 最多2MiB；仅累计当前最多32个候选摘要及有限来源。引用投影是可修复缓存，删除前仍核对权威 epoch；owner 未扫完、epoch 变化或损坏数据时不删除。终态收据依赖无自持久证明，不自动释放。manifest 按 rowid 每批32条发现，当前候选来源按摘要索引查询，来源报告截断不会作为删除依据。

内容删除先持久化 deleting，再在 BEGIN IMMEDIATE 内复核 epoch、删除规范摘要路径、同步目录并提交 deleted；复核到文件删除之间无异步等待。进程中断留下 deleting 时，下次批次复核全部引用后处理尚存/已丢失文件；SQLite 与文件系统不冒称跨介质原子事务。数据库不可用、引用不完整、文件失败均保守拒删或留下可恢复状态。对象/目录扫描、哈希读取均有界；未知名称与未发布临时文件不在此次自动清理范围。
