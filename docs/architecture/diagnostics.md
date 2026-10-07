# 轻量、结构化、可追溯的应用诊断体系

日期：2026-09-25。**D-21 已确认**：从开发开始为 Electron 应用各层建立日志和基础监控体系，结构化、可追溯，日常使用无感，需要时易于读取和呈现。用户随后明确不追求 DeepSeek Harness 式完整体系；专用日志界面可以以后再做。下文是工程目标合同，不代表全部能力已完成；各切片实现与测量见对应spec/交接，不能用文档状态覆盖已有结果或扩大授权。

2026-09-30 按重写工作树核对现有字段与接线，补充 §4.3、§7.1 及[诊断阅读证据](../../.scratch/rewrite-preparation/evidence/diagnostic-reading.md)。保留原设计日期与要求；当前实现、设计目标和未覆盖证据分别说明。

## 1. 建设目标与边界

从第一条业务链路起能回答：哪个版本、哪个进程、哪个 Thread、什么操作、停在哪一步、发生什么错误。记录足够定位问题的事件和耗时，避免把应用做成一个观测平台。

OMP 内部执行/日志机制由 OMP 负责；本项目覆盖 Main、preload/IPC、SessionHost、Renderer 与各功能模块，观测 OMP 进程和 RPC 边界。应用日志不替代 OMP 原生会话，不用来重放写请求、恢复文件或推导 Agent 改动归属。

“无感”是需要验证的体验目标，不是物理零开销承诺：不阻塞交互、不因日志制造卡顿、不无限占用内存或磁盘、不弹出日常噪声。默认本地记录，不增加远程监控服务、完整分布式追踪平台或自动上传。

## 2. 放在架构哪里

- 建立轻量公共 diagnostics 契约，各层用同一事件/上下文格式。公共契约不依赖 React 或 OMP SDK，业务不直接绑定某个日志库。
- Main 管日志设施的生命周期、日志目录和资源策略；落盘采用异步批量 Writer，不在 Main/Renderer 热路径同步 I/O。是否需要 Node worker 由首个性能验证决定，不预设额外常驻进程。
- SessionHost 与 Renderer 发出经处理的小型事件，跨进程批量传输且有上限；不复制高频流式正文到日志，不让诊断流量挤占会话数据。
- preload 只暴露受限接口，校验字段与大小；接收端提供可信进程身份。远程浏览页不获得诊断权限。Renderer 不直接写日志文件。
- 日志落盘不依赖主业务页面或 OMP 健康；未来查看器只读已有日志和查询接口。查询/格式化不能反过来拖慢业务。
- 优先复用成熟日志实现的输出、轮转、错误处理能力；项目自己维护的是事件语义、关联和脱敏。当前实现选择不引入日志库，直接以 `node:fs/promises` 写有界队列/批量/轮转（见 `src/platform/main/diagnostics/diagnostics.ts`）：需要的是可审计的结构化事件与跨进程关联，而不是通用日志框架；若后续出现轮转/背压/多进程写入的真实缺口，再按[技术选型审议](technology-selection-review.md)的候选状态重新评估，不因此提前引入依赖。

## 3. 每层的最小记录

下表是随功能落实的记录目标，不表示每项都已采集。现有接线与缺口见 §4.3；例如未实现的浏览器/终端功能没有对应监控，Renderer 与 Host 也没有独立日志 Writer。

| 层 | 从开始就记录的内容 |
| --- | --- |
| Main | 启动/构建版本、窗口/子进程生命周期、退出原因、启动失败及日志设施异常 |
| preload / IPC | 关键请求发送/接受/响应/失败、接口校验、断连与连接代次 |
| SessionHost | OMP 启停、RPC 命令状态、解析失败、同步缺口、积压及重连 |
| Renderer | 刷新/Thread 切换、关键操作结果、错误边界/未处理错误、关键更新是否应用 |
| Composer / 附件 | 准备、处理、提交和失败，草稿版本及数量/大小摘要，不记录逐键内容 |
| 文件 / Monaco / Diff / Git | 资源标识、来源版本、读取/计算/操作耗时与错误、资源释放 |
| 后续浏览器 / 终端 / Side Chat | 随组件一起接入创建/销毁、请求与失败记录，不提前实现未开发组件的监控 |

