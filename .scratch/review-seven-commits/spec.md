# 最近七提交全量审查与修复

2026-10-01。审查基线 `43544e5f5fb8e30d664f29e8f0a94e8ebedddec3..241365a044e460c65e9bbab3f9b26d1f5a43f0a6`，不随后续修复 commit 改变范围。

## 范围与完成口径

用户要求全量 review 最近七提交，只找高价值、可行动的问题，重点核对既定项目合同与固定参考实现；后续明确修复至准入、本地 commit，并给出下一阶段开启 prompt。沿用本地交付授权，不 push、不公开发布、不扩 M3；保留无关未跟踪 `bun.lock`。受影响决定为 D-03/D-04、D-21/D-22、D-24、D-30；无产品决定变更或新增重要待决。

审查含全部 201 个变动文件：生产源码、随包适配、工具与依赖、测试、规格/交接以及生成和历史证据。按配置、运行时、工作台三个独立视角核查，再由主审重现、整合；历史证据按其构建身份判断，不把 M2 尚未实现的附件、完整队列/子 Agent 和长负载验收凑成此次缺陷。

| commit | 内容 |
| --- | --- |
| `4d294e0` | OMP 加固计划与授权 |
| `24f086e` | OMP 18.4.6、结果、监督及资源实现 |
| `c87217d` | 加固候选交接 |
| `0243e4a` | 原生 WAL 登录与缓存模型共享 |
| `77385a7` | 配置共享候选交接 |
| `43d144a` | 只读出口、CLI 历史、草稿编辑 |
| `241365a` | 进度和实际 m2.8 反馈核对 |

## 高价值发现及修复

### 1. ACK 后新鲜 idle 提前释放缺失终态的提交（P1，规范与规格）

Main 的 settleIdleSubmissions 将 acknowledged/unobserved 视为可释放，Host 也只要求所有关联已回应 ACK。这允许 RPC ACK → idle → prompt_result 尚未送达时回收 scope；若原生进程随后崩溃，提交已离开 Main 的 executingIds，缺失结果保持 unobserved 而非 unknown。固定 OMP 18.4.6 的 `rpc-prompt-results.ts` 通过 setImmediate 独立发送终态，ACK/idle 并不证明终态到达。

