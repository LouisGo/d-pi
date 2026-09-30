# S5 隔离试用

先按根 README 准备固定工具与 `dist/s5-candidate/mac-arm64/d-pi.app` 候选。此入口不读取个人凭据，不接真实供应商；本地 fixture 只提供确定的协议响应，工具、交互、队列和历史仍由包内官方 OMP SDK 执行。

```sh
node validation/s5/trial.mjs dist/s5-candidate/mac-arm64/d-pi.app --cold-reopen
```

命令输出临时项目、App 数据、OMP 配置与测试副本路径；保持终端运行。在应用中选择输出的 `project` 路径并创建草稿：

1. 保持“仅浏览”，查看 `sample.ts` 与 Git 的 HEAD→暂存区、暂存区→工作区、未跟踪三类来源；任选一侧附选区，核对路径/来源/原文。
2. 允许项目执行，启动 OMP，发送 `S5_WRITE`。固定 fixture 要求原生 `write` 写出 `native-evidence.txt`；读取原生记录，核对工具 ID/记录 ID/结果和 Git 当前差异各自的来源。
3. 空闲后发送 `/s5ask`，回答 confirm/select/input/editor。可在待答时关闭窗口再从测试副本重新激活，核对同一问题仍可操作、草稿保留。
4. 发送 `S5_HOLD` 保持执行，忙碌时排队发送 `S5_NEXT`。停止应保留并暂停队列；关窗重开后点击“明确继续”，后项才消费。
5. 队列清空且空闲后，可选发送 `S5_FAIL`，观察原生失败反馈，调用 ACK 不因此变成业务完成。随后正常退出，脚本在同一隔离环境自动重开一次：旧 Thread 的恢复仍只读；检查草稿、历史与文件后再次正常退出，不能自动恢复执行或自动重发 unknown。

暂停非空队列当前没有放弃后退出出口，不愿继续执行剩余输入时，这条退出路径仍待产品决定。本入口没有绕过退出策略。系统 IME、真实供应商、用户体验认可与签名/公证未由 fixture 证明。

退出保留临时目录，便于复查草稿/日志/历史；每次重跑都创建新的隔离环境。测试副本只修改 Bundle ID 为 `local.d-pi.s5-trial`，与正在运行的个人 d-pi 分开，正式候选的 Bundle ID、asar 和 SDK 不改。完整退出后不要从 Finder 冷启动测试副本，以免丢失启动器提供的隔离环境；用 `--cold-reopen` 或重跑命令。仍在运行时关窗再激活不改变进程环境。

自动组合回归另用已有打包 harness：

```sh
node validation/s3/package.mjs dist/s5-candidate/mac-arm64/d-pi.app --s5
```

`--inspect` 可在正常流程完成后暂停至输出的检查点，供少量原生/视觉检查；创建同目录的 `inspect-continue` 文件后，脚本重新连接并继续 unknown/只读冷恢复检查。具体构建与本轮结果以 S5 所属交接为准。