不是每个函数都写日志。围绕边界、状态变化、异常和关键耗时记录；全局错误捕获与 console 桥接只是兜底，不替代业务语义。

## 4. 跨进程 Trace 与结构化合同（D-22）

用户明确要求：在 Renderer 拿到一个 trace ID，必须能检索到同一次操作实际经过的 Main、utility process 等阶段。这是基础架构要求，不是以后才做的可选字段。“轻量”约束采集成本，不削弱端到端关联和错误类型。

当前 Main 是唯一 JSONL Writer。Renderer 在模型/查询入口生成 trace；preload 已将桌面请求的发起、回复确认与传输/回复校验失败送到 Main。文件/Git 读取在 Main 记录进入和结果；提交协调器记录收据阶段，SessionHost 保留冻结提交的 trace/请求/目标身份，运行控制结果携带原 trace 回到 Main 后记录。因此不能概括为 Renderer/SessionHost 完全未接入。它们尚无独立、通用的结构化诊断采集通道，当前业务 envelope 也未实现下列全部 span/采样/因果链接字段。不能把 Main 写出的记录冒称 Host 自身的观察，或宣称已得到 OMP 内部的完整 trace。

### 4.1 标识及生命周期

本节描述完整设计合同。实际已记录的身份及尚未落实项见 §4.3；设计字段不能填造默认值来伪装已有证据。

| 字段 | 语义 |
| --- | --- |
| `traceId` | 一次明确的用户操作/后台工作链路；跨应用进程保持不变，不是 Thread ID 或产品 Run ID |
| `spanId` / `parentSpanId` | 重要阶段及因果父阶段；跨 IPC 创建接收阶段，进程内不对每个函数埋点 |
| `requestId` | 一次具体请求/响应匹配；一次 trace 可有多个请求，重试使用新的 requestId 和 attempt |
| `threadId` / 原生 session/tool ID | 业务关联，按场景附带，不替代 trace |
| `appSessionId` / `processInstanceId` / 连接代次 | 应用启动与进程/连接身份，防止刷新、重连及 pid 复用串线 |
| `eventId` / 进程内 `seq` | 单条证据标识与本进程顺序，供错误链引用和缺口定位 |

在 Renderer 发起操作处生成 trace，带入准备、提交、宿主处理和可确定关联的返回/展示阶段。Main 启动、后台任务等没有 Renderer 来源时生成自己的根 trace；不伪造用户来源。关联上下文中必备 traceId、当前 spanId 和采集策略，其他业务字段按需携带。

长生命周期原生会话不强行放入单个无限 trace。排队提交 trace 记录到接受结果；后续执行能以可靠 ID 关联时记录因果链接，不能可靠关联时只关联到 session，标明关联粒度。恢复产生新请求/span 和实例代次，引用旧操作，不复用已结束 span。多来源批量操作、合并更新或异步广播用受限数量的因果 links，不随意挑一个请求当唯一父节点。

### 4.2 传播路径

- 应用内部 IPC/MessagePort 请求、响应与业务事件 envelope 显式携带诊断上下文，发送/接收的关键边界事件记录同一 traceId。传输层统一实现，业务模块不手工拼接不同格式。
- Renderer → preload → Main 的宿主操作，以及 Renderer → preload/MessagePort → SessionHost 的会话操作，各按真实路径记录。**不为了追踪而让 Main 转发原本直达 Host 的流式消息**；Main 建通道的生命周期 trace 可被引用，没经过 Main 的操作不伪造 Main span。
- 进程内异步可以利用上下文工具，但 Promise、回调、定时器、队列和事件订阅必须有明确绑定/释放；不能用进程级可变“当前 trace”在并发 Thread 间共享。跨进程永远显式序列化，不能假定进程内上下文自动传播。
- preload/宿主校验上下文 schema、格式、大小、协议版本，并由可信接收端注入实际进程身份；trace 不是权限凭证。应用协议中缺失上下文是可诊断的集成缺陷：记录 correlation gap，必要时创建独立接收 trace，不能悄悄伪装整条链完整。未知响应不能仅靠它自报的 traceId 匹配当前请求。
- OMP 协议保持原样。Host 用原生 request/tool/session ID 建有界映射，关联自身的发送和接收事件；不把自定义字段塞进未支持的 RPC，也不宣称跟踪到了 OMP 内部没有暴露的函数。
- 关联标识随业务 envelope 传播；日志数据仍走异步有界诊断通路。日志事件丢弃不影响业务路由，采样策略沿 trace 传播，关键边界/终态与错误优先保留，明确不完整性。

