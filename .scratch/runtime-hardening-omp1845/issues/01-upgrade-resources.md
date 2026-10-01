# 01 固定 SDK 18.4.6 与随包资源一致性

Status: resolved
Blocked by: none

范围/授权见 [spec](../spec.md)，具体步骤见 [upgrade](../upgrade.md)。关联 D-02/D-03/D-21/D-28，补 G1 升级兼容与 M2 本地包，不改原生执行所有权。

## 目标与落点

coding-agent/utils 精确 18.4.6，官方原样依赖闭包，Bun 暂沿用 1.3.14。修改 package/lock、prepare-sdk、资源/环境校验及相应测试；保留用户 packageManager 修改。Host.mjs 只做必要新版 API 兼容，full 消息模式保留。

Main 负责资源切换时无活跃使用者；脚本拥有 staging/原子替换，失败保留旧完整资源；Host 不写用户配置或自动下载修复。生产与测试入口不得混用全局 CLI。

## 验收

- 先失败：已有旧包 link 时升级后实际 resolve 和 package metadata 必须为 18.4.6；manifest 声称新版而实际旧版会拒绝启动。
- 空目录准备、旧资源升级、连续两次准备、复制失败四种外部结果有意义地验证；不只比较打印的版本字符串。
- 官方 npm imports、两个消费前 hooks、真实 SDK stop/continue 与 ACK 后失败在隔离 provider 下通过；新版协议断言按原生含义调整。
- 旧录制回归、新 SDK 录制、平台/native addon/许可证与干净包资源身份明确；未启动真实账户调用。

本票完成不表示 02/03/04 功能已经完成，不开放冷写恢复；官方 API/打包失败按 upgrade 的停止条件记录具体限制。

## Comments

2026-10-01：审阅准备，未领取、未替换资源。

## Answer

2026-10-01：按用户后续授权完成精确 18.4.6/Bun 1.3.14，保留 packageManager 12.8.1。staging 完成锁定闭包、六个 launcher 哈希、SDK 唯一导入修正哈希和真实 import 后原子替换；失败保留旧完整资源，活跃资源使用者拒绝替换。运行时同时核对 coding-agent/utils 实际包名、版本和资源内真实入口，manifest 字符串不能掩盖旧包。唯一源码修正先核对原文件 `97fc3bb3...`，补丁 `a3c4976059...`；安装源保持原样。

准备脚本真实子进程回归 3/3（旧 link、重复、空根/失败保留、变更源/活跃使用）；运行资源测试通过 metadata 错配、launcher 与 sdk.ts 独立篡改拒绝。`pnpm validate:sdk` 目标随包真实 stop/continue、ACK 后失败、prompt outcomes、原生关联/settled 四脚本全部通过；保留原18.3录制。两版官方 integrity 与本地 import 缺陷、用户授权及哈希见 [SDK package audit](../evidence/sdk-package-audit.json)。完整工程门禁及最终干净包由06记录。本票不证明真实个人供应商、个人扩展或冷写恢复；旧18.3.0候选保留用于独立回退对照，不把 schema6 数据自动交旧版写入。

2026-10-01 整合复核补修：原单次 ps 检查不能覆盖 Main 校验完成至 spawn 的竞争，真实 Node 子进程先验证资源并等待，旧 prepare 仍成功替换（红）。现由 Main 首次校验前与 prepare 共用外部私有 SQLite 独占资源守卫，Main 进程生命周期持有，prepare 全流程 finally 释放；不同 HOME/TMPDIR、只读资源目录、Main SIGKILL 后内核释放，以及 prepare 持锁时拒绝首次校验均已真实子进程验证。prepare 回归现为 4/4，environment 为 4/4，运行资源测试通过，类型与架构门禁通过。持有者需要关闭 App 后重新准备；锁库不在运行中 unlink，临时资源根会留下小型锁库，离线清理边界见 [维护合同](../../../docs/engineering/omp-maintenance.md#资源失败与兼容边界)。

同批修正 Node/Electron 的 import-only exports 校验：官方包只有 import 条件，原 createRequire.resolve 在真实 Node 错报不可用。import-only fixture 先红后绿；按两个固定官方 exports 映射及真实 src/sdk.ts/src/index.ts 校核，真实 Node 对当前 18.4.6 resources 的 inspectSdk issues=[]。没有创建通用 resolver，也未导入或执行用户配置。

2026-10-01 整合复核：真实 Node/Electron 按 import-only exports 校验入口；资源发布和 Main 从验证到 spawn 使用同一资源根互斥，双向竞争、跨HOME/TMPDIR、只读资源目录及Main SIGKILL后再准备回归均已通过。单次 ps 使用者快照不作为互斥证明。
