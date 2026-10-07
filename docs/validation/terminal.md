# 集成终端验证设计

日期：2026-10-07。这是 D-40/B 的实施验收设计，**没有终端实装或性能测量结果**。预算单源为[终端契约](../architecture/terminal.md#5-输出确认背压与预算)，任务和授权单源为[所属规格](../../.scratch/integrated-terminal/spec.md)。验收记录必须包含 commit/dirty、Electron/Node/node-pty/xterm 版本、机器/OS/架构、样本哈希、参数、原始数据和未覆盖项；不以官方源码阅读代替实测。

## 1. 必过门槛

以下任意失败均不交付为可用终端，不能用吞吐或评分抵消。按受影响路径验证，不逐票重跑全部矩阵；首段组合交付必须覆盖所有适用门槛。

| 门槛 | 证据与通过条件 |
| --- | --- |
| 准入与归属 | 仅浏览不 spawn；伪造 cwd/terminal/Host/attachment、外域或子 frame、旧许可和目录 identity 变化均拒绝；撤销 fence 后输入无副作用，清理未确认不显示已降级 |
| 输入一次派发 | 同代次重复 inputSeq 不重复写；ACK 只表示 PTY write；ACK 丢失、刷新、Host 崩溃不自动重放输入；create 重复不重复 spawn |
| 序号与屏幕一致 | 跨块 UTF-8、ANSI/宽字符/combining、颜色/光标/模式、normal/alternate screen、resize/output/exit 交错；同水位 snapshot 后增量的屏幕与连续消费相符，无重/缺；查询应答只有一个发送方 |
| 输出有界 | 慢/伪 ACK、无 ACK、Host parser 延迟、突发/在途输出均不越契约硬界；显示超限可重新 snapshot，parser 超限明确终止目标会话；缺口可见，无无限 Promise/端口/native 队列 |
| 生命周期 | 隐藏/卸载/关窗不结束 shell；刷新不重复 spawn；自然退出、显式 end、信任撤销、App 退出分别有真实资源核查；terminal-lost 不伪造恢复 shell |
| 清理范围 | 覆盖 shell、前台 job、新组后台 job、忽略 TERM 的已归属子进程、Host SIGKILL、Main 非正常结束、PID 复用；不误杀其他终端/OMP/外部进程；归属未知和逃逸 daemon 清楚报告范围 |
| OMP 隔离 | TerminalHost 崩溃、output overflow、close/revoke 不停止/重启 SessionHost 或 OMP，不改变收据/原生历史；两侧同时运行时输入/阅读仍可用 |
| 内容安全与诊断 | OSC52/恶意 title/链接不能授予剪贴板、URL/文件或 IPC 权限；用合成秘密 marker 核对默认诊断无输入/输出/快照/环境值，日志故障不妨碍业务与清理 |
| 原生与打包 | Dev 和脱离 checkout 的 macOS arm64 包均在实际 utility 加载 native PTY，shell、helper/动态库/许可及资源路径齐全；Node 测试通过不能代替此项；未签名不冒称签名/公证 |

对“无残留”只报告实际覆盖的受管组与已确认成员。逃逸外部进程的限制不降低已归属进程必须清理的门槛；无法核查时为 cleanup-pending，不按成功退出交付。Main 全部进程强杀/整机断电后的绝对清理保证不成立。

## 2. 性能样本与控制变量

性能工作验证 B 的预算与共享 Renderer，当前不继续泛化产品对比。固定同一 browser/headless xterm 版本与绘制配置、输出生成器/哈希、每会话尺寸/scrollback、信用/硬上限、窗口尺寸/主题、诊断配置、App/OMP 构建与机器。关闭 DevTools，采用生产 build/preview 测 JS 热路径；包另验证 native/资源差异。记录电源、后台节流、休眠和其他负载；不可测指标标 unavailable。

基线：同一 App 中终端未启动，但保持相同 Composer/Thread/OMP 确定性工作。负载组启用终端；每组预热后至少 5 次独立运行，随机交错顺序，报告所有运行及中位数、P95/P99、最大值和离散程度。每次至少 1000 个主页面输入事件，P99 不用少量点击估算；真实系统 IME另验，不混入合成事件时间。

| 样本 | 固定初始参数 | 要观察的故障/回落 |
| --- | --- | --- |
| 持续刷屏 | 80×24、160×48 两档；含换行 ASCII、ANSI、多字节中文；256 KiB/s 持续 10 min | 每队列水位、pause 时间与进度；停止输出后回落 |
| 超载与突发 | 尽可能快地产出 10 MiB、100 MiB 两档；单行和换行分别跑 | pause 后在途容量、snapshot 超限、资源故障与主页面响应；不要求超载无损完整 scrollback |
| 多终端 | 4 个 shell 各 128 KiB/s，1 个可见；切换前台每 10 s | 各会话公平性、无离线积压、总 CPU/RSS 与新建第 5 个明确拒绝 |
| OMP 同时运行 | 3 个 Thread 的确定性回放，工具 10 MiB 输出，同时跑持续与突发终端 | OMP 回执/阅读/控制不串身份，不因终端重启；最后再验一条真实固定 OMP本地路径，不要求计费网络请求 |
| 隐藏与重开 | 持续输出时隐藏 60 s、关窗/重开、刷新各 20 次 | shell PID 不变，snapshot正确，端口/DOM/监听/内存不逐次泄漏；前台恢复延迟 |
| 崩溃 | 输出中分别 shell exit、TerminalHost SIGKILL、Renderer crash、Main 故障 | 终态/尾部/清理范围，OMP 隔离；不能计为正常吞吐完成 |

样本脚本在对应实现票中创建，避免文档阶段先造未接入的 benchmark 平台。输出限额/速率是可复现输入，不是保证 shell 能以此速率完成。shell 阻塞时间与 PTY 实际读取速度分别报告，不把限流后的低 CPU 当吞吐优势。

## 3. 指标与初始通过阈值

| 指标 | 测量定义 | 初始目标（未实测） |
| --- | --- | --- |
| 主页面输入 P95/P99 | Composer key/input 被收到至对应内容下一次实际绘制；本地单调时间，不含模型网络 | P95 ≤50 ms，P99 ≤100 ms；相对同负载基线 P95 增量 ≤10 ms、P99 增量 ≤20 ms |
| Renderer 长任务 | PerformanceObserver longtask 与 trace 的 script/layout/paint，记录 >50 ms 的次数、最长、占比 | 常规持续/多终端样本中终端引起的单项任务 ≤100 ms、>50 ms 总时长 ≤观测时长 1%；超载样本不得出现 ≥500 ms 主页面无响应 |
| 输出吞吐 | PTY已读、headless已处理、已发、browser已处理四层 bytes/s，用户样本产量独立 | 常规速率在稳态无单调积压；不设脱离机器的“更快”结论 |
| 显示延迟 | fixture 中 marker 的 PTY到达→headless→write callback→实际显示，区分 parser与绘制 | 常规可见持续输出 P95 ≤100 ms、P99 ≤250 ms；前台重挂载首屏 P95 ≤500 ms（不含用户创建shell初始化） |
| CPU | Main/TerminalHost/Renderer/SessionHost/OMP/shell 全部进程；统一折算单核百分比 | 报告总量与分层；30 min 稳定样本不持续升高、不使常规样本拖慢 OMP/输入；具体机器CPU预算由首段基线记录后冻结 |
| RSS / GPU与native资源 | 同一进程树总量与各层，活跃/空闲、生成数据、快照临时副本分别记录 | 终端带来的 App进程增量（不含用户命令自身堆）≤256 MiB/4会话；总树仍须报告，不能隐去shell或OMP增长 |
| 积压与回落 | bytes/帧数、最老年龄、信用、pause累计、overflow/resync；停止生产后观察60 s | 硬界从不超；普通负载5 s内队列降到低水位；稳定屏幕缓存可保留但RSS不得持续上涨 |
| 重开与释放 | 20轮隐藏/刷新、结束并移除全部会话后观察60 s | 活跃资源回到预期数；首轮热身后释放RSS漂移≤20 MiB，无持续斜率；不要求V8/GPU立即归还全部RSS |

以上是初始工程目标，不能记成产品承诺或通过证据。CPU 先冻结真实机器预算，其余数值调整需保留原目标、数据、理由和影响；不得为了关闭票静默放宽。跨进程时间用 trace 的因果关系与校准后的时钟，不直接相减墙钟；显示测试用帧/截图或浏览器 tracing证明“已画”，write callback不当绘制证据。

## 4. 独立 Renderer 的升级条件

先定位共享页面的 xterm 解析/布局/绘制、React不必要订阅、fit回路和IPC积压，完成一次有证据的局部调度/批量/预算修正。若同固定样本至少3次仍越输入尾延迟/长任务门槛，且 tracing 将主要开销归到终端页面，或主页面崩溃暴露不可接受的终端显示共同故障域，再提出独立 Renderer 切片。首期不预建第二窗口、WebContentsView与跨视图焦点系统。

升级必须复用同一 xterm、PTY/输出样本和所有缓冲预算，保持 Main/TerminalHost 协议与生命周期，比较主页面输入、总CPU/RSS、显示延迟、积压及布局/焦点/IME成本。不能换库、扩大缓存后把改善归给独立 Renderer。Main/Host/native 卡顿或无界内存不靠独立 Renderer解决；安全/正确性门槛任何失败都先修复，不等待性能评分。

## 5. GUI 与交付证据

自动化覆盖协议、身份、权限负例、排队/信用、snapshot重放、故障注入与原生资源；真实 macOS 验中文 IME组合态/候选窗、Command+`、Ctrl+C、选区复制、bracketed paste、多行粘贴、拖动resize、light/dark、默认紧凑布局、VoiceOver和窗口重开。分别写自动化、Agent原生观察、用户试用结果，未测项目保持开放。

首段可用链路及时交付 Dev，不等所有增强完成；native ABI/asar/helper属于必须验证的打包差异，应另提供一次固定包证据。签名/公证需对应授权与实际产物；本次文档交付没有运行shell、真实账户请求、GUI试用或构建通过结论。
