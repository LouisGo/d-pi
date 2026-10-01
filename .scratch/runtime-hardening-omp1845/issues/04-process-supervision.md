# 04 真实进程故障验证与必要监督修复

Status: open
Blocked by: 01

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
