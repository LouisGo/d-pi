# 集成终端契约

日期：2026-10-07。D-40 已确认 **B：专用 TerminalHost utility process + 主页面 Renderer 中的 xterm.js**；用户同时允许后续按需直接引入 xterm.js。本次交付设计与文档，未实现终端、未引入终端依赖、未做性能实测。授权、产品待决与开发切片见[所属规格](../../.scratch/integrated-terminal/spec.md)，领域入口见[终端模块](modules/terminal.md)，依据见[固定源码核实](terminal-references.md)，验收单源见[终端验证设计](../validation/terminal.md)。

## 1. 范围与所有权

用户终端允许直接运行当前 OS 用户权限下的任意 shell 命令，独立于 OMP shell 工具。终端输出不是 OMP 原生历史，不创建 SubmissionReceipt，不从终端日志推断 Agent 改动或命令成功。共享工作目录意味着共享文件，没有工具沙箱或跨程序互斥承诺。沿用 D-13 的底部面板及 Command + `，不引入自由分屏。

| 事实 / 资源 | 唯一拥有者 | 消费方式 |
| --- | --- | --- |
| 工作目录身份、项目执行信任 | threads / Main | terminal 的 Main 协调通过公开面查询并在启动前复核 |
| 终端 ID、目录关联、准入、宿主监督、退出协调 | terminal / Main | preload 只暴露受限意图；Main 维护本次 App 生命周期的目录与实例登记 |
| PTY、shell、受管进程组、输入顺序、实际尺寸、输出序号 | terminal / TerminalHost | Main 的许可命令；经 Main 授权的视图端口输入/resize；Host 提供真实状态 |
| 有界恢复屏幕、输出处理水位 | terminal / TerminalHost | headless xterm 投影，只表示已消费 PTY 内容；不解释 shell 业务结果 |
| xterm DOM、选择/滚动、IME、绘制、布局与订阅 | terminal / Renderer | 对目标会话发意图，按实体订阅状态；组件不拥有 shell 生命周期 |
| OMP 连接、执行、工具与原生历史 | SessionHost / OMP 既有边界 | 终端不导入 OMP adapter、不共用 SessionHost scope 或端口 |

Main 不解析高频 ANSI 或逐块中转输出。TerminalHost 不读取 App SQLite、不自行授予信任、不承载 OMP。Main 与 Host 的资源登记只保存身份和操作状态，不复制终端屏幕；Renderer store 只保存轻量展示元数据，输出不逐块经过 React/Zustand/Query。

初期一个 TerminalHost 管全 App 最多 4 个存活终端，一个前台显示订阅；最后一个存活会话清理确认后不再保有PTY；只读终态屏幕仍保留时Host维护有限缓存，最后一项移除后或App真正退出时回收Host。单 shell 故障只影响该终端，Host 故障影响所管所有终端。OMP 不在该故障域；共享 OS CPU/RSS 和主页面 Renderer 仍可能受影响，须通过验收，不承诺完全隔离卡顿。

## 2. 目录、信任与 shell 环境

创建请求携带 `threadId + workingDirectoryId`，不接受 Renderer 提供任意 cwd、shell 字符串、环境对象、启动命令或 executable。Main 从 threads 的真实上下文固定目录，解析 realpath/device/inode 与执行信任；等待 Host/资源后重读，身份或关联变化返回 `stale-target`，目录不可访问返回明确失败，不回退 HOME/同名目录。

Main 发一次性 launch permit，绑定终端 ID、目录身份、许可代次和 Host 实例。Host 在 spawn 临界点复核实际目录身份及许可有效性；许可撤销/过期不可启动。shell 真正启动后才能报告 `running`，utility 的 `spawn`/握手不证明 shell 已 ready。原生分配部分成功时必须清理已分配资源后报告失败。

撤销信任先禁止新 create/attach/write，Main 向 Host 发有序撤销 fence，Host 撤销目标目录端口写权并结束受影响 shell，再与既有 OMP 停止结果合并。只在清理确认后显示已降级；fence 前已交给 PTY 的输入不能撤回。失败保持 `revoking/cleanup-pending`，不凭删除授权记录宣称任务已停止。正常终端只执行用户输入，不随 OMP ready 自动创建。

初期推荐按 `workingDirectoryId` 组织会话，记录创建来源 `originThreadId` 仅用于追溯。切换同目录 Thread 看同一终端列表，切换其他目录不改变旧 shell cwd；关联变化不会迁移 shell。该产品粒度及退出交互的待确认状态集中在 spec。shell 自行 `cd` 后，初始目录标签不冒称当前 cwd；OSC title/cwd 是不可信展示提示，不能更新目录身份/信任。删除/迁移目录前应报告活动终端引用，不能偷偷结束它们或跟随新的路径。

Main 选择可信绝对 shell 路径：OS 用户登录 shell 可用则采用，不可用时明确提示并允许选择受限 shell profile；初期不提供项目自定义 executable/启动任务。交互 shell 使用其正常初始化方式，macOS 默认登录交互 shell 的参数由适配定义（例如 zsh `-l`），不用拼接 `shell -c` 用户命令。用户明确启动终端后可以执行 shell startup 文件；禁止为了读取配置、列出终端或“修复 Finder 环境”隐式运行 startup 文件。此区别不改变[基础契约 §3](foundation-contracts.md#3-配置与首版认证b3)。

以 Main 的真实启动环境为基础，过滤 Electron/Node 注入与 App 内部控制变量（包括 `ELECTRON_RUN_AS_NODE`、`NODE_OPTIONS`、内部许可/诊断 token），保留用户正常 PATH/HOME/locale；Host 与 shell 的环境分别构造。`TERM=xterm-256color` 与 locale 依据实际 shell 设置，缺 UTF-8 locale 有明确诊断；不伪造不存在的 locale，不把 OMP API key/账户凭据复制进去。用户原有环境可能含秘密，环境值与 argv 不进入日志或 Renderer。Finder、终端启动 App 两条路径都验收，不用无限等待 shell 初始化模拟 ready。

## 3. 公开面与受限协议

以下是拟实现的职责面，尚无源码登记。实现按机器清单支持的 `contracts/core/main/host/renderer` 环境落在 `src/modules/terminal/`，跨模块经对应 `public.ts`。应用级 Host 入口拟为 `src/app/host/terminal/index.ts`，Main/preload/workbench 只组合；通用进程身份/清理能力按实际兼容性复用 `platform/node/processes`，不把 OMP 特定监督整体复制成终端服务。

| 公开面 | 操作 | 边界 |
| --- | --- | --- |
| contracts | scope、身份、状态、命令/事件 DTO 与 schema | 不泄露 node-pty/xterm/Electron 类型；边界用 Zod v4、内部分支按 D-35 |
| main | `create`、`list`、`attach`、`end`、`resources`、`shutdown` | Promise/DTO；从可信 Thread 取得目录；attach 只给当前 app mainFrame 的目标会话端口 |
| host | `launch`、`registerView`、`revoke`、`inspect`、`end`、`shutdown` | 仅 Main 控制端口能 launch/end；可信监督命令与 Renderer 数据端口分离 |
| renderer | 会话元数据订阅、attach/detach、write、resize、xterm 适配 | 无 Node/Electron；原始输出走适配，React 只消费状态与操作结果 |

Main 验证 IPC sender/webContents/mainFrame 和应用内 URL；preload 不暴露通用 invoke、spawn、kill、文件读取或环境查询。Main 创建 MessageChannelMain，分别转移给 Host 与受控页面；Host 先登记对应会话/视图权限才接受端口消息。端口引用本身不替代权限校验。每会话最多一个可写显示 attachment；新 attachment 生效时关闭旧端口/写权，旧窗口不能抢回。

所有信封有 `protocolVersion=1`、稳定 `terminalId`、`hostInstanceId`；请求有 `requestId/traceId`，视图消息另有 `attachmentId/connectionGeneration`。字段缺失、版本不支持、旧实例/代次、越权 terminal、超大帧或速率超限明确拒绝并限流关闭违规端口。主/Host 控制连接变化同样更新代次。错误沿用诊断合同的观察层、报告源、处理拥有者与 unknown 归因。

| 消息 | 必要语义 |
| --- | --- |
| create/launch → result | Main 分配新 `terminalId`；同 requestId 在同活 Main 返回已有分配状态，不重复 spawn；跨 Main 结果未知时不自动重建 |
| input → input-result | attachment 内单调 `inputSeq`、明确 `utf8/binary` 编码与受限字节；Host 保序写一次，重复序号返回本代次有界结果；ACK 只证明 PTY write 已返回，不能证明命令执行或成功。xterm onBinary 的原始控制字节不得再次UTF-8编码 |
| resize → resize-result / resized event | `resizeSeq` 与 cols/rows；只合并未派发的最新尺寸，Host 在输出处理序列中同步 PTY/headless；已应用尺寸由事件确认 |
| attach → snapshot → delta/state | 先登记新的 attachment，串行生成屏幕及同一水位，随后只发大于水位的有序事件；尚未 snapshot-applied 不开放输入 |
| output-applied | 累积 `appliedSeq` 与 attachment/snapshot 身份；按 Host 记录的帧长度释放信用，不信任 Renderer 声称的任意字节数 |
| snapshot-begin / chunk / end / chunk-applied / snapshot-applied | begin带snapshotId/watermark/尺寸/总字节/分片数；chunk带连续chunkIndex与同snapshotId，按write callback累积确认chunkIndex释放快照信用，end完整校验后才确认snapshot-applied水位；分片ACK不能冒充全部快照已应用 |
| detach | 取消订阅/写权并释放该视图积压；不结束终端，不保留离线增量队列 |
| end → ending → ended/cleanup-pending | 禁止新输入，执行清理；重复 end 幂等，共享同一关闭结果；失败可由用户再次要求核查清理 |
| exited/fault | 保留真实 exitCode/signal（不可取得则 null）、输出最终水位、清理状态；exit 不是命令成功，port close 不是进程退出 |

input ACK 丢失或 Host 崩溃时结果为 `unknown`，不重放键入/粘贴，不自动补发 Ctrl-C。粘贴分块在有效ACK/信用后才继续发，未确认或断连即停止后续发送，保留有界未发内容供用户处理；不能提前把1 MiB粘贴全部排到PTY/传输队列。只读inspect可重试；副作用不放进Query自动重试。输入编号/dedup表仅本代次有界保留（见预算），已处理水位以下但结果已回收的序号拒绝再次write并返回unknown，而非宣称exactly-once。

## 4. 身份、顺序与恢复屏幕

`terminalId` 在一个会话的生存期稳定，Renderer 重挂载不改变；`hostInstanceId` 每次 utility 启动新建，`attachmentId/connectionGeneration` 每次视图连接新建。初期不持久化终端记录，不恢复跨 App shell；App 重启后没有“运行中旧终端”。显式新建始终产生新 terminalId，不借用旧退出 ID。

Host 用单一处理序列给已解析 output、resize、state/exit 分配递增 `seq`。PTY 来字节不等于 headless 已处理，`processedSeq` 只有 headless write callback 后推进。snapshot 带 `snapshotId/watermark/cols/rows/state/coverage`，在该序列内捕获，使屏幕、尺寸、终态属于同一水位。退出前读到的尾部先处理，超时未读全则 `outputIncomplete=true`，不伪造完整尾部。

恢复采用固定兼容版本的 `@xterm/headless` 与 `@xterm/addon-serialize`，维护屏幕和有限 scrollback，不保留整个原始输出日志。Renderer reset/resize 后串行写 snapshot，再 ACK 水位和消费后续 delta。捕获snapshot同时登记该attachment的后续delta，传snapshot期间积压也占同一预算、必要时pause；不能在快照传完后才订阅而漏输出。分片使用独立chunkIndex信用，live seq仍停在watermark直到snapshot-applied；缺片/重复错片不推进水位。

snapshot 序列化须恢复所支持的 normal/alternate screen、cursor、颜色、模式及后续增量的解析一致性。序列化屏幕不默认包含parser的未完成UTF-8/ANSI状态：Host在headless之前使用有界流式framing，只提交完整码点和完整控制序列组合，跨块未完前缀暂存并计入原始输出预算（单控制序列硬16 KiB）；恢复快照取已处理的完整边界，前缀留给原消费链继续完成后再发布。framing只判边界/大小，不自建终端解释器；长OSC/DCS或坏序列超限报资源/协议失败，不静默截断后继续。不能从任意ANSI字节尾部拼出快照。若固定版本不能恢复某模式，明确覆盖不足并修复适配，不以乱码或重启shell掩盖。

缺号、snapshot 分片缺失、watermark 回退或实例不符停止当前增量，释放旧 attachment 后请求新 snapshot；普通重挂载只恢复现存 shell 的显示。状态终态同样可由 Main inspect/Host snapshot 获取，不能因显示端口超限丢掉退出事实。可见缺口说明有限 scrollback、回收/重同步和旧选择失效，不宣称完整命令历史；初期不自动保存用户输出到项目或 App 日志。

## 5. 输出确认、背压与预算

Host 负责 PTY → headless → attachment，Renderer 负责 attachment → browser xterm。发送 MessagePort 帧不释放信用；只有匹配 attachment 的 `xterm.write(data, callback)` callback 才能推进 output-applied。callback 表示解析/屏幕模型已处理，并不证明像素已经绘制，显示延迟另外测量。状态事件也通过适配的顺序屏障确认。

浏览器 xterm 收到输出后按帧合并写入，单批/单帧受预算限制，只允许一个未完成 write；不能把所有待写数据一次交给 xterm 内部队列或每块 setState。`requestAnimationFrame` 用于前台调度，不将后台被节流的 rAF 当成活性判断。隐藏、导航离开或窗口关闭应显式 detach 输出订阅，Host 继续更新 headless 屏幕；元数据走低频状态路径，无离线 follower backlog。

可见 attachment 达到信用高水位时暂停向它送新 delta，同时对该会话 PTY 调用 pause；降到低水位且 Host parser 也有容量才 resume。Host 原生回调/解码/headless 队列另有独立高低水位，不能只给 MessagePort 限额；pause 后仍可能有在途输出，必须预留硬上限余量。各队列先记账再入队，释放实际消费长度，错误/关闭路径同样释放；不丢任意 ANSI 字节继续假装屏幕一致。

慢视图 2 秒无有效 ACK 且有积压时，关闭该 attachment，记一次 `consumer-stalled` 并恢复 Host 独立消费。前台显示“显示已暂停，重新同步”，用户重连取得新 snapshot；不无限重连制造快照风暴。休眠/隐藏有单独原因，不因时间流逝断言 shell 崩溃。如果瓶颈在 Host parser，仍保持 PTY pause，不能为了 shell 看似活着取消内存上限；10 秒无处理进展进入 `output-stalled`，提供结束入口。超过硬预算或 parser 失败终止该会话，显示明确资源故障及输出缺口，其他终端/OMP 不一起重启。

暂停读取可最终使高输出程序阻塞在 PTY 写入，交互输入被送到 PTY 也未必及时得到 shell 响应；pause 不是冻结/停止 shell、不是 Ctrl-S/Ctrl-Q。初期使用 node-pty 显式 pause/resume，关闭它的输入 magic flow-control 解释，不注入控制字节。选择有界、保序和应用响应性，接受持续超负载时的生产阻塞；隐藏时通过 headless 消费尽量维持 shell 活性。无法同时承诺无限吞吐、无损全历史、永不阻塞 shell 与有限内存。

以下为初始工程预算，未实测。调整集中改此表并记录证据，不能由实现静默扩大。

| 资源 | 初始上限 / 水位 | 计量与超限行为 |
| --- | --- | --- |
| 存活终端 / 前台 output attachment | 全 App 4 / 1 | 新建超限明确拒绝；不隐式结束旧终端 |
| cols/rows | 2–240 / 1–100 | 整数且真实内容盒变化才 resize；极窄窗口可显示但不发送 0 尺寸 |
| Host 原始待解析输出 | 单终端高 256 KiB、低 64 KiB、硬 1 MiB；全 Host 硬 4 MiB | UTF-8 bytes 与帧数双计量（最多 256 帧/终端）；高水位 pause，硬超限结束该会话并报缺口 |
| attachment 待发 + 已发未 ACK + Renderer 待写 | 单 attachment 高 128 KiB、低 32 KiB、硬 512 KiB | 同一信用窗口限制发送；每份物理副本分别统计，不将这三处相加冒称只有一份内存 |
| output 单帧 / Renderer 单帧写批 | 16 KiB / 最多 32 KiB 且调度预算 4 ms | UTF-8/ANSI 状态跨块保留；单次 xterm write 不能抢占，超时由性能验收捕获 |
| headless 与 browser 屏幕 | 各最多 2000 scrollback 行；逻辑屏幕与字符串估算各硬 16 MiB/终端 | normal/alternate 两个 buffer、combining 扩展均计入；尺寸限制不替代内存计量；固定库适配不能落实硬界则本项未通过 |
| snapshot | 总编码硬 8 MiB，分片最多 16 KiB，一次仅一个传输 | 复用同一信用窗口；Host/Renderer 快照临时副本各有界，不累计并发 snapshots；超限缩短 scrollback并明示覆盖，仍超限报 resource failure |
| 输入 / 未确认输入 | 每帧 16 KiB、每次粘贴 1 MiB、每会话未确认 64 KiB | 分块保序；超限拒绝且保留未发粘贴，不能静默截断或重试 |
| 输入结果去重 / Main 控制请求 | 每 attachment 最近 256 项 / 每 Host 同时 32 项 | 清理身份固定，超限返回 busy/unknown；诊断不记录输入正文 |
| end 清理 | TERM/HUP 后 3 s，升级后再核查最多 2 s | 未确认返回 cleanup-pending，不成功清空登记；强制结束也不伪报无残留 |

screen 预算包含库内部 cell/扩展字符串成本的保守估算与实测校验；RSS 另按验证设计检查，JS 记账不证明 native/GPU/RSS 都受此上限。每终端处理批次轮转让出事件循环，input/close/revoke 不排在无界输出链后；不预建多宿主调度器或每终端进程。超限诊断只有计数/水位，没有内容。

## 6. 生命周期与清理

`allocated → starting → running → ending → ended`；spawn 失败为 failed；自然 shell exit 为 exited（仍有尾部 drain/cleanup 状态）；Host 崩溃为 host-lost，进程是否已结束独立标 `cleanup-pending/confirmed`。UI 不把断连、exited 或 ended 混成命令成功。清理确认后终态只保存一份受snapshot预算限制的只读序列化屏幕与元数据，释放headless/PTY监听/原始队列；当前可见browser实例按视图释放。终态列表最多8项，超限只回收无清理疑点的最旧屏幕并明示；不能回收仍存活或清理未知的登记。终态序列化屏幕留在Host的有限缓存，Main只保留身份/状态；Host崩溃可使这些屏幕丢失，显示覆盖不可用而不假装完整。移除最后一项终态且无活跃资源后可回收Host，App退出始终释放缓存与Host。

| 事件 | 行为 |
| --- | --- |
| 面板隐藏、React 卸载、路由/Thread 切换 | detach 视图/释放 DOM、fit/rAF/监听；shell 与 Host 屏幕继续，不发 end |
| Renderer 刷新/崩溃 | Main 撤销旧端口；同活 Host 重新 attach 获取快照；不重发输入、不重复 spawn |
| 显式结束终端 | Main 固定目标实例，Host 禁输入、resume 以便尾部 drain、关闭/终止受管组并核查；屏幕与退出原因只读保留 |
| shell 自然退出 | 先有界处理尾部，确认 PTY exit，核查仍在受管组内的子进程；无存活资源才结束登记 |
| TerminalHost 崩溃 | Main fence 全部旧端口、标全部所管终端 host-lost；核查/清理登记的原进程组后，新用户 create 才能启动新 Host/shell；不 adopt 旧 PTY、不自动续跑 |
| 真正退出 App | 汇总 OMP 未完成工作与所有存活/cleanup-pending 终端，复用等待/结束后退出/取消的语义；交互 shell 即使暂时无输出仍是存活资源，不推测 idle；退出交互待确认见 spec |
| Main 非正常终止 | Host 监听 parentPort 关闭并在有证据的父实例消失后清理；不能只因一次心跳/ps 失败杀进程；整机强杀或掉电不能保证尾部与清理完成 |

PTY spawn 后先登记 shell 的 PID/PPID/PGID/birth/executable 与 terminalId/Host 实例，再释放 shell 初始化/用户输入。登记前进程不能运行项目启动代码；若 node-pty 不能提供此顺序，使用小型受控 bootstrap 门控并验证，不先报告 running 再补登记。Main 保留镜像以在 Host 崩溃时清理；Host 管正常 close。信号操作前重新核实实例/组归属，不能仅按 PID、命令名或目录杀进程。node-pty 自身 kill 不作为整棵树已结束的证据。

复用既有受管进程身份机制需要验证 PTY/fork/session 的实际兼容性。清理覆盖当前实例已证实的进程组及追踪到的归属成员；shell job control 可新建组，需观测并纳入已确认子树，校验 PID 复用。脱离/重父化的未知 daemon 不可安全认领，明确报告清理覆盖限制，不按全系统扫描结果任意终止；这不是 OS 沙箱。若必要清理无法成立，关闭受影响 create/退出路径并保留资源故障，不能以杀 Host 或删除记录代替安全门槛。

## 7. 显示、输入与工作台接入

后续直接采用 xterm.js，优先其公开 API 与 fit 适配；锁定 browser/headless/serialize 的兼容组合并记录许可证，避免复制整套 VS Code/T3/DeepSeek 工作台。初期沿用 xterm 默认绘制实现，WebGL 仅在相同样本证明收益后加入，保留 context-loss 回退。headless 额外解析与序列化有 CPU/RSS 成本，必须测量；不在 Host 引入 DOM。

headless 是终端查询应答唯一发送方（例如设备/光标查询），其应答进入同一Host输入顺序和有界字节预算，但不伪造用户inputSeq。browser通过公开parser hooks抑制固定版本的已知reply-producing CSI/DCS/OSC，用户键盘/IME/粘贴/onBinary仍走input；查询涉及显示颜色/窗口信息时，Host使用已确认的主题/尺寸配置回复，未知不猜。不能让headless与browser同时回复shell，不能用简单关键词过滤混合onData。初期支持常见shell、vim/less等所需的屏幕/鼠标/bracketed paste，不启用图像或额外私有图形协议。resize、模式与snapshot重放测试覆盖应答单写，固定版本必须有可验证的适配；确需库私有API时记录原因和升级回归，不默默依赖。

Command + ` 切换面板并按用户动作聚焦，隐藏后恢复先前焦点；组合输入期间不抢焦点/发送半段字符。中文 IME 使用 xterm 原生 textarea，composition 结束才提交确定输入；切换/resize/主题不重建实例。Command+C 只复制选区，无选区不发送中断；Ctrl+C 为终端输入；Command+V 从用户手势粘贴并尊重 bracketed paste，换行内容提示其可能执行命令。其它全局快捷键和 terminal key handling 按焦点仲裁，不影响 Composer。

