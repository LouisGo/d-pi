## Summary

持久草稿和冻结提交仍引用的附件不能被清理，释放后的私有内容也需要能够安全回收。本段新增 schema 9 inventory / epoch、权威引用检查、最后释放时钟、七天自动回收和正式检查/清理入口；故障明确指出原件/派生问题并保留输入。删除前在写锁内复核 epoch 与 owner，unknown、终态冻结及队列修改历史继续保留。

原生子 Agent 通过固定 SDK 的活动注册、事件和 RPC transcript 投影任务/状态/可得结果；同名任务独立，切换与重连不重放，不提前完成主提交，不增加执行调度器。附件维护在 Main 退出前 drain。范围见 [spec](spec.md#2026-10-06-生命周期切片)、[04b](issues/04b-attachment-lifecycle.md)、[05d](issues/05d-subagent-observation.md)、[06b](issues/06b-lifecycle-candidate.md)。

## Evidence

- 真实 base / merge-base `c8dbdbadf1a04ad2be54e01f1a509024c5d982ea`；最终产品源码 `c5e424da02245ed854c9ba3af514087826b6cc24`。分支 `codex/m2-lifecycle`；此文件为本地 body，后续证据/管理提交不改变候选源码。
- `pnpm check`：691 行为、34 架构、70 tooling 通过，1 项既有 opt-in 跳过；六类型入口、lint/设计/i18n/文档/结构/状态通过。`pnpm build`、固定 OMP 18.4.6 的112 dependency units 准备通过。
- 实际 red→green 覆盖最后释放采样空隙、迟到同摘要 lease、采用后立即移除、旧 manifest 并发发布、nullable/结构化 yield、维护信号与退出 drain；普通文字保存消除全附件库存扫描。布局依据是首个实际包74px失败，最终101.53125px通过；不把异步 DOM 断言时序当布局红灯。
- 两名独立 reviewer 固定同 head 完成 Spec / Standards，发现均修复并独立复核，无未解决高价值问题；Spec隔离51/51，Standards来源预算/采用事实/性能独立探针通过。见 [评审](lifecycle-review.md)。reviewer 未独立重跑最终 macOS 包，根完成验收。
- clean `0.1.0-m2.14 / c5e424da-f02704bc` 两轮实际 macOS包内22项通过；最终包含可见同名子 Agent 卡片/结构化结果、Thread/Renderer重连、冻结附件保护、自动七天回收与冷旧只读。固定原生 SDK RPC另有1 test /13 assertions通过。仅隔离 localhost供应商，无真实凭据/费用；新增系统输入法与实际断电未验证。
- ZIP CRC、实际包与解压 app.asar SHA-256一致；[候选/试用/限制](lifecycle.md)、[机器证据](evidence/lifecycle-candidate.json)、[包内结果](evidence/lifecycle-package-result.json)。补截图时禁用删除按钮的harness超时已核实为未发出操作，补等待按钮可用后原断言通过，现场保留。

## Merge Danger

Door：代码/观察UI可回退；schema迁移及私有文件清理包含 one-way 效果。schema9迁移保存 before-v9数据库备份，库存计数是修复投影而非删除授权，删除前仍复核当前事实。垃圾回收只删除确认无引用私有内容，冻结与unknown不自动释放。

Blast radius：App SQLite、私有附件原件/派生库存、Main维护/退出、SessionHost观察与Renderer展示；OMP执行/工具/队列/历史所有权保持，冷旧Thread继续只读。损坏/超预算保守拒删，未知临时文件保留。

Rollback：关闭App后使用升级前数据库与配套私有内容副本，再切换兼容源码。单纯git revert不能降级schema，单独数据库备份不能恢复已清理的文件；SQLite与文件系统并非跨系统原子事务，重入窗口已验证。候选未签名/未公证，仅本地交付；远端CI未运行，本轮无远端PR。PDF视觉/OCR、余下M2组合验收与真实供应商试用保持开放，merge与工程通过都不代表用户认可。
