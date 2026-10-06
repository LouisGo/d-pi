# M2 附件与子 Agent 生命周期交接

2026-10-06。本段 [04b](issues/04b-attachment-lifecycle.md)、[05d](issues/05d-subagent-observation.md)、[06b](issues/06b-lifecycle-candidate.md)工程完成，clean `0.1.0-m2.14 / c5e424da-f02704bc` 本地 macOS arm64 候选交付待试用。M2 整体 engineering in-progress / trial delivered / acceptance pending；父04/05/06继续维护未完成范围。

## 本段结果

附件原件与派生内容有权威引用核对、最后释放时间、七天延迟自动回收及显式清理。持久草稿、冻结提交（含 unknown / 终态）、队列修改历史与迟到导入来源继续受保护；未证明原生历史已自行持久化，不据终态释放冻结内容。正式“附件与存储”入口可检查/清理，丢失或损坏原件保留输入并要求重新附加；派生准备失败允许重试。清理仅作用于确认无引用的私有缓存。

子 Agent 观察沿用 OMP 原生身份、事件、活动注册与 RPC transcript，显示任务、状态、可得结果和覆盖限制。同名任务彼此隔离，单个任务完成不使同伴或主提交提前完成。重连、重复与迟到事件不触发执行重放；观察桥接不形成执行调度器。Host 重启后已结束且不在原生活动快照中的任务不能宣称完整恢复，冷旧 Thread 保持只读。

主进程启动有界维护并在退出前 drain，失败使用窄诊断信号。引用修复/计数为投影，删除前仍在 SQLite 写锁下复核 epoch 与真实 owner，保留崩溃窗口的幂等恢复。UI 入口沿用共享 token / 折叠组织，默认阅读区实测 101.53125 px，输入和发送在窗口内。

## 候选与验证

| 项目 | 精确身份或结果 |
| --- | --- |
| main 基点 | `c8dbdbadf1a04ad2be54e01f1a509024c5d982ea`（已合并工作流 PR #1） |
| 本地分支 | `codex/m2-lifecycle`，本轮未 push / 创建远端 PR |
| 产品源码 | `c5e424da02245ed854c9ba3af514087826b6cc24` |
| 包内构建 | `0.1.0-m2.14 / c5e424da-f02704bc`，`dirty=false`；从实际包 Main 记录读取 |
| App | `dist/lifecycle-m2.14-clean/mac-arm64/d-pi.app` |
| ZIP | `dist/candidates/d-pi-0.1.0-m2.14-c5e424d-mac-arm64.zip`，430,090,644 bytes |
| ZIP SHA-256 | `c0c192d94842c3fedec1c25a55d704ed00f511077b0ba7734130ae72cfc98afc` |
| app.asar SHA-256 | `abae2825dc399b7e1f526d01164fc9d099bc1677a41b9cc6ef6656a5cfb15a19`；实际验证包与 ZIP 解压文件一致 |
| 完整工程 | `pnpm check`：691 行为 / 34 架构 / 70 tooling 通过，1 项既有 opt-in 跳过；六类型入口与 lint/设计/i18n/文档/结构/状态通过 |
| 构建与 SDK | `pnpm build` / `pnpm runtime:sdk` 通过；固定 OMP 18.4.6、112 dependency units |
| 独立评审 | [Spec / Standards](lifecycle-review.md)最终固定 c5e424d 无未解决高价值问题 |
| 实际包内检查 | 22 项通过，ZIP CRC 通过；[完整结果](evidence/lifecycle-package-result.json)、[哈希与门禁摘要](evidence/lifecycle-candidate.json) |

环境已按仓库要求对齐默认 Node 24.21.0、pnpm 12.8.1；Electron 44.4.5 / Bun 1.3.14 沿用固定资源。后续提交仅补验证脚本、证据与管理文档，候选仍准确对应上述产品 source commit。

```sh
node validation/m2/package.mjs dist/lifecycle-m2.14-clean/mac-arm64/d-pi.app --attachments --queue-subagent --continuity --lifecycle
```

隔离 HOME、OMP 配置、App 数据、Git、项目与网络，仅 localhost fixture supplier，无个人认证/费用。实际包以固定原生 SDK 执行 task / yield：主流程2次、子 Agent/父执行4次、辅助标题2次，合计8次本地请求。不同任务同名 agent 独立，A/B切换与 Renderer reload 不重放；完成结果选择结构化 yield data。自动回收用测试对象老化8天并冷重启，未调用清理命令；快速采用/移除发生在首次扫描之前。

另有独立真实固定 SDK RPC 验证：1 test / 13 assertions，通过同名双任务、终态 transcript、原生活动注册移除。工程测试覆盖采样间重新引用、unknown / 冻结、同摘要迟到导入、原件/派生释放、来源预算、旧 manifest 异步发布、维护失败/退出与 nullable yield。崩溃恢复证据为持久状态窗口 fixture，未模拟实际断电。Chromium composition 由包内验证，新系统输入法矩阵本轮未运行。真实个人供应商、签名、公证和用户认可未完成。

原始本机日志与截图保存在 `dist/validation/m2-lifecycle/`；可移交的检查/构建/SDK/包内输出与六张关键截图已纳入 `evidence/lifecycle-*`。首个74px布局失败、误计标题请求与补截图的禁用按钮时序超时均保留，原因和修复见评审记录。产品最终包两次22项通过；最后一轮包含可见子 Agent 截图。

## 试用步骤

1. 解压上述 ZIP，启动后核对侧栏 `0.1.0-m2.14 / c5e424da-f02704bc`。这是未签名/未公证的本地候选；首次载入前保留现有 App 数据与私有内容副本。自动化从隔离目录运行，不修改个人配置。
2. 选择项目、新 Thread，导入文件/图片，在“附件与存储”执行检查；删除草稿引用后清理。仍在草稿、冻结提交或队列历史中的内容应保留，释放对象可回收。原件故障应明确提示重新附加，草稿不能丢失；PDF当前仅显式文字表示并标明覆盖缺口。
3. 使用你已有授权配置发起适合委派的任务，观察同名子 Agent 的独立状态/结果，切换 Thread 或刷新 Renderer 后核对身份与结果，不重复发送。必要时使用“专注阅读”查看卡片，完成后“恢复控件”。本轮 Agent 没有使用真实账户执行此步骤。
4. 退出再打开：旧 Thread 保持内容可读与执行只读；新建独立 Thread 继续工作。不要把此出口视为恢复旧任务执行。

## 数据与后续边界

schema 9 在迁移前生成 `drafts.sqlite.before-v9`（具体位置以 App 数据根为准），新增对象 inventory / epoch。单 owner 2MiB、manifest 64KiB、每批 owner 128 / 对象与 manifest 32、I/O 32MiB；超预算或损坏数据保守拒删并显示未完成，后续可续检。未知文件名与未发布临时文件保留，不承诺回收所有磁盘内容。

数据库迁移不能靠 git revert 回滚；旧代码未必识别新 schema。需要关闭 App 后使用升级前数据库与配套私有内容副本回退，恢复数据库备份不能找回已清理对象。清理删除无引用私有文件是 one-way；SQLite 与文件系统不具跨系统原子提交，已验证重入窗口。OMP 执行/历史、unknown 不自动重发、冷恢复只读与退出放弃待决保持。

接下来按所属票核实 PDF 完整视觉/OCR表示与覆盖，以及余下 M2 队列/子 Agent/长输出/故障组合验收；真实供应商试用与用户认可仍 pending。上述事项未因此标为完成，M3 不在当前授权范围。无新增产品待决。