输出是非可信终端内容。OSC 52 不能从输出读取/写入系统剪贴板；不默认引入能授此能力的 addon。初期链接仅显示，不自动打开 URL/文件、不执行 OSC/title 指令；标题长度/控制字符有界。shell 自己的文件读写不经过 App 文件接口，安全文案须如实表达。可访问性/系统 IME 需要真实 macOS 验证，不能以合成 key events 冒充。

底部终端属于中层工作区按需打开，复用现有 ResizableSplit、工作台焦点/路由与 Icon Layer，不压缩/替换底层状态栏。`ResizeObserver → 帧合并 → fit → 有变化才 resize`，0 尺寸隐藏时不 fit，重开先量内容盒再 attach/resize，保证 PTY/headless/browser 使用确认尺寸。主题颜色读取统一 CSS token 后更新 xterm options，ANSI 色板在设计系统所属 token 中补足语义映射；不复制本页色值或引入 normal/compact 切换。选择、滚动和历史浏览不被每块输出重置；重同步无法保留的选择明确提示。

## 8. macOS 原生构建、诊断与实现约束

当前工程固定 Electron 44.4.5；build 只有 Main/SessionHost 入口，未包含终端依赖。实现增加 TerminalHost 构建入口并将 node-pty native 运行资源独立于 OMP SDK 闭包准备。针对 Electron 内置 Node ABI/目标架构 rebuild 或取得经过核验的匹配 binary，不能用系统 Node 加载成功证明 utility 可用，也不依赖 npmRebuild=false 的现有包配置自动处理。