### 4.3 每条记录的结构

现有格式由 [DiagnosticEvent 与 Writer](../../src/platform/main/diagnostics/diagnostics.ts)定义，读取时使用真实字段：

| 当前字段 | 含义与限制 |
| --- | --- |
| `schemaVersion: 1`、`time` | JSONL 版本和记录时的 ISO 墙钟时间；当前字段名不是 `timestamp` |
| `process: "main"`、`processInstanceId` | Main Writer 及本次 Writer 实例 UUID；preload 转交的事件仍由 Main 落盘 |
| `build` | `version`、`commit`、`dirty`、`id`；直接源码测试是 `unbundled`，不能当发布构建 |
| `traceId`、`requestId`、`connectionId`、`operation`、`stage` | 现有最小关联合同；不同入口的 request/connection 语义如下文，不能只凭字段同名合并请求 |
| `observedAt: "preload"` | 当前只有桌面请求的 preload 观察附此值；缺省记录没有 Host/Renderer 独立采集身份 |
| `submissionId`、`threadId`、`nativeProcessInstanceId` | 按入口附带；提交及部分运行控制有这些字段。目标实例 UUID 由 Main 生成、Host ready 核对，不是操作系统 pid |
| `receiptState`、`outcome` | 提交收据的调用状态与执行结果；每次协调器记录及 Host 退出后的逐收据记录分别保留这两种事实，不只看 stage |
| `durationMs`、`errorId`、`code`、`causeCode` | 按入口附带；耗时采用 `performance.now()` 差值。`causeCode` 是有界机器码，不记录异常全文 |

桌面请求的 requestId/connectionId 来自 preload envelope，并在 Main 和 preload 结果记录复用。文件/Git 读取的 requestId 由 Main 在 I/O 前生成，connectionId 使用 Main Writer 实例；运行控制入口也有 Main 请求 ID，但 Host 返回的控制结果当前用 traceId 作为 requestId、generation 作为 connectionId。提交的 requestId 是原生 prompt 帧 ID，connectionId 是冻结的连接代次。跨这些路径先按 trace 汇集，再按操作和实际身份区分阶段，不把不同 requestId 当成丢失传播的同一请求。

当前 `stage` 包含 `initiated`、`confirmed`、`acknowledgement-failed`、`received`、`completed`、`prepared`、`dispatching`、`acknowledged`、`unknown`、`failed`、`renderer-gone`、`disconnected`、`exited`。`failed` 既可能来自拒绝，也可能来自执行失败；提交记录必须同时看 `receiptState`/`outcome`，具体拒绝原因仍回查类型化收据/结果。`spanId`、`parentSpanId`、`appSessionId`、`eventId`、进程内 `seq`、`level`、`eventName`、`component`、通用事件的 `phase`/结果合同、采样与因果 links 尚未实现。

`runtime:host` 的 disconnected/failed 来自 Main 收到 Host interrupted/failed，exited 来自 Main 确认 utility Host exit。这里的 traceId/requestId 使用当前 RuntimeView 的 trace，未必是某个提交 trace；用连接代次补关联，不能改贴提交来源。`code`只保留 `spawn`、`protocol`、`exit`、`write`、`state-unavailable`、`active-work`、`runtime-unavailable`，其他原因记 unknown。Host 退出后逐 in-flight 收据的 `submit` 记录保留该收据原 trace/request/target，并带 `code: "host-exited"`及更新后的两种事实。utility 退出不能冒充官方 Native 执行全生命周期单写证据。