违反 [加固设计 §5](../runtime-hardening-omp1845/design.md#5-提交与原生结果)和[执行合同](../../docs/architecture/modules/execution.md)。修复 Main 仅按终态释放；Host 在精确终态持久确认前保留 prompts，禁止 idle-confirmed/close-idle。Main 迟到持久确认后 Host 主动重采 idle，避免正确完成后被永久占用。崩溃保留 ACK、冻结原文及 unknown，不重发。

### 2. Runtime 退出绕过断开后的进程组清理（P1，规范与规格）

HostConnection.closeIdle 已等待并校验 cleanup，但 RuntimeService.closeIdle 在 disconnected 时提前返回。App will-quit 只等待 Runtime 层，故 Host 崩溃后的残留工具清理尚未完成或失败时，仍可宣告 drained 并退出。局部 HostConnection 测试通过没有覆盖该装配路径。

违反 [04 进程监督票](../runtime-hardening-omp1845/issues/04-process-supervision.md)的最终清理合同。移除 Runtime 提前返回，保留 active-work 拒绝；断开也等待最终清理，失败及重复关闭继续拒绝。

### 3. CLI 历史显式刷新无法脱离旧分页版本（P2，规格）

第二页使用包含 inode/size/mtime/ctime 的游标；CLI 继续写该文件后，Main 正确拒绝旧游标。GUI Refresh 却 refetch 同一游标，持续 changed，用户不能恢复阅读最新内容。

违反已接入的[显式刷新/分页目标](../m2-first-release/mainflow-feedback.md#本次修复范围)。Refresh 在非首页清空 cursor，使 Query 重采首页版本；首页直接 refetch。重采可能暂显缓存首页，此时 Next 禁用至新版本返回，避免旧游标再次进入请求；延迟真实读取的回归已复现该竞态。保留 Main 来源/版本校验，不接管原生执行。

### 4. 官方拒收缓存行，摘要仍宣称完整覆盖（P2，规范与规格）

源 SQLite 列结构有效，但 models JSON 损坏、版本或 materialization policy 不兼容时，官方代码删除私有副本中的行。原适配未观察拒收结果，CLI 专属模型消失但 coverage=complete/issues=[]，诊断继续报成功。

违反[配置合同](../../docs/architecture/modules/configuration.md)与[共享配置边界](../m2-first-release/configuration-sharing.md#修复与验证边界)。源 provider 集合与 serialize 在同一 readonly 事务中取得；官方目录组合后仅观察副本剩余集合，拒收返回 partial / catalog-cache-rejected，认证保持独立。官方兼容/解析策略保持唯一所有者，不修改源库。不额外承诺未知、未消费 provider 的 payload 均有效。

## 验证记录

锁定 Node 24.21.0 / pnpm 12.8.1 / Electron 44.4.5 / Bun 1.3.14 / OMP 18.4.6。修改前完整 check 458 通过、1 项既有 opt-in CLI artifact 跳过；当前环境与 42/42 精确依赖核验通过。

- 新行为测试先红：ACK/idle 及崩溃、Runtime 断开清理成功/失败、Host 延迟终态和历史刷新共 6 个预期失败；修复后相关三文件 48 项通过。
- 实际固定 SDK 写入有效缓存，再分别破坏 JSON/policy/version，修复前 complete 断言红灯；修复后 partial、有界原因、CLI 专属模型缺失和认证仍有效全部通过。
- 源模型/凭据/设置字节与权限保持；live WAL 用例保留严格哈希/权限断言。新闭库异常用例允许 SQLite 管理 WAL/SHM 协调权限，仍比较 WAL 字节和源文件权限。
- [行为红灯](evidence/behavior-red.txt)、[行为绿灯](evidence/behavior-green.txt)、[缓存红灯](evidence/cache-red.txt)、[缓存绿灯](evidence/cache-green.txt)。
- 完整检查揭示三项旧测试将 ACK/idle 误当终态；已改为精确 terminal 后才结算，缺终态断链为 unknown。增补刷新期间 Next 禁用的确定性回归，相关三文件 [32 项通过](evidence/followup-green.txt)。

当前 [pnpm check](evidence/check.txt) 退出 0：464 Vitest、32 架构、47 工具测试通过，1 项既有 opt-in CLI artifact 跳过；全部类型、Biome、设计/i18n、文档、结构和状态门禁通过，未降低规则。[实际 SDK](evidence/sdk.txt)四组验证、[只读配置](evidence/readonly.json)13 场景、[随包配置适配](evidence/sharing.json)双向共享及三类缓存拒收全部通过，真实供应商请求为 0。

[pnpm build](evidence/build.txt)通过；既有大 chunk 提示保留，不从构建推导性能验收。用户认可仍 pending；真实供应商生成、完整系统 IME 与 M2 全集验收不由工程检查替代。

## Clean 修复构建与完成

修复 commit `18a6ef6a7c722e896c6ae267f19100fee2709119`。在隔离 clean checkout 冻结离线安装，`pnpm package:mac` 和完整环境核验通过，[打包](evidence/package-build.txt)、[环境](evidence/environment.txt)。构建身份 `0.1.0-m2.9 / 18a6ef6a-10ca9182`，dirty=false；非签名/公证的本地 arm64 review 候选。

实际包内 Electron/Bun/OMP 的[八场景闭环](evidence/package-result.json)及[执行日志](evidence/package.txt)通过：双 scope 并行与模型/档位/消息/草稿隔离、编辑中段选区/撤销恢复、Chromium 组合事件、Renderer 重连无重发、最终原生文字与阅读位置、输入/发送可达、冷旧会话只读及新建独立 Thread 出口。供应商仅 localhost 两次请求，系统输入源未覆盖。[并行截图](evidence/m2-parallel-entry.png)、[冷恢复后的独立新建截图](evidence/m2-cold-new-thread.png)。

直接使用该 app 内 SDK 的[配置验证](evidence/package-sharing.json)也全部通过，包括三类官方缓存拒收；没有仅验证仓库 source。候选保存在仓库 `dist/review-seven-18a6ef6/mac-arm64/d-pi.app`，App asar SHA-256 为 `848e2230939f1262a1cd92e4216122da7551f7dab82db5495c92f6fd44e1c428`；复制后 asar、SDK manifest、Bun 与所有薄适配哈希一致，[保留身份](evidence/artifact.json)。临时验证 checkout 已完成使命，保留包后可归档。

本轮 review 与四类缺陷修复达到工程准入；不再保留已证实而未修复的高价值发现。该候选供下一阶段实际试用验收，当前产品交付/反馈身份仍由 [M2 spec](../m2-first-release/spec.md)维护；本次工程通过不推断用户认可，也不把原 m2.9 启动失败的 unknown 改成已查明。

## 原 m2.9 启动失败的独立核对

对原 clean `43d144a` 的 m2.9 包复跑现有隔离 harness，8 条实际 Electron/Bun/SDK 路径通过，[结果](evidence/prior-m2.9-rerun.json)。原失败这次未复现，根因仍 unknown；不把上述四项修复冒称为该启动故障的根因。原始[失败记录](../m2-first-release/progress-audit.md#本轮本地修改与交付边界)保留。该结果是确定性 localhost provider 闭环，未向个人账户/付费供应商发请求。

## 下一阶段开启 prompt

继续 M2 已承诺基础主流程的实际试用验收：从冷只读首页验证新会话出口、模型/档位回填、Shift+Enter 与 CLI 历史刷新，遇到问题先复现再修复。以本次 clean 修复候选和当前规格为准，保留 unknown 不重发及冷恢复只读，不提前展开附件、完整队列/子 Agent 或 M3；工程通过与用户认可分别记录。