`.node`、PTY helper 与运行 JS 依赖放真实可访问的 unpacked/extraResources 路径，校验 runtime resolution、可执行权限、rpath/动态库与许可证；不能只 bundle JS、排除 node_modules 后认为 native 已随包。先验证 macOS arm64，其他架构/平台无支持承诺。签名、公证仍沿用[本地交付边界](../engineering/local-delivery.md)，native/helper 必须纳入将来的签名盘点；默认不启用 `allowLoadingUnsignedLibraries`、不加宽 entitlements 来掩盖包问题。若确需 macOS 独占必需能力，按 D-05 带证据与替代方案对齐。

首条链路即提供有界诊断：create/admit/spawn/register、attach/snapshot、input/resize 的结果元信息、pause/resume、buffer high/overflow、shell/Host exit、cleanup 阶段、端口撤销。用同 traceId 贯穿该操作实际经过的层；长寿命输出只聚合计数/积压年龄/水位/耗时，不能逐 token 落盘。记录 terminalId/Host/attachment/seq、exit 与清理证据，不记键入、终端输出、屏幕快照、环境值、任意 argv 或完整路径。诊断上限复用[基础契约 §7](foundation-contracts.md#7-诊断与性能验收预算b6)，诊断失败不阻塞输入/清理。

Effect 仅为终端内部生命周期的后续候选，D-39 的现行授权仍限定 execution/host 与 execution/main/transport；本设计不扩大依赖门禁或授权范围。初期可用明确 Promise/资源释放作用域完成，不以新框架为前置。模块/公开面机器登记、依赖安装和 feature code 只在后续明确开发授权内进行。验收不得用平均分、吞吐优势或某个参考产品弥补无界内存、权限绕过、输入重放、OMP 被终端故障终止等硬失败。
