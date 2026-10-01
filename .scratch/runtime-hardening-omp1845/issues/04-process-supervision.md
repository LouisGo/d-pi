# 04 真实进程故障验证与必要监督修复

Status: resolved
Blocked by: none

范围/授权见 [spec](../spec.md)，矩阵与推荐技术边界见 [design](../design.md)。关联 D-02/D-08/D-21/D-22/D-24/D-25/D-28；不引入全目录 lease、外部 CLI 锁或 adopt。

## 问题、样本与停止条件

当前 Host exit 不证明 Bun 及工具子进程退出；真实孤儿影响尚未复现。使用隔离目录/身份登记/本地 provider 和可观察写 heartbeat 的受管工具，保留真实 Electron utility/Bun/process 生命周期。只杀本 harness 的进程。

正常关闭、一个 Bun crash、Host SIGKILL、Main SIGKILL分别覆盖忙执行/待交互和一种后台活动；检查实际存活、最后写活动、收据/历史读状态与其它 Thread 的影响。增加 Main/SQLite 不可写时的停止样本。Renderer reload 复用既有正常包内验证。

若上述契约已满足，记录证据并补缺少的回归即可；若失败，按失败样本 TDD 修最小监督注册/bootstrap/失联清理，不把调查直接升级为通用管理器。需要平台独占或 OMP fork 才能成立时记录具体影响，仅暂停那部分。

## 资源与验收

- Main 对启动记录和最终清理负责，Host 对连接/spawn/正常 close 负责；需要新记录时只保存本次实例的非秘密 PID/出生/资源/token 身份，不凭 PID 单独强杀。
- 在确需握手加固时，注册许可之前不能加载项目可执行代码，启动竞争可证明；stale target/ready 丢失不制造新替代 session。
- pipe EOF、Host death、Bun exit、工具进程组覆盖分别有证据，不把连接错误或“发出 kill”当已停止。escaped/detached 子进程限制如实报告。
- 故障不改成 success；能保存的 ACK/结果保留，其余 unknown；实际进程 death 不推断所有文件回滚。
- 无窗口后台正常继续，单 Bun 故障隔离，Host death 才影响全部 scopes。长时间无输出仍可正常运行，不加 token 闲置 kill。
- S3 暂停队列放弃待决不被此票覆盖；停止及紧急清理不依赖 DB 可写，不能据此无确认丢弃队列。

01 为目标版本故障证据的交付前置，03 不是本票前置；可先建独立 harness。结束记录实测平台、样本、残留边界和采用/未采用的修复。

## Comments

2026-10-01：关键技术未知，尚无本轮真实 OS 崩溃结果；不以竞品事故冒充复现。

2026-10-01：实现与真实 macOS arm64 故障矩阵完成，使用已授权的官方 OMP 18.4.6 资源（唯一 SDK 导入修正由 01 维护）。证据与可重复入口为 [process-supervision.json](../evidence/process-supervision.json)、`node validation/s3/process-supervision.mjs`；fixture 经过实际 `RuntimeService → AppStorage/SQLite → HostConnection → Electron utility SessionHost → Bun SDK`，隔离目录、配置、provider、进程组，不使用真实凭据，不触碰用户运行实例。

- 真实红灯：原 NativeSession 正常 EOF/close 后原生父进程已死，继承进程组的工具 heartbeat 仍增长；使用 detached 受管组、启动身份登记与实际组退出确认后，原生及工具 PID 均无存活、heartbeat 停止。真实 Electron Main SIGKILL 又复现 SDK 先收到 EOF 自行 `process.exit`、工具继续写的窗口；bootstrap 将 SDK 的退出路径收束到本次受管组终止后绿。
- Main 发本次 scope/实例监督 token，Host 将实际 PID、父 PID、PGID、出生时间、可执行路径登记给 Main；Main 独立 `ps` 复核后许可，薄 bootstrap 获许可前不加载 SDK/扩展。拒绝登记的真实进程用例确认入口 sentinel 从未执行；Host/Main 消失和许可等待超时按实例清理，500ms 父进程检查不按业务输出或 token 空闲判断死亡。
- 单 Bun SIGKILL：A 忙本地扩展命令及继承工具终止，A ACK 与原文保留且未知执行结果保持 unknown，B scope 的 Bun 仍活、heartbeat 继续增长。Host SIGKILL：A 真实待答请求与 B 后台 heartbeat 均终止，未决交互不伪造成功。Main SIGKILL：两 scope 本次组均终止，重新启动实际 Electron/AppStorage 读取恢复，两 Thread inspect 保持 interrupted/只读，不追加旧会话、不自动重发。
- 正常 idle close 两 scope 均确认退出。模拟最终组清理失败的用例先复现 `closeIdle()` 提前成功，再修为等待实际 cleanup；失败拒绝关闭，重复关闭仍拒绝，不因 scope/Host 消失宣告 drained。`ps` 身份获取失败而 leader 仍活的危险分支先复现未经核实发 kill，再修为保守拒绝；不同出生身份的 PID 拒绝终止回归通过。
- SQLite `BEGIN IMMEDIATE` 真实 writer 锁建立后，草稿保存实际失败；本地 SSE provider 的真实 streaming 仍通过 `requestStop()` 到达 native `paused=true/stopping=false`，不需要 SQLite 写成功。已持久 ACK/正文仍可读，原生历史文件实际存在且逐行 JSON 可读。故障矩阵均检查前后收据身份、原文、已有 ACK/终态不丢；斜杠本地命令因 OMP lazy history 尚无文件，证据明确记 `absent-before-fault-lazy-local-command`，不冒称历史可读。

验证：7 个相关测试文件 73 tests 通过（NativeSession/SessionHost/Host scope multiplex/close failure/RuntimeService/进程身份/真实因果调度），全仓 TypeScript `--noEmit` 与修改文件 Biome 通过；最终全仓工程检查及包内 GUI 验证由主 Agent 统一整合，不将本票脚本通过当作用户体验认可。

边界：受管范围为本次 POSIX 进程组；自主 `setsid`/detached 或外部系统服务脱离该组不在覆盖内，未提供工具沙箱、外部 CLI 锁或 adopt。后台 heartbeat 来自真实 SDK 扩展启动的实际 Bun 子进程，但该子进程未计入 OMP async-job accounting，证据不冒称完整原生后台任务验证。采样确认排除僵尸态，`ps` 不可用/身份不符保留 unconfirmed；macOS arm64 已实测，未声称 Windows 支持或平台锁。正常无窗口后台活动保留，未加入无输出闲置终止。