完整目标结构保留 `schemaVersion`、`timestamp`、`level`、稳定 `eventName`、`component`、trace/进程身份、`phase`、`outcome`，并按场景附耗时、类型化属性与错误；后续落实时须记录与现有格式的兼容/迁移关系。构建/应用/Electron/Runtime 版本可存启动清单并关联，当前 `build` 不包含全部运行环境版本。

阶段包含开始、成功、失败、取消；生命周期突然结束时由监督事件标记中断/未完成，不倒填成功。耗时使用进程内单调时钟，跨进程因果靠 ID/父子关系，不能用两台时钟相减或仅按日志接收时间推断顺序。

日志查询至少能按 traceId 汇集所有来源文件、阶段、耗时、错误链和缺口；从用户可见错误复制 traceId 后可定位同一操作。专用 UI 可后做，统一检索语义不能后补。

### 4.4 错误合同与归因

**发现错误的位置、错误从哪里返回、根因责任和负责处理的层不是同一个概念。** OMP 返回错误不等于 OMP 有 bug；也不能因为 OMP 内部不由本项目维护就吞掉它的错误。

建议跨进程采用可序列化、带版本并在边界运行时校验的 discriminated union，不把 JS Error 原型或任意 `any` 对象直接跨 IPC。示意（设计，非产品实现）：

```ts
type Attribution =
  | { status: 'unknown'; evidenceIds: string[] }
  | { status: 'suspected' | 'confirmed'; domain: 'app' | 'omp' | 'provider' | 'environment'; evidenceIds: string[] };

type FailureCategory =
  | 'validation' | 'permission' | 'authentication' | 'rate_limit'
  | 'transport' | 'protocol' | 'timeout' | 'process_exit'
  | 'resource' | 'invariant' | 'unknown';

type DiagnosticFailure = {
  schemaVersion: 1;
  errorId: string;
  traceId: string;
  spanId: string;
  code: string; // 稳定码，由类型化目录限制；不以 message 文案匹配处理
  category: FailureCategory;
  observedAt: string; // 发现/封装错误的应用模块
  reportedBy: 'app' | 'omp' | 'provider' | 'os' | 'unknown';
  attribution: Attribution;
  causeErrorId?: string;
  handlingOwner: string;
  recovery: 'none' | 'retry_safe' | 'reconcile_first' | 'user_action';
  message: { code: string; params?: Record<string, string | number> };
};

type OperationResult<T> =
  | { status: 'ok'; value: T }
  | { status: 'cancelled'; reason: string }
  | { status: 'failed'; error: DiagnosticFailure }
  | { status: 'unknown'; error: DiagnosticFailure }; // 如写操作超时，副作用是否发生未知
```

error code、eventName、component 和结构化 attributes 在实现中由类型目录约束；`message.code` 是应用自有提示的稳定语义码，参数按具体码限制来源与长度，由展示层按当前语言翻译，不将已翻译文案作为 IPC 或状态合同。外部未知异常先用 unknown 接收、校验和归一化，保留有界/脱敏的原始码、异常类型、堆栈、退出状态及证据引用；OMP、工具与用户原文另存且原样显示，不作为应用词条。归因判断必须带证据，不能根据错误文案关键词直接定责。后续修正归因追加新事件引用原 errorId，不抹掉原始观察。

| 观测 | 初始分类/归因 | 不应得出的结论 |
| --- | --- | --- |
| Renderer 自有组件异常、堆栈定位应用代码 | app 报告；应用缺陷候选，结合堆栈/复现确认 | 所有上游数据必然正确 |
| OMP 拒绝请求参数 | omp 报告、validation；责任检查请求与协议 | 自动算成 OMP bug；可能是我们的参数错误 |
| OMP 明确返回 provider 认证/限流信息 | omp 报告，保留嵌套来源；provider/配置归因有据时记录 | 当作应用崩溃或 OMP 实现缺陷 |
| Host 等待超时或 OMP 退出 | timeout/process_exit，记录边界和状态，根因可 unknown | 默认 OMP bug；可能是管道、宿主卡顿、资源或外部终止 |
| OMP 原始帧不符合固定协议 | protocol；保留脱敏元数据、版本和校验结果 | 未排除解码器错误就确认 OMP 故障 |
| 帧有效但我们的 decoder/镜像失败 | app 归因候选，附解析/适配证据 | 用笼统“Runtime 异常”掩盖应用 bug |

