# S5 M1 组合交付

2026-09-30。当前授权工程范围完成，`0.1.0-s5.0` 交付待试用，用户认可待定。状态单源为 [spec](spec.md)，场景与实际覆盖见 [验收证据](evidence/acceptance.md)。不 push、不公开发布，不进入 M2。

## 候选身份

本地 macOS arm64 候选：`/Users/lou/Learn/d-pi/dist/s5-candidate/mac-arm64/d-pi.app`。

- 构建源为干净 `4b003e843e1c874d2eb951118b2f2c614927ffda`，build ID `4b003e84-4c6aa4ad`，版本 `0.1.0-s5.0`。后续提交仅收录验证脚本/证据/状态，未改变候选生产代码。
- App asar SHA-256 `cabe4673763a3882b5ef79a36595ecd31ec480e96ce88040af8ea5950f20d444`；Main `e5d1b449a0fe578f39bc2f9c11668bdd20d6d8d0449eb2015b76400ea750c62f`；SDK manifest `40eddef35060706769733cbdc0c04e49fd42af985f95d6680072bb66099752ff`。完整 [artifact](evidence/final-artifact.json)、[构建](evidence/final-package.txt)、[包内 SDK](evidence/final-sdk.txt)可核对。
- 固定 Node 24.21.0 / pnpm 10.5.2，Electron 44.4.5，OMP SDK 18.3.0 / Bun 1.3.14。未升级 SDK。候选未签名/公证，使用默认 Electron 图标；现有 Zod 注释与大 chunk 构建提示保留，未为数字重做分包。

## 本轮补修与检查

修复普通提交列表丢失持久拒绝原因、同字节文件/Diff 新来源仍捕获旧来源两项真实缺陷。先失败测试再最小修复，保持 ACK、outcome、冻结原文和后来草稿。S5 显示标记同步，未新增执行/权限/数据合同。

[完整 check](evidence/check.txt)通过：399 Vitest、1 CLI opt-in 跳过，架构 32、tooling 40，六类型入口和各 lint/文档/结构检查。高风险修复 [独立冻结审阅](evidence/frozen-review.md)无可行动缺陷、独立 34 项通过；[验证入口审阅](evidence/harness-review.md)两项问题关闭，最终样本复核无新增问题。

[最终候选组合](evidence/final-s5-result.json)及 [运行日志](evidence/final-combination.txt)18 项通过、退出 0：真实 OMP 工具与四类交互、队列保留/停止/明确继续、原文与引用来源、ACK 后中断/unknown、无重发和只读冷恢复。原生关窗重开及 [人工隔离试用入口](evidence/isolated-trial.md)另有实际 Computer Use 证据；前构建与最终构建的生产差异只有 S5 显示标记，未借前构建证明新行为。fixture 不证明真实供应商或系统 IME。

## 操作试用

在仓库根目录保持终端运行；本机固定工具位置可直接使用：

```sh
export PATH=/private/tmp/d-pi-rewrite-toolchain/node-v24.21.0-darwin-arm64/bin:$PATH
node validation/s5/trial.mjs dist/s5-candidate/mac-arm64/d-pi.app --cold-reopen
```

启动器输出隔离项目 `project` 路径，使用该路径，不打开个人项目。完整步骤单源见 [试用 README](../../validation/s5/README.md)：

1. 选择项目并创建草稿，默认仅浏览。查看文件及 HEAD→暂存区、暂存区→工作区、未跟踪，选择一侧附入输入并核对来源/原文。
2. 允许项目执行，启动 OMP；发送 `S5_WRITE` 读取真实工具结果、`native-evidence.txt` 与 Git 当前差异。
3. 空闲后发送 `/s5ask` 回答四类交互；待答时可关窗再激活这个仍在运行的测试副本，检查问题与草稿。
4. 发送 `S5_HOLD`，忙碌时排队 `S5_NEXT`，停止后保留并暂缓；关窗重开后“明确继续”才消费后项。
5. 队列清空后可选 `S5_FAIL` 查看原生失败，再正常退出。启动器在同一隔离环境冷重开一次；旧 Thread 只读，核对草稿/历史/文件后再次正常退出。

完整退出后不要从 Finder 冷启动测试副本，因为会丢启动器的隔离环境；用 `--cold-reopen` 或重新运行命令。测试副本仅改临时 Bundle ID 为 `local.d-pi.s5-trial`，正式候选不改，与个人 d-pi 分开。退出保留临时证据，每次重跑创建新环境。

## 本地分批提交

| SHA | 范围 |
| --- | --- |
| `fae6c52c5e3515e653ea31a0e69cfc8f6b611479` | S5 授权规格、最近任务、当前工作与生成看板 |
| `12dddfb36546d52d43d4f2c77526626cfd1093ef` | 两项 TDD 补修、定向/完整检查、冻结审阅与验证入口 |
| `4b003e843e1c874d2eb951118b2f2c614927ffda` | 实际包组合/原生/隔离冷试用证据、入口补修与 S5 显示标记；最终候选构建源 |

交接自己的最终提交 SHA 以 Git 和最终答复为准，避免自引用循环。没有 push 或公开发布。

## 未关闭与影响

- [S3 09](../m1-s3-control-recovery/issues/09-quit-discard-decision.md)仍待决。暂停非空队列没有放弃后退出出口，不愿继续执行剩余输入时完整退出验收不能关闭；没有擅自清队列或改变退出策略。
- 冷恢复无执行全周期单写证明，继续只读。unknown 不自动重发；不能直接从旧 Thread 恢复执行，不新建替代会话掩盖失败。
- 没有真实供应商授权，仅 localhost fixture；系统中文输入法/原生 Unicode 粘贴、个人扩展、完整长输出/磁盘满固定负载、签名/公证与用户体验认可未完成。不宣称效率提升或完整 OMP TUI 承接。
- 既有交互硬化 [03](../m1-interaction-hardening/issues/03-dispatch-authorization.md)、[04](../m1-interaction-hardening/issues/04-history-busy.md)、[07](../m1-interaction-hardening/issues/07-quit-a11y.md)仍 open。前两项含撤回误报和待证实影响，07 含退出超时/重试与可访问补齐；本轮没有逐项关闭这些历史审计票，也不把旧 P0 标签当当前缺陷证明。正常组合与已覆盖因果回归通过，不代表 Host TOCTOU、全部 busy/退出/焦点变体验收通过。S1–S4 及状态/查询切片的用户试用状态不被本轮 Agent 验证改写。

工程、交付、认可分别记录。当前授权工作完成后停止，等待用户试用反馈，不自动进入 M2/M3。
