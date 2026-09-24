# 轻量、结构化、可追溯的应用诊断体系

日期：2026-09-25。**D-21 已确认**：从开发开始为 Electron 应用各层建立日志和基础监控体系，结构化、可追溯，日常使用无感，需要时易于读取和呈现。用户随后明确不追求 DeepSeek Harness 式完整体系；专用日志界面可以以后再做。下文是工程落实方案，不代表库、阈值或性能已验证；当前仅设计，不开工。

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
- 优先复用成熟日志实现的输出、轮转、错误处理能力；项目自己维护的是事件语义、关联和脱敏，具体库尚未锁定。

## 3. 每层的最小记录

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

用户明确要求：在 Renderer 拿到一个 trace ID，必须能检索到同一次操作实际经过的 Main、utility process 等阶段。这是基础架构要求，不是以后才做的可选字段。“轻量”约束采集成本，不削弱端到端关联和错误类型。以下字段与处理方式为工程合同设计，尚未实现验证。

### 4.1 标识及生命周期

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

基础字段为 `schemaVersion`、`timestamp`、`level`、稳定 `eventName`、`component`、上述 trace/进程身份、`phase`、`outcome`；按场景附 `durationMs`、类型化属性与错误。构建/应用/Electron/Runtime 版本可存启动清单并关联。

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
  safeMessage: string;
};

type OperationResult<T> =
  | { status: 'ok'; value: T }
  | { status: 'cancelled'; reason: string }
  | { status: 'failed'; error: DiagnosticFailure }
  | { status: 'unknown'; error: DiagnosticFailure }; // 如写操作超时，副作用是否发生未知