原生 stderr/stdout 不能作为未经处理的日志全文镜像；stdout 继续由协议解码器独占消费，诊断从解码边界取元信息。内容不足以确认的根因保持 unknown；可生成必要的版本、请求摘要和复现信息协助上游排查，不自动对外上传。

### 4.5 谁处理、谁记录、谁恢复

| 责任层 | 处理职责 |
| --- | --- |
| 业务模块 | 返回已知失败/取消；在语义边界建立稳定错误码，不能吞异常后返回成功 |
| preload / 传输 | 校验 envelope、追踪收发/断连；保留 cause，只分类传输错误，不猜业务根因 |
| Host / OMP adapter | 区分 RPC 拒绝、协议/解码错误、原生进程退出和应用适配异常；管理关联映射与同步；不隐藏 Runtime 错误 |
| Main / 进程监督 | 处理应用级进程生命周期及崩溃留证，决定是否重建连接/宿主；不擅自重放用户写请求 |
| 操作拥有者 | 统一决定重试/取消/恢复；避免每层各自重试。结果不明的副作用先查状态；只在可证明安全时自动重试 |
| Renderer | 展示安全提示、可行操作和可复制 traceId；不依赖错误文案决定逻辑，不向用户暴露秘密堆栈 |
| 诊断设施 | 校验、关联、存储、查询；不改变业务结果、不负责 Agent 恢复 |

第一次明确失败建立 errorId；上层只在增加处理意义时记录关联事件/包装原因，避免每层重复全量堆栈与错误计数。错误指标以明确层级/逻辑失败 ID 聚合，不把传播三跳算三次独立故障。预期取消不是普通 error；副作用是否完成不明时不能简单宣称已取消成功。未知/未处理异常由顶层边界兜底留证并进入明确失败/中断状态，不能靠 catch-all 继续假装健康。

## 5. 性能与存储约束

下列仍是预算和故障合同。现有 Writer 已有 FIFO 有界队列、异步批量、大小/总量/时间轮转与退出限时 drain；目前没有日志级别优先级、限时 debug、丢弃摘要落盘、独立 emergency 文件或上次异常退出识别。`dropped`/`degraded` 是运行中的内存状态，Writer 失败会通知一次应用提示，不能据此声称零丢失或已有完整缺口记录。

