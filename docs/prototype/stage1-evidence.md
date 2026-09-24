# 阶段 1 运行证据与限制

日期：2026-09-24；本机 macOS arm64，Electron 44.4.5，OMP 18.3.0，真实已配置模型 `openai-codex/gpt-6-sol`。测试项目为一次性目录 `/private/tmp/d-pi-stage1-e2e`。下面区分协议实验与可见 GUI 实验；协议实验使用 localhost 固定模型，不能代替真实模型验收。

## 实现与构建

- `src/main`、`src/host`、`src/preload`、`src/renderer` 分别承担应用生命周期、utility SessionHost、受限桥接和 GUI；正式连接为 `omp --mode rpc-ui --no-title`，并协商 RPC v2。
- `pnpm typecheck` 通过；`pnpm test` 为 1 文件、3 项协议帧测试通过；`pnpm pack:mac` 生成 `dist/mac-arm64/OMP Desktop.app`。使用 Finder 双击该 `.app` 后，进程实际运行的是包内 `Contents/MacOS/OMP Desktop`；Renderer 加载 `app.asar/out/renderer/index.html`；OMP 以 `--resume` 接回已落盘的原生会话。最后构建仍为未签名目录包。
- JSONL、UTF-8 跨块、v2 chunk 重组及截断／乱序错误由 `src/host/frame-decoder.test.ts` 检查。尚未用真实 OMP 产生超大 v2 输出进行端到端验证。

## 先行 RPC 实验

运行 `prototype/rpc-ui-probe.cjs`，结果保存在同目录的 `rpc-ui-*-result.json`：

交互帧字段参考 [Pi RPC Extension UI 文档](https://pi.dev/docs/latest/rpc-extension-ui)；当前 OMP 18.3.0 的具体行为仍以下面的本机探针结果为准。

| 场景 | 实测结果 |
| --- | --- |
| 内置工具审批 | `rpc-ui` 发送 `extension_ui_request` 的 `select`；Approve 后 `bash` 实际执行，Deny 和 Cancel 均未执行。 |
| 内置 `ask` | OMP 发送 `select` 问题，返回 Alpha 后工具结果为 `User selected: Alpha`。 |
| 排队与干预 | 同轮两条 `followUp` 与一条 `steer` 均立即确认接受；模型实际消费顺序为当前请求、steer、followUp A、followUp B。确认接受与开始处理不是同一事件。 |
| 停止 | 只存在两条 follow-up 时，`abort` 后原生队列仍为 2，下一次普通 prompt 后才顺序处理；同时存在 steer 时，队列可能在 abort 后立即继续。不能把停止解释为清空队列或回滚副作用。 |

## 可见 GUI、真实 OMP 实验

| 场景 | 观察与交叉证据 |
| --- | --- |
| 开发闭环 | GUI 要求读取 `sample.txt`、改 `value=before` 为 `value=after` 并运行 `./check.sh`；GUI 出现 read/edit/bash 卡片与完成回答，磁盘最终为 `value=after`，检查脚本退出码 0。 |
| 内置提问 | 模型调用内置 `ask`，GUI 出现 Alpha/Beta；选择 Beta 后 OMP 回复“你选择了 Beta”。另一轮 Yes/No 问题在窗口刷新后仍显示，选 Yes 后回复“你选择了 Yes”。 |
| 排队追加 | 前台 `sleep 8` 期间追加需求，GUI 先显示“已接受，等待 OMP 处理”，随后两轮按顺序完成；磁盘 `queue-order.txt` 为 `first\nsecond`。 |
| 干预 | 前台 `sleep 12; printf old > steer-marker.txt` 期间发送明确 steer，OMP 后续处理干预并回复“已调整”；本次 `steer-marker.txt` 未出现，相关 sleep 进程未存活。已经发生的副作用仍无回滚保证。 |
| 停止 | `sleep 30; printf complete > stopped-marker.txt` 运行中点击停止，工具显示 `Command aborted`，目标文件不存在，测试 sleep 进程退出。 |
| 刷新与草稿 | Cmd+R 后 OMP PID 与会话不变，历史和待回答交互恢复；多行粘贴、撤销／重做成功，未发送草稿刷新后仍在。自动化无法替代真实中文输入法组合验收。 |
| 关窗与退出 | 关窗日志显示 `window-hidden` 且 OMP PID 不变，重新激活显示 `window-shown` 且历史仍在。退出对话的取消、等待、停止三路均走通：等待分支的 `exit-wait.txt` 为 `waited`；停止分支原排队文件与正在执行的目标文件均未出现，OMP 退出码 143；取消后原任务和队列继续完成。待回答 `ask` 下选“等待完成后退出”，回答 Yes 后日志记录 `quit-start`、`omp-exit` 码 0。重新激活由应用激活操作验证，未实际点击 Dock 图标。 |
| 原生恢复 | 真正退出后重新启动，沿用相同 sessionFile 加载原生历史，随后打包应用中的新需求读取 `queue-order.txt` 并正确回答。最后一次打包构建又完成真实模型回合，回答 `READY`。 |
| 无效 OMP 路径 | 在测试应用元数据中暂设不存在的 `/tmp/d-pi-missing-omp` 后启动打包应用，GUI 显示“连接已中断”和“无法运行 OMP：/tmp/d-pi-missing-omp”；随后恢复原元数据并重启，原会话正常接回。尚未通过 GUI 选择器完成同屏纠正与重试。 |
| 异常退出 | OMP SIGKILL 后 GUI 显示连接中断与显式恢复；Host SIGKILL 于前台 `sleep 40` 中时，Main 重新创建 Host，旧 OMP 与测试 sleep 消失，`host-crash-marker.txt` 未出现；显式恢复后加载原生历史，没有自动重放。 |

应用生命周期日志位于 `~/Library/Application Support/d-pi/lifecycle.jsonl`，记录 Host/OMP PID、关窗／重开与退出事件；它不是性能或安全审计日志。

## 尚未完成的验收

- GUI 内的工具审批批准／拒绝／取消，以及 `confirm`、`input`、`editor` 的刷新、重复点击、超时路径；目前内置审批的真实执行证据来自隔离 RPC 实验，GUI 实测为 `ask`。
- 无效路径后的 GUI 同屏纠正与重试、无效配置目录、无模型／登录状态的启动；发送响应前后断连的精确结果归类。
- 真实中文输入法组合、选区和复制、阅读旧输出时持续流式更新、长输出/慢消费者压力。当前 Host 会合并 45ms 内的文本更新，但 MessagePort 积压及完整会话镜像内存仍未做可靠上界。一次背压实现尝试在真实运行中出现界面更新滞后，已撤回；不能据此宣称高吞吐完成。
- 真实 OMP 大帧、异常协议注入与序号缺口端到端；受管理进程组清理只在上述常规停止、退出与 Host 崩溃场景验证，独立转交的后台服务不在清理承诺内。

因此，阶段 1 的核心单会话开发路径已在开发环境和本地 `.app` 上跑通；规格中上述边界验收尚未关闭，不能把阶段 1 标为全部完成。
