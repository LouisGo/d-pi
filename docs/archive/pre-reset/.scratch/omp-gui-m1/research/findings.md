# M1 接入研究与原型证据

日期：2026-09-24。结论仅覆盖本次读取的版本与运行场景。

## 外部事实

- 本机 `omp --version` 实际返回 **18.3.0**；可执行路径为 `/opt/homebrew/bin/omp`。符号链接所在目录名是旧版本名，版本判断以实际输出为准。
- [OMP 18.3.0 RPC 文档](https://github.com/can1357/oh-my-pi/blob/v18.3.0/docs/rpc.md)：stdio JSONL；ready 宣告协议能力；v2 支持大消息分片；请求按 ID 关联；prompt 接受不等于执行完成；关闭 stdin 后需持续读取 stdout，排空已接受命令后才退出。
- 同一文档提供 `select / confirm / input / editor / cancel` 交互协议；宿主无需自行实现 Agent 或工具。`agent_end.isTerminal === false` 不能当作最终完成。
- [模型配置文档](https://github.com/can1357/oh-my-pi/blob/v18.3.0/docs/models.md)与[扩展文档](https://github.com/can1357/oh-my-pi/blob/v18.3.0/docs/extensions.md)用于构造隔离的本地模型响应和确认交互测试，不读取或复制用户凭据。
- [Electron utilityProcess 文档](https://www.electronjs.org/docs/latest/api/utility-process)：utility process 提供 Node.js 环境和 MessagePort 通信。其隔离不自动等于 OMP 子进程树清理或任务无缝恢复。
- [FaqFirebase/pi-desktop](https://github.com/FaqFirebase/pi-desktop)公开声明支持 Pi/OMP RPC、分片和原生会话；本次仅作为适配参考，没有运行或评定其体验，也没有据此决定 fork。

## 实际运行

原型：[入口](../prototype/main.cjs)、[Host](../prototype/host.cjs)、[结果](../prototype/result.json)。使用缓存中的 Electron **42.11.1**，macOS arm64，真实 `utilityProcess`、隐藏 BrowserWindow 和真实 OMP 18.3.0。

通过的行为：

1. Renderer preload 的 MessagePort → utility process → OMP RPC v2 → 原路返回。
2. OMP 连接本地 HTTP 固定响应完成一次 Agent 对话；此测试没有调用真实模型提供商。
3. 显式加载的测试扩展发起 confirm，窗口侧按请求 ID 回答后，OMP 确认收到 true。
4. RPC bash 执行期间重载 Renderer，重建通道后 OMP PID 不变，状态查询仍成功。
5. `abort_bash` 让等待中的命令返回 `cancelled: true`。
6. 取消后关闭 stdin、继续消费 stdout，OMP 以 code 0 退出。
7. 新建 utility process 和 OMP，通过 OMP 原生 resume 恢复相同 session ID、固定助手回答和 bash 记录。

原型只在 preload 端自动收发，不包含实际 GUI 控件；Main 中额外收集事件供断言使用，不是正式产品的数据转发设计。

## 两个影响实现的发现

**没有可用模型配置时不能进入 ready。** 首次隔离配置启动直接退出，错误为 `No models available`。首版必须识别启动失败并保留草稿，不能无限显示“连接中”。正式应用沿用用户现有配置；原型使用独立配置和本地固定响应。

**会话路径不等于已保存会话。** 最初只有 bash 的样本恢复后 ID 不一致；[SessionManager 源码](https://github.com/can1357/oh-my-pi/blob/v18.3.0/packages/coding-agent/src/session/session-manager.ts)明确说明新会话默认等到助手消息或显式强制创建才落盘。改为完成一次真实 OMP 对话（模型传输为固定响应）后恢复通过。GUI 应只将已核实的原生记录作为恢复目标；未开始工作的草稿由客户端保存，不能伪造会话文件。

## 验证限制与完成门槛

- 没有验证真实模型、实际读写工具链与正式 GUI 的输入、选区、渲染、滚动体验。
- `abort_bash` 是 RPC bash 命令的取消证据，不能代替 Agent `abort`、模型调用取消或所有工具的停止验证。
- 没有测量高频流式性能；没有完成 v2 分片重组或断序重同步。
- 没有验证 Host 崩溃、OMP 异常退出和整个后代进程树清理；原型 finally 的强制终止仅用于测试资源回收，不可直接复用为正式退出策略。
- 恢复证明的是进程重启后的原生记录读取，不是运行中命令的无缝续跑，也不是原生 TUI 完整兼容证明。
- 这些项目是 M1 的验收工作，不要求为其扩展多会话、跨平台或第二套运行时。