- 默认关键 info/warn/error，debug 按组件/Thread 限时开启，结束自动恢复；不依赖重启应用才能拿到后续详细日志。
- 异步、批量、有界队列；debug 洪峰先采样/丢弃，关键错误优先，但不能宣称崩溃/磁盘满时零丢失。留存丢弃计数或缺口信息，不把丢日志解释成没有发生事件。
- 默认本地 JSONL，单文件单 Writer，按大小/总量/时间轮转；放系统应用日志目录，不写用户项目。具体保留天数、配额和批次以[基础契约 §7](foundation-contracts.md#7-诊断与性能验收预算b6)的初始预算为单源，本节不复制数值。
- 源头避免构造巨型日志对象，传输前做字段选择和大小限制；不通过异步落盘掩盖主线程序列化开销。
- 启动前小型缓冲、正常退出限时 flush；强制终止可能损失尾部。下次启动能识别非正常退出和不完整尾行，读取前面合法记录。
- Writer 失败或磁盘满不递归调用自身、不无限重试或阻塞业务。可用独立小型 emergency 留证；故障恢复后写缺口摘要。异常状态按需可查，影响可诊断性时给一次明确提示，不持续弹窗。

## 6. 基础监控：少量有用信号

从开始保留进程退出/存活、关键操作耗时、请求超时、队列长度/积压年龄、重连和错误计数；用有界聚合记录，避免高频逐样本落盘。

CPU/内存、Main/Host 事件循环延迟和 Renderer 响应性作为低频或按需诊断指标，依实际支持范围接入。外部 OMP 进程不能假定在 Electron 的全部指标中；取不到就标不可用。休眠和后台节流不能误判为崩溃，不按心跳丢失自动重发业务请求。

日志设施自身也记录丢弃数、写入失败和当前保留范围。指标标签用组件/操作类别，不用每个文件路径/请求 ID 建独立指标序列。阈值和采样频率由基线测量确定，不预先建设告警平台。

## 7. 需要时怎么查看

首版先保证稳定日志位置、可读 JSONL、明确的字段/筛选说明，以及按 traceId/时间/Thread/operation 选择和脱敏导出所需的基础。允许开发者直接用通用文本/JSON 工具查看，不以 DevTools 控制台作为唯一证据。

目前可直接读取 `app.getPath("userData")/logs/main.jsonl` 与 `main-<毫秒时间>.jsonl`。`D_PI_DATA_DIR` 会覆盖 userData；macOS 默认常见目录为 `~/Library/Application Support/d-pi/logs`，验证隔离目录按实际启动参数选择。2026-10-06起，M2诊断切片提供正式全局/故障trace入口、有界只读采样与本地脱敏JSON导出。Main拥有读取与原生保存，preload校验请求/回复及关联，Renderer只筛选、展示和发出导出意图；不新增日志Writer或业务恢复事实。实现及真实候选证据见[M2所属规格](../../.scratch/m2-first-release/spec.md#2026-10-06-基础诊断导出与故障反馈切片)，工程/试用/用户认可继续分开。

本轮只提供现有保留日志的按需采样和本地导出，不打开任意目录、不轮询、不读原生会话、凭据或崩溃dump。按时间、trace、Thread、Main Writer实例、operation及stage筛选，结果上限500条；导出使用同一受限读取器及白名单字段，不包含自由文本/路径/URL。用户可复制受控诊断元数据和反馈模板后自行补复现并提交，应用不自动上传。

2026-10-06基础读取器每次最多检查256目录项、12个文件、8MiB、20,000行、64KiB单行，返回1–500条；协作式扫描时限1,500ms，每128行让出事件循环。受限JSON报告最多2MiB，本地临时文件0600后原子rename。达预算、坏行、不可读与当前Writer退化/丢弃均明确输出。时限检查不能抢占尚未返回的系统文件I/O；采样不等待Writer落盘，也不证明未匹配操作未发生。读取重叠可返回typed busy，GUI允许手动刷新；完整B6 A/B与故障全集仍待验。

**专用日志界面是后续能力，不是首版或开工前置。** 后续可在既有结构上增加过滤、关联时间线、错误展开和指标摘要。没有查看器时也能诊断，主业务页面崩溃不丢失已落盘证据。

### 7.1 现有 JSONL 的 trace 筛选

在仓库已准备好的 Node 环境执行，下列只读命令汇集目录内所有 JSONL，并报告无法解析的行数。填入用户错误或请求中的真实 trace；文件/Git 查询的失败对象也保留 `traceId`，但不是每个界面结果都已提供复制入口。

```sh
export DP_LOG_DIR="${D_PI_DATA_DIR:-$HOME/Library/Application Support/d-pi}/logs"
export DP_TRACE='替换为实际 traceId'
node --input-type=module <<'NODE'
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
const directory = process.env.DP_LOG_DIR;
const trace = process.env.DP_TRACE;
if (!directory || !trace) throw new Error('DP_LOG_DIR and DP_TRACE are required');
let matches = 0;
let invalidLines = 0;
for (const name of (await readdir(directory)).filter(n => n.endsWith('.jsonl')).sort()) {
  const lines = (await readFile(join(directory, name), 'utf8')).split('\n');
  for (let index = 0; index < lines.length; index++) {
    if (!lines[index].trim()) continue;
    let event;
    try { event = JSON.parse(lines[index]); }
    catch { invalidLines++; continue; }
    if (event?.traceId !== trace) continue;
    matches++;
    console.log(JSON.stringify({ logFile: name, logLine: index + 1, ...event }));
  }
}
console.error(JSON.stringify({ traceId: trace, matches, invalidLines }));
NODE
```

文件/行顺序是读取线索，`time` 只是墙钟采集时间；当前无 span/seq，不据此构造跨进程严格时间线。`matches: 0` 表示当前保留文件没找到，不能证明操作没发生；轮转、丢弃、进程终止或未接入的阶段都可能留下缺口。

阅读时先按 `build` 和 `processInstanceId` 划定构建/Writer，再按 trace、request、connection、Thread/Submission 检查最后确认位置：

1. 桌面操作通常依次有 preload `initiated`、Main `received`、Main `completed`/`failed`、preload `confirmed`/`acknowledgement-failed`。`confirmed` 表示回复已通过 shape 与关联校验，回复本身仍可能是类型化失败；仅有 `received` 不能倒填完成。文件/Git 目前记录 Main 的进入与结果，前端查询异常保留请求 trace，不能声称已有两端落盘事件。
2. 提交的 `prepared` 是原文/身份已持久化，`dispatching` 是派发门已持久化，不能证明已写入原生管道；`acknowledged` 是关联 prompt 回复已持久化，不能证明执行结束。以 [SubmissionReceipt](../../src/modules/execution/contracts/submission.ts)的 `state`、`acknowledgedAt`、`outcome`、`rejectionReason`分开阅读。`unknown` 不自动重发；已 ACK 后的 `failed`/`unknown` 执行结果不会回退为未 ACK。控制操作中的 answer `acknowledged` 当前只表示管道写入未抛错，原生 extension response 没有 ACK，不混用提交含义。
3. [NativeSession](../../src/modules/execution/host/native/native-session.ts)的 `disconnected` 是传输不可继续，`exited` 来自原生子进程 `close`，是另一个确认事实。协议故障可以先断连而进程仍活着；不能由断连推断退出/释放所有权。`runtime:host + exited` 表示该 Host scope 的连接释放，既可能来自单个 native close，也可能来自 utility 退出，不能单凭它判定整个 utility 已死。2026-10-02 起，Main 独立记录 `runtime:native-exit` / `runtime:utility-exit` 的 `processPid`、`exitCode`、`exitSignal`、`terminationReason`、`requestedExitCode`；utility 不提供 signal，原因帧丢失保持 null。SIGKILL 本身不能证明 OOM 或 watchdog；SDK 请求的 exit(0/非零)与 bootstrap 为清理组实际产生的 SIGKILL 分开阅读。Host 没有独立 Writer，Main/utility 先被强杀仍可能丢失退出转交。[RuntimeService](../../src/modules/execution/main/runtime/runtime-service.ts)只处理其真实 in-flight 集合，不能把 Host 为迟到回复保留的全部关联都当执行中任务。
4. 对同一 submission/request/target，先找 `receiptState: acknowledged`，再看后续 `outcome`。Host 退出的 `submit + stage: unknown + code: host-exited`仍可保留 `receiptState: acknowledged`，表示接受事实没撤回而执行结果未知；已有 failed 结果也不被 unknown 覆盖。要找 Host 生命周期观察，可再按该条 `connectionId`筛选：`rg -n -F '替换为实际 connectionId' "$DP_LOG_DIR" -g '*.jsonl'`，再核对 build/Writer/Thread。它的生命周期 trace 可能与提交不同，不伪造同一请求。保留文件缺阶段时回查类型化结果、只读收据及具名样本，不由日志重放提交。现有实测、回放与故障注入的区别见[诊断阅读证据](../../.scratch/rewrite-preparation/evidence/diagnostic-reading.md)。

## 8. 内容与故障边界

- 默认记元数据、状态和错误，不记对话全文、代码全文、附件二进制、终端输出、浏览器 DOM 或完整环境变量；token/API key/Cookie/认证头禁止进入日志。
- 源头字段白名单与脱敏先于落盘，错误堆栈、OMP stderr、路径和 URL 参数同样检查，避免错误对象携带秘密。
- 如确需内容级排查，单独启用有范围与时限的诊断捕获，清楚说明采集项；导出包含版本、覆盖范围和缺口，不默认上传外部服务。
- JS 异常、进程退出与原生崩溃工件分开。可评估 Electron crashReporter 本地工件，但它不代替日志、不保证覆盖独立 OMP，dump 不默认混入普通导出。
- 应用退出后不会持续监控自己；Main 崩溃后的可用证据由已落盘内容、系统/原生工件和下次启动检查构成，不承诺绝对无遗漏。

## 9. 随功能接入，按风险验收

从第一条可运行链路开始，规格/实现同时交代关键事件、关联字段、错误分类、性能与敏感内容边界。新功能可观测性与功能一起交付，不能留“以后补日志”。

每个功能只检查实际经过的边界与新增错误路径，复用已验证的日志设施；下面是里程碑与相关高风险改动的样本池，不是每项功能的最小必跑集：Renderer 的一个 traceId 可查询同一操作实际经过的 Main/Host 等阶段；并发两个 Thread、交错 IPC 响应、重试、排队与进程重启不串 trace；缺少上下文、过期响应和日志缺口可见；分别注入应用异常、OMP 拒绝、provider 错误、协议损坏、超时与崩溃，验证来源和根因不混淆、错误链不丢失、不会多层重复重试。发送失败能定位到阶段；刷新/崩溃可区分实例和恢复；断连/过期响应有原因；长输出/日志洪峰不无限积压；磁盘满/Writer 故障不拖住业务且有缺口信息；秘密不进入默认记录。

验证投入的通用规则单源见[无头功能合同](headless-features.md)，这里只留诊断特有的触发条件与样本：日志设施/序列化热路径变化、发现退化或进入 M1/M2 性能组合验收时，再验证“无感”：使用同环境、同业务样本，对比诊断启用/关闭的输入响应、流式展示、启动时间、Main/Host 事件循环、CPU/内存和磁盘增长。同时覆盖默认记录与临时 debug；调试模式也有资源上限。不需要零成本，但不得引入用户可感的卡顿、业务超时或持续增长。实现前明确测试样本和可接受预算，测试后记录实测值，不能凭感觉宣称通过。

## 10. 资料与状态

2026-09-25 阅读：[DeepSeek Harness core](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/core.md)及[persistence](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/persistence.md)支持类型化事件与可追溯原则；本项目只借鉴思路，不引入其会话事件溯源或全平台架构。master 为动态来源。

[Electron app](https://www.electronjs.org/docs/latest/api/app)、[crashReporter](https://www.electronjs.org/docs/latest/api/crash-reporter)与[Node perf_hooks](https://nodejs.org/api/perf_hooks.html)提供部分进程/故障/耗时观测能力；采用前核实选定 Electron 内置 Node 版本、平台及进程覆盖。2026-09-25 这次设计记录未安装日志库、未运行性能或故障实验；后续实现及验证按对应切片追溯，不沿用这句作为当前工程状态。


## 11. 初始预算与验收样本

2026-09-25 用户授权补齐 B6；队列、轮转、debug 时限、性能 A/B 门槛及负载样本集中在[基础契约 §7](foundation-contracts.md#7-诊断与性能验收预算b6)。这些是待测工程目标，不是历史实测结果；调整须记录测量和影响。业务提交/附件/输出恢复独立于诊断存储，日志不得成为恢复事实来源。

### 2026-10-07 T3 基础重构：Writer 安全与恢复合同

采集与读取/导出各自执行白名单。采集仅访问事件的允许数据字段，在序列化前校验有限枚举、UUID 和数字；忽略任意额外字段、访问器与 `toJSON`，Writer 自己注入时间、构建和进程实例。无效采集不抛入业务路径。读取/导出继续独立过滤历史记录，不依赖生产者已经可信。

累计 `dropped` 仅表示确认在 append 前丢弃；`uncertain` 表示 append 未确认，不推断实际字节是否已写；`retentionFailures` 单独记录清理失败，不重复算作已写记录丢失；`rejected` 表示非法采集或关闭后拒收。当前 episode、最近恢复和累计计数分别有界保存。下一次完整写入及清理成功解除当前退化，写入仅含计数、时间和枚举的缺口摘要；摘要失败不递归记录。提示按每个退化 episode 最多一次。

关闭停止新采集且幂等，仍采用既有 2s drain 预算；到期结算尚未开始的队列，已启动不可抢占的 I/O 明确为在途，后续不继续无限 drain。队列、batch、轮转和留存的 B6 预算沿用。查询不等待 flush，不把 Writer 健康当作业务结果。实施及固定样本证据归属 [T3 基础重构规格](../../.scratch/t3-foundations/spec.md)。