```

error code、eventName、component 和结构化 attributes 在实现中由类型目录约束；外部未知异常先用 unknown 接收、校验和归一化，保留有界/脱敏的原始码、异常类型、堆栈、退出状态及证据引用。归因判断必须带证据，不能根据错误文案关键词直接定责。后续修正归因追加新事件引用原 errorId，不抹掉原始观察。

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

- 默认关键 info/warn/error，debug 按组件/Thread 限时开启，结束自动恢复；不依赖重启应用才能拿到后续详细日志。
- 异步、批量、有界队列；debug 洪峰先采样/丢弃，关键错误优先，但不能宣称崩溃/磁盘满时零丢失。留存丢弃计数或缺口信息，不把丢日志解释成没有发生事件。
- 默认本地 JSONL，单文件单 Writer，按大小/总量/时间轮转；放系统应用日志目录，不写用户项目。具体保留天数、配额和批次由实测定值并文档化，不允许无限默认值。
- 源头避免构造巨型日志对象，传输前做字段选择和大小限制；不通过异步落盘掩盖主线程序列化开销。
- 启动前小型缓冲、正常退出限时 flush；强制终止可能损失尾部。下次启动能识别非正常退出和不完整尾行，读取前面合法记录。
- Writer 失败或磁盘满不递归调用自身、不无限重试或阻塞业务。可用独立小型 emergency 留证；故障恢复后写缺口摘要。异常状态按需可查，影响可诊断性时给一次明确提示，不持续弹窗。

## 6. 基础监控：少量有用信号

从开始保留进程退出/存活、关键操作耗时、请求超时、队列长度/积压年龄、重连和错误计数；用有界聚合记录，避免高频逐样本落盘。

CPU/内存、Main/Host 事件循环延迟和 Renderer 响应性作为低频或按需诊断指标，依实际支持范围接入。外部 OMP 进程不能假定在 Electron 的全部指标中；取不到就标不可用。休眠和后台节流不能误判为崩溃，不按心跳丢失自动重发业务请求。

日志设施自身也记录丢弃数、写入失败和当前保留范围。指标标签用组件/操作类别，不用每个文件路径/请求 ID 建独立指标序列。阈值和采样频率由基线测量确定，不预先建设告警平台。

## 7. 需要时怎么查看

首版先保证稳定日志位置、可读 JSONL、明确的字段/筛选说明，以及按 traceId/时间/Thread/operation 选择和脱敏导出所需的基础。允许开发者直接用通用文本/JSON 工具查看，不以 DevTools 控制台作为唯一证据。

应用可提供轻量“打开日志目录/导出诊断资料”入口；具体入口安排随首版设计，不要求先做实时日志页面。日志模块预留按范围读取、分页/流式查询接口边界，不为将来 UI 提前建数据库。

**专用日志界面是后续能力，不是首版或开工前置。** 后续可在既有结构上增加过滤、关联时间线、错误展开和指标摘要。没有查看器时也能诊断，主业务页面崩溃不丢失已落盘证据。

## 8. 内容与故障边界

- 默认记元数据、状态和错误，不记对话全文、代码全文、附件二进制、终端输出、浏览器 DOM 或完整环境变量；token/API key/Cookie/认证头禁止进入日志。
- 源头字段白名单与脱敏先于落盘，错误堆栈、OMP stderr、路径和 URL 参数同样检查，避免错误对象携带秘密。
- 如确需内容级排查，单独启用有范围与时限的诊断捕获，清楚说明采集项；导出包含版本、覆盖范围和缺口，不默认上传外部服务。
- JS 异常、进程退出与原生崩溃工件分开。可评估 Electron crashReporter 本地工件，但它不代替日志、不保证覆盖独立 OMP，dump 不默认混入普通导出。
- 应用退出后不会持续监控自己；Main 崩溃后的可用证据由已落盘内容、系统/原生工件和下次启动检查构成，不承诺绝对无遗漏。

## 9. 每项功能的完成标准

从第一条可运行链路开始，规格/实现同时交代关键事件、关联字段、错误分类、性能与敏感内容边界。新功能可观测性与功能一起交付，不能留“以后补日志”。

最小验收包括：Renderer 的一个 traceId 可查询同一操作实际经过的 Main/Host 等阶段；并发两个 Thread、交错 IPC 响应、重试、排队与进程重启不串 trace；缺少上下文、过期响应和日志缺口可见；分别注入应用异常、OMP 拒绝、provider 错误、协议损坏、超时与崩溃，验证来源和根因不混淆、错误链不丢失、不会多层重复重试。发送失败能定位到阶段；刷新/崩溃可区分实例和恢复；断连/过期响应有原因；长输出/日志洪峰不无限积压；磁盘满/Writer 故障不拖住业务且有缺口信息；秘密不进入默认记录。

验证“无感”使用同环境、同业务样本，对比诊断启用/关闭的输入响应、流式展示、启动时间、Main/Host 事件循环、CPU/内存和磁盘增长。同时覆盖默认记录与临时 debug；调试模式也有资源上限。不需要零成本，但不得引入用户可感的卡顿、业务超时或持续增长。实现前明确测试样本和可接受预算，测试后记录实测值，不能凭感觉宣称通过。

## 10. 资料与状态

2026-09-25 阅读：[DeepSeek Harness core](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/core.md)及[persistence](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/persistence.md)支持类型化事件与可追溯原则；本项目只借鉴思路，不引入其会话事件溯源或全平台架构。master 为动态来源。

[Electron app](https://www.electronjs.org/docs/latest/api/app)、[crashReporter](https://www.electronjs.org/docs/latest/api/crash-reporter)与[Node perf_hooks](https://nodejs.org/api/perf_hooks.html)提供部分进程/故障/耗时观测能力；采用前核实选定 Electron 内置 Node 版本、平台及进程覆盖。本轮未安装日志库、未运行性能或故障实验。


## 11. 初始预算与验收样本

2026-09-25 用户授权补齐 B6；队列、轮转、debug 时限、性能 A/B 门槛及负载样本集中在[基础契约 §7](foundation-contracts.md#7-诊断与性能验收预算b6)。这些是待测工程目标，不是历史实测结果；调整须记录测量和影响。业务提交/附件/输出恢复独立于诊断存储，日志不得成为恢复事实来源。
