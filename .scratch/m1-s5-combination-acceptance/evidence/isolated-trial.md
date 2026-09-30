# 可操作隔离入口的原生检查

2026-09-30，运行 `node validation/s5/trial.mjs dist/s5-candidate/mac-arm64/d-pi.app --cold-reopen`，候选源码 `12dddfb3-86d5de15`。测试副本唯一 Bundle ID `local.d-pi.s5-trial`，App 数据、HOME/OMP 配置与会话、Git 全局配置和项目均由启动器隔离，未接触个人 d-pi 或供应商凭据。

通过 Computer Use 实际操作原生目录选择器（Go to Folder 指定输出的 `work`），看到默认“仅浏览”、三类 Git 来源与禁用发送；明确允许项目执行，再启动包内 OMP。原生键盘输入 `S5_WRITE` 后官方 SDK 调用真实 `write`，文件内容为 `S5 native tool fixture\n`；界面收到工具结果和 fixture 回复。继续提交 `S5_FAIL`，界面明确显示 OMP 失败及 `400 S5 isolated provider failure`。持久调用收据仍是 `acknowledged / unobserved`：没有把供应商错误或调用 ACK 伪装成已证明的业务结果归属。

保留 `S5_COLD_TRIAL_DRAFT`，Cmd+Q 正常退出；启动器只在首次退出 0 后用同一隔离环境重开一次。原生界面显示无法证明执行全周期独占、当前只读历史、发送禁用；草稿完整保留，Git/文件仍列出真实工具产物。再次 Cmd+Q 退出 0。两次启动总 localhost 请求为 3，冷重开从 3 到 3，无新执行。实际结果、持久草稿/收据/关联见 [JSON](isolated-trial.json)，终端见 [日志](isolated-trial.txt)。

此轮只补原生项目选择、试用入口的真实 write/失败和同环境正常冷重开；四类交互、排队/停止/继续及引用行为由组合包验证，不重复整个原生矩阵。Computer Use 的非 ASCII typeText 未完成中文/emoji 注入，原生粘贴也未产生预期替换；本轮用 ASCII 草稿完成持久化检查，不将工具尝试算作系统 IME 或粘贴通过。Unicode、CRLF/CR/LF 原文由实际 Electron/CDP 和自动化证据覆盖，系统输入法手感继续待用户试用。

完整退出后不能从 Finder 冷启动测试副本，因为会丢启动器的隔离环境；README 明确使用同环境 `--cold-reopen` 或重跑命令。仍在运行的进程关窗再激活维持原环境。生产候选未修改 Bundle ID，测试副本改动仅作用于临时副本。
