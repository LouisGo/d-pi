# 集成终端固定源码核实

核实日期：2026-10-07。用于D-40/B的依据追溯，不继续扩展方案比较。以下SHA是本轮重新从官方Git tree核实并读取文件的固定快照，**不声称各项目最新HEAD**。文件URL、字节数与SHA-256见[来源清单](../../.scratch/integrated-terminal/evidence/source-manifest.json)，无需依赖临时下载目录。没有运行这些产品或对它们做同条件性能测量。

## 官方实现事实

- **VS Code**，`50f37bcc26c75b91937883a8974c969af300d4d4`：[ElectronPtyHostStarter](https://github.com/microsoft/vscode/blob/50f37bcc26c75b91937883a8974c969af300d4d4/src/vs/platform/terminal/electron-main/electronPtyHostStarter.ts#L50)启动UtilityProcess并连接MessagePort；[terminalProcess](https://github.com/microsoft/vscode/blob/50f37bcc26c75b91937883a8974c969af300d4d4/src/vs/platform/terminal/node/terminalProcess.ts#L325)累计未确认输出并pause，[ACK后resume](https://github.com/microsoft/vscode/blob/50f37bcc26c75b91937883a8974c969af300d4d4/src/vs/platform/terminal/node/terminalProcess.ts#L579)；[workbench中的xtermTerminal](https://github.com/microsoft/vscode/blob/50f37bcc26c75b91937883a8974c969af300d4d4/src/vs/workbench/contrib/terminal/browser/xterm/xtermTerminal.ts#L246)创建browser xterm。PTY在UT并不表示终端页面另有专属Renderer。
- **T3 Code**，`cd41c4ada0c70cc2eec95ecd7266f3dab010c58c`：[DesktopBackendConfiguration](https://github.com/pingdotgg/t3code/blob/cd41c4ada0c70cc2eec95ecd7266f3dab010c58c/apps/desktop/src/backend/DesktopBackendConfiguration.ts#L582)配置Electron executable及Node-mode环境；[DesktopBackendManager](https://github.com/pingdotgg/t3code/blob/cd41c4ada0c70cc2eec95ecd7266f3dab010c58c/apps/desktop/src/backend/DesktopBackendManager.ts#L493)经ChildProcessSpawner启动普通后端子进程；[NodePtyAdapter](https://github.com/pingdotgg/t3code/blob/cd41c4ada0c70cc2eec95ecd7266f3dab010c58c/apps/server/src/terminal/NodePtyAdapter.ts#L274)在server层spawn node-pty。当前[GhosttyRuntime](https://github.com/pingdotgg/t3code/blob/cd41c4ada0c70cc2eec95ecd7266f3dab010c58c/apps/web/src/terminal/ghostty/runtime.ts#L1)加载Ghostty WASM，不是xterm页面。[OutputProtocol](https://github.com/pingdotgg/t3code/blob/cd41c4ada0c70cc2eec95ecd7266f3dab010c58c/apps/server/src/terminal/OutputProtocol.ts#L5)有分块/字节窗口与RPC ACK；仅此不能证明PTY到最终绘制全链已受限。
- **DeepSeek官方Harness Desktop**，`5badb15009ae1756c3afe0ae0cef1faafc290ccc`，来源是`deepseek-ai/deepseek-harness`：[host-process](https://github.com/deepseek-ai/deepseek-harness/blob/5badb15009ae1756c3afe0ae0cef1faafc290ccc/apps/desktop/src/host-process.ts#L186)用Node-mode子进程启动共享Web Host，[node-environment](https://github.com/deepseek-ai/deepseek-harness/blob/5badb15009ae1756c3afe0ae0cef1faafc290ccc/apps/desktop/src/node-environment.ts#L15)设置ELECTRON_RUN_AS_NODE；[subprocess-local terminal](https://github.com/deepseek-ai/deepseek-harness/blob/5badb15009ae1756c3afe0ae0cef1faafc290ccc/packages/subprocess/subprocess-local/src/terminal.ts#L1)实现node-pty seam。[BrowserTerminal](https://github.com/deepseek-ai/deepseek-harness/blob/5badb15009ae1756c3afe0ae0cef1faafc290ccc/packages/api/terminal-controller/src/terminal.ts#L36)用headless/serialize生成有序屏幕，[TerminalFollower](https://github.com/deepseek-ai/deepseek-harness/blob/5badb15009ae1756c3afe0ae0cef1faafc290ccc/packages/api/terminal-controller/src/stream.ts#L24)超限明确关闭慢消费者；[页面xterm.write callback](https://github.com/deepseek-ai/deepseek-harness/blob/5badb15009ae1756c3afe0ae0cef1faafc290ccc/packages/client/ui-sidebar-terminal/src/client/terminal.tsx#L133)确认处理。其Web产品服务结构不复制到d-pi。
- **Zed**，`8323e2327761aa297bb80b2eb0c9acc20bca4eb9`：[alacritty adapter](https://github.com/zed-industries/zed/blob/8323e2327761aa297bb80b2eb0c9acc20bca4eb9/crates/terminal/src/alacritty.rs#L214)创建EventLoop并spawn后台I/O线程；[terminal_element](https://github.com/zed-industries/zed/blob/8323e2327761aa297bb80b2eb0c9acc20bca4eb9/crates/terminal_view/src/terminal_element.rs)在GPUI绘制。Rust线程与原生UI的组织不能换算为Electron多Renderer收益。

以上只证明各自代码的运行位置与机制。B在d-pi的收益、共享Renderer响应性、headless双解析成本、吞吐、RSS和故障清理，均是设计推断/待验项，按[验证设计](../validation/terminal.md)证明。

## d-pi当前实现基线

固定 `598323321c8c2ba6eb177097e2042510c3b79d87`：

- [host-connection](../../src/modules/execution/main/transport/host-connection.ts)已在Main创建utility SessionHost，[RuntimeService](../../src/modules/execution/main/runtime/runtime-service.ts)管理OMP范围；这些是既有接入，不是TerminalHost实现。
- [ThreadRepository](../../src/modules/threads/main/thread-repository.ts)保存目录/执行grant，[identifyDirectory](../../src/platform/node/filesystem/directory.ts)取得realpath/device/inode；[managed-process](../../src/platform/node/processes/managed-process.ts)有受管进程身份/组能力，终端PTY的复用仍需兼容性验证。
- [application](../../src/app/main/lifecycle/application.ts)现有退出聚合针对runtime/附件/诊断；[QuitCoordinator](../../src/app/main/lifecycle/quit.ts)支持wait/stop/cancel，当前没有用户shell资源。
- [package](../../package.json)固定Electron 44.4.5，没有node-pty/xterm；[electron-vite](../../electron.vite.config.ts)仅Main与session-host入口；[electron-builder](../../electron-builder.yml)启用asar、npmRebuild=false、排除node_modules并保留OMP SDK资源，mac.identity=null。新PTY不能沿用这些设置就宣称已打包/签名。
- `architecture/modules.json`没有terminal模块，`src/modules/terminal`不存在。此次只更新文档，不添加空目录、公开面或机器依赖登记。

## 官方API约束与未验证项

[Electron utilityProcess](https://www.electronjs.org/docs/latest/api/utility-process)提供Node与MessagePort，Main在app ready后启动；其kill不是全部shell后代清理的证明，macOS加载未签名库选项默认关闭。[node-pty](https://github.com/microsoft/node-pty)需要匹配native运行环境、并非线程安全且使用用户OS权限；不放共享worker、不称为沙箱。[xterm flowcontrol](https://xtermjs.org/docs/guides/flowcontrol/)将write回调用于消费确认，pause可能阻塞生产方；[安全指南](https://xtermjs.org/docs/guides/security/)要求认真限制页面与宿主接入。[parser hooks](https://xtermjs.org/docs/guides/hooks/)提供序列适配入口，查询应答隔离仍须固定版本核实。

这些官网页为2026-10-07读取的动态指南，不锁定终端依赖版本。后续实现锁定node-pty/browser/headless/serialize兼容版本与许可证；验证native ABI、项目代码前登记、正常/alternate屏幕恢复、应答单写、cell/字符串硬界和macOS IME。当前未做native或性能实验，不能把这些未知写成“官方产品已证明d-pi通过”。
